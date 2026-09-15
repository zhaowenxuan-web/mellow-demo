export interface ClassificationResult {
  candidates: { unitId: string; confidence: number; reasoning: string }[];
}

export interface RefinementResult {
  refinedContent: string;
  changesMade: string;
}

export interface ExpansionResult {
  ideas: string[];
}

export const geminiService = {
  /**
   * Classify an inspiration into potential units.
   */
  async classifyInspiration(content: string, units: { id: string, title: string, description: string, content?: string }[]): Promise<ClassificationResult> {
    if (units.length === 0) {
      console.warn("No units available for classification.");
      return { candidates: [] };
    }
    
    // Classification only needs the unit's identity and scope. Sending existing
    // note content makes the prompt much larger without materially improving routing.
    const unitContext = units.map(u =>
      `[${u.id}] ${u.title}：${(u.description || '无描述').slice(0, 120)}`
    ).join('\n');
    
    const prompt = `
      将这条灵感匹配到最合适的 1-3 个收纳单元。
      灵感："${content}"
      收纳单元：
      ${unitContext}
      根据意图、领域和用途判断；即使关联较弱也返回最接近的候选。
      只返回 JSON：
      { "candidates": [{ "unitId": "ID", "unitTitle": "标题", "confidence": 0.0-1.0, "reasoning": "简明扼要的分类理由" }] }
    `;

    console.log("AI Classification Input (Qwen Turbo):", { content, unitsCount: units.length });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const aiText = data.choices[0]?.message?.content;
      
      if (!aiText) {
        throw new Error("Empty response from AI");
      }

      console.log("AI Raw Response (Qwen Turbo):", aiText);
      
      // Try to extract JSON if it's wrapped in markdown code blocks
      let jsonStr = aiText;
      const jsonMatch = aiText.match(/```json\n?([\s\S]*?)\n?```/) || aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1] || jsonMatch[0];
      }

      const result = JSON.parse(jsonStr);
      
      if (result.candidates && result.candidates.length > 0) {
        // Try to match by ID first, then by Title as fallback
        const processedCandidates = result.candidates.map((c: any) => {
          let matchedUnit = units.find(u => u.id === c.unitId);
          if (!matchedUnit) {
            matchedUnit = units.find(u => u.title === c.unitTitle);
          }
          if (matchedUnit) {
            return { unitId: matchedUnit.id, confidence: c.confidence, reasoning: c.reasoning };
          }
          return null;
        }).filter((c: any) => c !== null);

        if (processedCandidates.length > 0) {
          return { candidates: processedCandidates };
        }
      }
    } catch (e) {
      console.warn("Qwen classification failed, using local fallback:", e);
    }

    // Last resort: rank every unit locally so the confirmation panel never opens empty.
    const normalize = (value: string) => value.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
    const toBigrams = (value: string) => {
      const normalized = normalize(value);
      return Array.from({ length: Math.max(0, normalized.length - 1) }, (_, index) => normalized.slice(index, index + 2));
    };
    const normalizedContent = normalize(content);
    const contentBigrams = toBigrams(content);
    const contentCharacters = [...new Set(normalizedContent.split(''))];
    const localMatches = units
      .map(u => {
        const normalizedTitle = normalize(u.title);
        const normalizedScope = normalize(`${u.title}${u.description || ''}`);
        const scopeBigrams = new Set(toBigrams(normalizedScope));
        const bigramHits = contentBigrams.filter(part => scopeBigrams.has(part)).length;
        const characterHits = contentCharacters.filter(char => normalizedScope.includes(char)).length;
        const directTitleMatch = normalizedTitle && normalizedContent.includes(normalizedTitle) ? 0.75 : 0;
        const bigramScore = contentBigrams.length > 0 ? (bigramHits / contentBigrams.length) * 0.5 : 0;
        const characterScore = contentCharacters.length > 0 ? (characterHits / contentCharacters.length) * 0.2 : 0;
        const score = directTitleMatch + bigramScore + characterScore;
        return {
          unitId: u.id,
          confidence: Math.min(0.9, Math.max(0.2, 0.2 + score)),
          reasoning: score > 0.15 ? "根据标题与描述的文本关联提供候选" : "AI 响应超时，提供相近单元供确认"
        };
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    console.log("Using local fallback matches:", localMatches);
    return { candidates: localMatches };
  },

  /**
   * Refine messy thoughts into coherent text (Streaming).
   * Calls local proxy to avoid CORS and protect keys.
   */
  async *refineContentStream(content: string): AsyncGenerator<string> {
    const prompt = `
      将以下凌乱的灵感精炼成一段连贯、结构良好的文字。
      尽量保持原意和原表述，但提高流畅度和逻辑关联。
      
      内容: "${content}"
      
      直接输出精炼后的文字内容，不要包含 JSON 格式，不要包含任何前缀或后缀。
    `;

    try {
      const response = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            // Match "data: ..." or "data:..."
            const match = trimmedLine.match(/^data:\s*(.*)$/);
            if (match) {
              const data = match[1].trim();
              if (data === "[DONE]") continue;
              try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.text || "";
                if (content) yield content;
              } catch (e) {
                console.warn("Parse error in refine stream:", e, "Line:", trimmedLine);
              }
            } else {
              // Try parsing as raw JSON if it doesn't have the data: prefix
              try {
                const json = JSON.parse(trimmedLine);
                const content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.text || "";
                if (content) yield content;
              } catch (e) {}
            }
          }
        }
      }
    } catch (error) {
      console.error("Refinement failed:", error);
      yield "（整理功能暂时不可用，请检查网络或稍后重试）";
    }
  },

  /**
   * Expand on an idea with related thoughts (Streaming).
   * Calls local proxy to avoid CORS and protect keys.
   */
  async *expandIdeaStream(content: string): AsyncGenerator<string> {
    const prompt = `
      你是一个比用户经验丰富更有思想的前辈，你善于教导，帮用户发现他们自己还没意识到的东西。
      用户写下了一条灵感，请给出最多3个点，帮助他深入思考。

      要求：
      - 不要解释或总结用户已经说过的内容
      - 不要用比喻、排比、对仗等修辞手法
      - 每条都是一个新的切入点，不要重复
      - 语气像朋友在聊天，口语化，直接
      - 每条 30 字以内

      好的联想方向包括但不限于：
      - 这个问题、想法的本质是什么
      - 有什么隐藏前提
      - 这个选择的代价或收益是什么
      - 这个想法背后用户真正在意的是什么

      内容: "${content}"
      
      直接输出精炼后的文字内容，不要包含 JSON 格式，不要包含任何前缀或后缀。
    `;
    try {
      const response = await fetch("/api/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            const match = trimmedLine.match(/^data:\s*(.*)$/);
            if (match) {
              const data = match[1].trim();
              if (data === "[DONE]") continue;
              try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.text || "";
                if (content) yield content;
              } catch (e) {
                console.warn("Parse error in expand stream:", e, "Line:", trimmedLine);
              }
            } else {
              try {
                const json = JSON.parse(trimmedLine);
                const content = json.choices?.[0]?.delta?.content || json.choices?.[0]?.text || "";
                if (content) yield content;
              } catch (e) {}
            }
          }
        }
      }
    } catch (error) {
      console.error("Expansion failed:", error);
      yield "（联想功能暂时不可用，请检查网络或稍后重试）";
    }
  }
};
