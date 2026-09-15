import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Keys (优先从环境变量读取)
  const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;
  const QWEN_API_KEY = process.env.QWEN_API_KEY;

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", hasZhipu: !!ZHIPU_API_KEY, hasQwen: !!QWEN_API_KEY, env: process.env.NODE_ENV || "development" });
  });

  // 整理功能 (智谱 GLM-4-Flash)
  app.post("/api/refine", async (req, res) => {
    const { prompt } = req.body;
    console.log("Refine request received");
    try {
      const response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ZHIPU_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "glm-4-flash",
          messages: [{ role: "user", content: prompt }],
          stream: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Zhipu API error:", errorText);
        res.status(response.status).send(errorText);
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Content-Type-Options", "nosniff");

      const body = response.body;
      if (body) {
        const reader = body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (error) {
      console.error("Refinement proxy error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 联想功能 (阿里千问 qwen-max)
  app.post("/api/expand", async (req, res) => {
    const { prompt } = req.body;
    console.log("Expand request received");
    try {
      const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${QWEN_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "qwen-max",
          messages: [{ role: "user", content: prompt }],
          stream: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Qwen API error response:", errorText);
        res.status(response.status).send(errorText);
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Content-Type-Options", "nosniff");

      const body = response.body;
      if (body) {
        const reader = body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (error) {
      console.error("Expansion proxy error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // 分类功能 (阿里千问 qwen-turbo，低延迟非思考模式)
  app.post("/api/classify", async (req, res) => {
    const { prompt } = req.body;
    console.log("Classify request received (qwen-turbo)");
    try {
      const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${QWEN_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "qwen-turbo",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 320,
          response_format: { type: "json_object" }
        })
      });
      if (!response.ok) {
        res.status(response.status).send(await response.text());
        return;
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Classification proxy error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
