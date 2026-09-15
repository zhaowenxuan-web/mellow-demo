/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { dataStore, Unit, Inspiration, VALID_CODES, DEMO_SPACE_CODE } from './lib/storage';
import { geminiService } from './services/geminiService';
import { ProductInfo } from './components/ProductInfo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Send, Sparkles, Wand2, Trash2, FolderPlus, 
  MoreVertical, Search, History, Inbox, Copy, LogOut,
  Lightbulb, User as UserIcon, Edit2, CloudUpload
} from 'lucide-react';
import { format } from 'date-fns';

const createFreshSpaceCode = () => {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.slice(-8);

  return `MELLOW-NEW-${suffix.toUpperCase()}`;
};

export default function App() {
  const [invitationCode, setInvitationCode] = useState<string | null>(localStorage.getItem('mellow_demo_invite_code'));
  const [loginInput, setLoginInput] = useState('');
  const [freshSpaceCode] = useState(createFreshSpaceCode);
  const [loading, setLoading] = useState(true);
  const [loadingGuideOpen, setLoadingGuideOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [localSyncSummary, setLocalSyncSummary] = useState({ units: 0, inspirations: 0 });
  const [isSyncingLocalData, setIsSyncingLocalData] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('capture');
  const [aiSuggestion, setAiSuggestion] = useState<{ type: 'refine' | 'expand', content: string } | null>(null);
  const [editingInspiration, setEditingInspiration] = useState<Inspiration | null>(null);
  const [quickCreateUnitOpen, setQuickCreateUnitOpen] = useState(false);
  const [pendingInsForUnit, setPendingInsForUnit] = useState<Inspiration | null>(null);
  const [newUnitTitle, setNewUnitTitle] = useState('');
  const [newUnitDesc, setNewUnitDesc] = useState('');
  const [confirmClassificationOpen, setConfirmClassificationOpen] = useState(false);
  const [quickNotifyOpen, setQuickNotifyOpen] = useState(false);
  const [currentClassification, setCurrentClassification] = useState<{
    inspirationId: string;
    content: string;
    candidates: { unitId: string; title: string; confidence: number; reasoning: string }[];
  } | null>(null);
  const [allUnitsSearch, setAllUnitsSearch] = useState('');
  const [unitSearchQuery, setUnitSearchQuery] = useState('');
  const [inboxUnitSearch, setInboxUnitSearch] = useState('');
  const [manualUnitSearch, setManualUnitSearch] = useState('');
  const [activeDeleteId, setActiveDeleteId] = useState<string | null>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);
  
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const longPressTimer = useRef<any>(null);

  // Clear active delete mode when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => setActiveDeleteId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const startLongPress = (id: string) => {
    longPressTimer.current = setTimeout(() => {
      setActiveDeleteId(id);
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }, 600);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  // Database Connection Check
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const result = await dataStore.checkConnection();
        if (result.ok) {
          console.log('Database status:', result.message);
        } else {
          console.log('Database notice:', result.message);
        }
      } catch (err) {
        console.warn('Connection check bypassed:', err);
      }
    };
    checkConnection();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!invitationCode) {
      setUnits([]);
      setInspirations([]);
      setLoading(false);
      return;
    }

    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const [unitsData, insData] = await Promise.all([
          dataStore.loadUnits(invitationCode),
          dataStore.loadInspirations(invitationCode)
        ]);

        setUnits(unitsData);
        setInspirations(insData);
      } catch (err) {
        console.error('Error fetching data:', err);
        toast.error('获取数据失败');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();

    // Real-time subscriptions if Supabase is configured
    if (isSupabaseConfigured) {
      try {
        const unitsChannel = supabase
          .channel('units_changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'units', filter: `invitation_code=eq.${invitationCode}` }, (payload) => {
            if (payload.eventType === 'INSERT') {
              setUnits(prev => [payload.new as Unit, ...prev.filter(u => u.id !== payload.new.id)]);
            } else if (payload.eventType === 'UPDATE') {
              setUnits(prev => prev.map(u => u.id === payload.new.id ? payload.new as Unit : u));
            } else if (payload.eventType === 'DELETE') {
              setUnits(prev => prev.filter(u => u.id === payload.old.id));
            }
          })
          .subscribe();

        const insChannel = supabase
          .channel('ins_changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'inspirations', filter: `invitation_code=eq.${invitationCode}` }, (payload) => {
            if (payload.eventType === 'INSERT') {
              setInspirations(prev => {
                if (prev.some(i => i.id === payload.new.id)) return prev;
                return [payload.new as Inspiration, ...prev];
              });
            } else if (payload.eventType === 'UPDATE') {
              setInspirations(prev => prev.map(i => i.id === payload.new.id ? payload.new as Inspiration : i));
            } else if (payload.eventType === 'DELETE') {
              setInspirations(prev => prev.filter(i => i.id === payload.old.id));
            }
          })
          .subscribe();

        return () => {
          supabase.removeChannel(unitsChannel);
          supabase.removeChannel(insChannel);
        };
      } catch (e) {
        console.warn('Realtime subscription skipped:', e);
      }
    }
  }, [invitationCode]);

  const handleLogin = async (selectedCode?: string) => {
    const code = (selectedCode ?? loginInput).trim().toUpperCase();
    if (!code) return;

    setIsLoggingIn(true);
    try {
      console.log('Attempting login with code:', code);
      const isValid = await dataStore.verifyLogin(code);
      if (isValid) {
        proceedLogin(code);
      } else {
        toast.error('无效的空间码');
      }
    } catch (err) {
      console.error('Login error details:', err);
      // Fallback for valid code formats
      if (VALID_CODES.includes(code) || code.startsWith('MELLOW-')) {
        proceedLogin(code);
      } else {
        toast.error('登录验证失败，请重试');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const proceedLogin = (code: string) => {
    setInvitationCode(code);
    localStorage.setItem('mellow_demo_invite_code', code);
    toast.success('已进入空间');
  };

  const handleLogout = () => {
    setInvitationCode(null);
    localStorage.removeItem('mellow_demo_invite_code');
  };

  const openLocalSyncDialog = () => {
    if (!invitationCode) return;
    setLocalSyncSummary(dataStore.getLocalDataSummary(invitationCode));
    setSyncDialogOpen(true);
  };

  const syncLocalDataToCloud = async () => {
    if (!invitationCode) return;
    setIsSyncingLocalData(true);
    try {
      const result = await dataStore.migrateLocalDataToCloud(invitationCode);
      const [cloudUnits, cloudInspirations] = await Promise.all([
        dataStore.loadUnits(invitationCode),
        dataStore.loadInspirations(invitationCode),
      ]);
      setUnits(cloudUnits);
      setInspirations(cloudInspirations);
      setSyncDialogOpen(false);
      toast.success('本地数据已同步到云端', {
        description: `单元 ${result.units} 个，灵感 ${result.inspirations} 条`,
      });
    } catch (err) {
      console.error('Local data migration failed:', JSON.stringify(err));
      toast.error('同步失败', {
        description: err instanceof Error
          ? err.message
          : err && typeof err === 'object' && 'message' in err
            ? String(err.message)
            : '请稍后重试',
      });
    } finally {
      setIsSyncingLocalData(false);
    }
  };

  const handleSubmit = async () => {
    if (!input.trim() || !invitationCode) return;
    setIsProcessing(true);
    const contentToSave = input.trim();
    setInput('');
    setAiSuggestion(null);
    let progressInterval: ReturnType<typeof setInterval> | undefined;

    try {
      let progress = 0;
      progressInterval = setInterval(() => {
        progress += (90 - progress) * 0.1;
        setProcessProgress(progress);
      }, 200);

      // Start classification immediately instead of waiting for the database write.
      const classificationPromise = geminiService.classifyInspiration(contentToSave, units);
      const newIns = await dataStore.createInspiration(invitationCode, contentToSave, null, 'pending');

      // Immediate UI update
      setInspirations(prev => {
        if (prev.some(i => i.id === newIns.id)) return prev;
        return [newIns, ...prev];
      });

      toast.success('灵感已记录', {
        description: '正在由 AI 自动分析分类...'
      });

      const classification = await classificationPromise;
      
      clearInterval(progressInterval);
      setProcessProgress(100);
      setTimeout(() => setProcessProgress(0), 500);

      const candidates = classification.candidates
        .map(c => {
          const unit = units.find(u => u.id === c.unitId);
          return unit ? { unitId: unit.id, title: unit.title, confidence: c.confidence, reasoning: c.reasoning } : null;
        })
        .filter((c): c is { unitId: string; title: string; confidence: number; reasoning: string } => c !== null);

      if (units.length > 0) {
        setCurrentClassification({
          inspirationId: newIns.id,
          content: contentToSave,
          candidates: candidates.length > 0 ? candidates : []
        });
        setQuickNotifyOpen(true);
      } else {
        toast.info('灵感已记录，暂无收纳单元可供分类');
      }

    } catch (err) {
      console.error('Submit error:', err);
      toast.error('提交失败，请重试');
      setInput(contentToSave);
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = async (unitId: string) => {
    if (!input.trim() || !invitationCode) return;
    setIsProcessing(true);
    const contentToSave = input.trim();
    setInput('');
    setAiSuggestion(null);

    try {
      // 1. Insert inspiration
      const newIns = await dataStore.createInspiration(invitationCode, contentToSave, unitId, 'archived');

      // Update state
      setInspirations(prev => {
        if (prev.some(i => i.id === newIns.id)) return prev;
        return [newIns, ...prev];
      });

      // 2. Update unit content
      const unit = units.find(u => u.id === unitId);
      const newContent = unit?.content ? `${unit.content}\n\n${contentToSave}` : contentToSave;
      
      await dataStore.updateUnit(unitId, invitationCode, { content: newContent });

      // Update unit state
      setUnits(prev => prev.map(u => u.id === unitId ? { ...u, content: newContent, updated_at: new Date().toISOString() } : u));

      toast.success('灵感已记录并归类');
    } catch (err) {
      console.error('Manual submit error:', err);
      toast.error('提交失败');
      setInput(contentToSave);
    } finally {
      setIsProcessing(false);
    }
  };

  const moveInspirationToUnit = async (insId: string, unitId: string, content: string) => {
    if (!invitationCode) return;
    try {
      await dataStore.updateInspiration(insId, invitationCode, { unit_id: unitId, status: 'archived' });

      // Update inspirations state
      setInspirations(prev => prev.map(i => i.id === insId ? { ...i, unit_id: unitId, status: 'archived' } : i));

      const unit = units.find(u => u.id === unitId);
      const newContent = unit?.content ? `${unit.content}\n\n${content}` : content;
      
      await dataStore.updateUnit(unitId, invitationCode, { content: newContent });

      // Update units state
      setUnits(prev => prev.map(u => u.id === unitId ? { ...u, content: newContent, updated_at: new Date().toISOString() } : u));

      toast.success('已归入收纳单元');
      setQuickNotifyOpen(false);
      setConfirmClassificationOpen(false);
      setCurrentClassification(null);
    } catch (err) {
      toast.error('归类失败');
    }
  };

  const handleRefine = async () => {
    if (!input.trim()) return;
    setIsProcessing(true);
    setAiSuggestion({ type: 'refine', content: '' });
    try {
      let fullContent = '';
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += (90 - progress) * 0.1;
        setProcessProgress(progress);
      }, 200);

      for await (const chunk of geminiService.refineContentStream(input)) {
        fullContent += chunk;
        setAiSuggestion(prev => prev ? { ...prev, content: fullContent } : { type: 'refine', content: fullContent });
        
        // Scroll to suggestion on mobile when it starts appearing
        if (fullContent.length < 50 && suggestionRef.current) {
          suggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      clearInterval(progressInterval);
      setProcessProgress(100);
      setTimeout(() => setProcessProgress(0), 500);
      
      if (!fullContent) {
        toast.error('AI 未返回有效内容，请重试');
        setAiSuggestion(null);
      } else {
        toast.info('AI 已完成“说人话”');
      }
    } catch (err) {
      toast.error('AI “说人话”失败');
      setAiSuggestion(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExpand = async () => {
    if (!input.trim()) return;
    setIsProcessing(true);
    setAiSuggestion({ type: 'expand', content: '' });
    try {
      let fullContent = '';
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += (90 - progress) * 0.1;
        setProcessProgress(progress);
      }, 200);

      for await (const chunk of geminiService.expandIdeaStream(input)) {
        fullContent += chunk;
        setAiSuggestion(prev => prev ? { ...prev, content: fullContent } : { type: 'expand', content: fullContent });
        
        // Scroll to suggestion on mobile when it starts appearing
        if (fullContent.length < 50 && suggestionRef.current) {
          suggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      clearInterval(progressInterval);
      setProcessProgress(100);
      setTimeout(() => setProcessProgress(0), 500);
      
      if (!fullContent) {
        toast.error('AI 未返回有效内容，请重试');
        setAiSuggestion(null);
      } else {
        toast.info('AI 已完成“再想下”');
      }
    } catch (err) {
      toast.error('AI “再想下”失败');
      setAiSuggestion(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const applySuggestion = () => {
    if (aiSuggestion) {
      if (aiSuggestion.type === 'refine') {
        setInput(aiSuggestion.content);
      } else {
        setInput(prev => prev + '\n\n' + aiSuggestion.content);
      }
      setAiSuggestion(null);
      toast.success('已应用 AI 建议');
    }
  };

  const createUnit = async (title: string, description: string) => {
    if (!invitationCode) {
      console.warn('Cannot create unit: No invitation code found');
      return null;
    }
    try {
      console.log('Attempting to create unit:', { title, description, invitationCode });
      const newUnit = await dataStore.createUnit(invitationCode, title, description);
      
      // Update state
      setUnits(prev => [newUnit, ...prev.filter(u => u.id !== newUnit.id)]);
      
      toast.success('新建单元成功');
      return newUnit.id;
    } catch (err) {
      console.error('Exception in createUnit:', err);
      toast.error('创建失败', {
        description: err instanceof Error ? err.message : '未知错误'
      });
      return null;
    }
  };

  const deleteInspiration = async (id: string, permanent = false) => {
    if (!invitationCode) return;
    try {
      await dataStore.deleteInspiration(id, invitationCode, permanent);
      if (permanent) {
        setInspirations(prev => prev.filter(i => i.id !== id));
      } else {
        setInspirations(prev => prev.map(i => i.id === id ? { ...i, is_deleted: true } : i));
      }
      toast.success('已删除');
    } catch (err) {
      toast.error('删除失败');
    }
  };

  const updateInspiration = async (id: string, content: string) => {
    if (!invitationCode) return;
    try {
      await dataStore.updateInspiration(id, invitationCode, { content });
      setInspirations(prev => prev.map(i => i.id === id ? { ...i, content } : i));
      setEditingInspiration(null);
      toast.success('已更新灵感');
    } catch (err) {
      toast.error('保存失败');
    }
  };

  const updateUnit = async (id: string, title: string, description: string, content?: string) => {
    if (!invitationCode) return;
    try {
      const updateData: Partial<Unit> = {
        title,
        description
      };
      if (content !== undefined) {
        updateData.content = content;
      }
      await dataStore.updateUnit(id, invitationCode, updateData);
      
      // Update state
      setUnits(prev => prev.map(u => u.id === id ? { ...u, ...updateData, updated_at: new Date().toISOString() } : u));

      if (content === undefined) {
        toast.success('单元信息已更新');
      }
    } catch (err) {
      toast.error('更新失败');
    }
  };

  const copyUnitContent = (unitId: string) => {
    const unit = units.find(u => u.id === unitId);
    if (unit) {
      navigator.clipboard.writeText(unit.content || '');
      toast.success('已复制全部内容');
    }
  };

  const togglePinUnit = async (id: string, currentPinned: boolean) => {
    if (!invitationCode) return;
    try {
      await dataStore.updateUnit(id, invitationCode, { is_pinned: !currentPinned });
      setUnits(prev => prev.map(u => u.id === id ? { ...u, is_pinned: !currentPinned, updated_at: new Date().toISOString() } : u));
      toast.success(!currentPinned ? '已置顶' : '已取消置顶');
    } catch (err) {
      toast.error('操作失败');
    }
  };

  if (loading || loadingGuideOpen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFCFB] px-5 py-10 font-sans text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 animate-spin rounded-2xl border-2 border-cyan-100 border-t-cyan-500" aria-hidden="true" />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm shadow-cyan-100">
              <Inbox className="h-6 w-6 text-cyan-600" aria-hidden="true" />
            </div>
          </div>

          <p className="mb-2 text-[10px] font-bold tracking-[0.22em] text-cyan-600">MELLOW SPACE</p>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            {loading ? '正在打开你的空间' : '空间已经准备好'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500" role="status">
            {loading ? '正在同步灵感与收纳单元，通常只需要一点时间。' : '看完产品说明，关闭后即可开始使用。'}
          </p>

          <div className="mt-7 rounded-3xl border border-cyan-100 bg-white p-5 shadow-lg shadow-cyan-100/40">
            <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-500">
              <Lightbulb className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-zinc-800">等待时，可以先看看产品说明</p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">了解如何记录、归类和整理一条灵感。</p>
            <ProductInfo className="mt-4 h-10 px-5 text-sm" onOpenChange={setLoadingGuideOpen} />
          </div>
        </motion.div>
      </div>
    );
  }

  if (!invitationCode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDFCFB] px-5 py-10 font-sans text-center">
        <Toaster position="top-center" duration={1500} />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full"
        >
          <div className="w-16 h-16 bg-cyan-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Inbox className="text-cyan-600 w-8 h-8" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 mb-4">灵感收纳箱</h1>
          <p className="text-zinc-500 mb-8 leading-relaxed">
            随手写下，灵感自己归位
          </p>
          
          <div className="grid gap-3 sm:grid-cols-2 text-left mb-6">
            <button
              type="button"
              onClick={() => handleLogin(DEMO_SPACE_CODE)}
              disabled={isLoggingIn}
              className="group rounded-3xl border border-cyan-200 bg-cyan-50/70 p-5 transition-all hover:-translate-y-0.5 hover:border-cyan-400 hover:bg-cyan-50 hover:shadow-lg hover:shadow-cyan-100 disabled:pointer-events-none disabled:opacity-60"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className="rounded-full bg-cyan-600 px-2.5 py-1 text-xs font-bold text-white">已有示例</span>
                <Sparkles className="h-5 w-5 text-cyan-600 transition-transform group-hover:scale-110" />
              </div>
              <div className="text-lg font-bold text-zinc-900 mb-1">示例空间</div>
              <div className="font-mono text-sm font-semibold text-cyan-700 break-all">{DEMO_SPACE_CODE}</div>
              <p className="mt-3 text-sm leading-6 text-zinc-500">适合快速感受产品</p>
            </button>

            <button
              type="button"
              onClick={() => handleLogin(freshSpaceCode)}
              disabled={isLoggingIn}
              className="group rounded-3xl border border-zinc-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-lg hover:shadow-zinc-200/70 disabled:pointer-events-none disabled:opacity-60"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-bold text-white">全新空白</span>
                <Plus className="h-5 w-5 text-zinc-700 transition-transform group-hover:rotate-90" />
              </div>
              <div className="text-lg font-bold text-zinc-900 mb-1">我的新空间</div>
              <div className="font-mono text-sm font-semibold text-zinc-700 break-all">{freshSpaceCode}</div>
              <p className="mt-3 text-sm leading-6 text-zinc-500">从零创建自己的内容</p>
            </button>
          </div>

          <div className="flex items-center gap-3 mb-5 text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200" />
            或输入已有空间码
            <span className="h-px flex-1 bg-zinc-200" />
          </div>

          <div className="space-y-3">
            <Input 
              type="text" 
              placeholder="输入已有空间码" 
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              className="h-12 text-center text-lg rounded-2xl border-zinc-200 focus:ring-cyan-500/20 focus:border-cyan-500"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <Button 
              onClick={() => handleLogin()} 
              disabled={isLoggingIn || !loginInput.trim()}
              className="w-full h-12 text-lg brand-gradient hover:opacity-90 text-white rounded-full border-none shadow-lg shadow-cyan-200/50"
            >
              {isLoggingIn ? '正在进入...' : '进入这个空间'}
            </Button>
          </div>
          <ProductInfo className="mt-6" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-zinc-900 font-sans selection:bg-cyan-100">
      <Toaster position="top-center" duration={1000} />
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FDFCFB]/80 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 brand-gradient rounded-lg flex items-center justify-center shadow-sm shadow-cyan-200">
              <Inbox className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">灵感收纳箱</span>
          </div>
          
          <div className="flex items-center gap-4">
            <ProductInfo />
            <div className="hidden md:flex items-center gap-1 text-xs text-zinc-400 font-mono">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              AI CLOUD SYNC
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="ghost" className="p-0 h-8 w-8 rounded-full overflow-hidden border border-zinc-200 flex items-center justify-center bg-zinc-50">
                  <UserIcon className="w-4 h-4 text-zinc-400" />
                </Button>
              } />
              <DropdownMenuContent align="end" className="w-56">
                {invitationCode && (
                  <div className="px-3 py-2 border-b border-zinc-50">
                    <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">当前空间码</div>
                    <div className="text-sm font-mono font-bold text-cyan-600">{invitationCode}</div>
                  </div>
                )}
                <DropdownMenuSeparator />
                {isSupabaseConfigured && (
                  <DropdownMenuItem onClick={openLocalSyncDialog}>
                    <CloudUpload className="w-4 h-4 mr-2 text-cyan-600" /> 同步本地数据
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                  <LogOut className="w-4 h-4 mr-2" /> 退出当前空间
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 sm:py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-8">
          <div className="flex justify-center">
            <TabsList className="bg-zinc-200/40 p-1 rounded-xl w-full sm:w-auto h-12 border-none backdrop-blur-sm">
              <TabsTrigger 
                value="capture" 
                className="flex-1 sm:flex-none rounded-lg px-8 sm:px-12 h-full text-sm font-semibold transition-all duration-200 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-zinc-500 hover:text-zinc-700"
              >
                灵感光点
              </TabsTrigger>
              <TabsTrigger 
                value="units" 
                className="flex-1 sm:flex-none rounded-lg px-8 sm:px-12 h-full text-sm font-semibold transition-all duration-200 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-zinc-500 hover:text-zinc-700"
              >
                收纳空间
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Capture Tab */}
          <TabsContent value="capture" className="space-y-10">
            <div className="space-y-6">
              <Card className="border-none shadow-2xl shadow-zinc-200/50 overflow-hidden rounded-3xl">
                <CardContent className="p-0">
                  <div className="p-4 sm:p-6 space-y-4">
                    <Textarea 
                      placeholder="在这里输入你的灵感..."
                      className="min-h-[200px] text-xl border-none focus-visible:ring-0 resize-none p-0 placeholder:text-zinc-300"
                      value={input}
                      onChange={(e) => setInput(e.target.value.slice(0, 2000))}
                    />
                    {isProcessing && (
                      <div className="h-1 w-full bg-zinc-100 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full brand-gradient"
                          initial={{ width: 0 }}
                          animate={{ width: `${processProgress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-3 pt-4 border-t border-zinc-50">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        {/* Left side: AI Actions */}
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleRefine}
                            disabled={isProcessing || !input}
                            className="rounded-full text-zinc-400 hover:text-purple-600 hover:bg-purple-50 h-8 px-2.5 text-[11px]"
                          >
                            <Wand2 className="w-3.5 h-3.5 mr-1 text-purple-300" /> 说人话
                          </Button>
                          <div className="w-px h-3 bg-zinc-100 mx-0.5" />
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleExpand}
                            disabled={isProcessing || !input}
                            className="rounded-full text-zinc-400 hover:text-cyan-600 hover:bg-cyan-50 h-8 px-2.5 text-[11px]"
                          >
                            <Sparkles className="w-3.5 h-3.5 mr-1 text-cyan-300" /> 再想下
                          </Button>
                        </div>

                        {/* Right side: Core Actions */}
                        <div className="flex items-center gap-2 flex-1 sm:flex-none">
                          <DropdownMenu onOpenChange={(open) => !open && setManualUnitSearch('')}>
                            <DropdownMenuTrigger render={
                              <Button 
                                variant="outline" 
                                size="sm" 
                                disabled={isProcessing || !input.trim()}
                                className="rounded-full border-zinc-100 bg-zinc-50/30 hover:bg-zinc-50 h-10 px-4 flex-1 sm:flex-none text-zinc-600 text-xs sm:text-sm"
                              >
                                <FolderPlus className="w-4 h-4 mr-2 text-zinc-400" /> 手动归类
                              </Button>
                            } />
                            <DropdownMenuContent align="end" className="w-64 p-2 rounded-2xl shadow-xl border-zinc-100">
                              <div className="px-2 py-2">
                                <div className="relative">
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                  <Input 
                                    placeholder="搜索收纳单元..." 
                                    className="pl-8 h-9 text-sm rounded-xl border-zinc-100 bg-zinc-50/50 focus-visible:ring-0 focus-visible:border-cyan-200"
                                    value={manualUnitSearch}
                                    onChange={(e) => setManualUnitSearch(e.target.value)}
                                    onKeyDown={(e) => e.stopPropagation()}
                                  />
                                </div>
                              </div>
                              <ScrollArea className={units.length > 5 ? "h-[240px]" : ""}>
                                <div className="space-y-1">
                                  {units
                                    .filter(u => u.title.toLowerCase().includes(manualUnitSearch.toLowerCase()))
                                    .map(u => (
                                      <DropdownMenuItem 
                                        key={u.id} 
                                        onClick={() => handleManualSubmit(u.id)}
                                        className="rounded-lg cursor-pointer"
                                      >
                                        <div className="flex flex-col">
                                          <span className="font-medium">{u.title}</span>
                                          {u.description && <span className="text-[10px] text-zinc-400 line-clamp-1">{u.description}</span>}
                                        </div>
                                      </DropdownMenuItem>
                                    ))}
                                  {units.filter(u => u.title.toLowerCase().includes(manualUnitSearch.toLowerCase())).length === 0 && (
                                    <div className="px-2 py-8 text-center text-xs text-zinc-400">
                                      未找到匹配单元
                                    </div>
                                  )}
                                </div>
                              </ScrollArea>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button 
                            onClick={handleSubmit} 
                            disabled={isProcessing || !input.trim()}
                            className="rounded-full brand-gradient hover:opacity-90 text-white px-8 h-10 border-none shadow-lg shadow-cyan-100/50 flex-1 sm:flex-none font-bold text-xs sm:text-sm"
                          >
                            {isProcessing ? '处理中...' : <><Send className="w-4 h-4 mr-2" /> 提交</>}
                          </Button>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <span className="text-[10px] text-zinc-300 font-mono tracking-tighter">
                          {input.length}/2000
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* AI Suggestion Panel */}
              <AnimatePresence>
                {aiSuggestion && (
                  <motion.div
                    ref={suggestionRef}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <Card className="border-cyan-100 bg-cyan-50/30 rounded-2xl">
                      <CardHeader className="pt-3 pb-1 px-4 flex-row items-center justify-between space-y-0">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-cyan-500" />
                          <CardTitle className="text-sm font-semibold text-cyan-700">
                            AI {aiSuggestion.type === 'refine' ? '说人话' : '再想下'}
                          </CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 pt-1">
                        <div className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed mb-5 min-h-[1.5em]">
                          {aiSuggestion.content || (isProcessing ? (
                            <div className="flex items-center gap-2 text-zinc-400 italic">
                              <div className="w-1 h-1 bg-cyan-400 rounded-full animate-bounce" />
                              <div className="w-1 h-1 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                              <div className="w-1 h-1 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                              正在思考中...
                            </div>
                          ) : "未生成内容")}
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            className="rounded-xl brand-gradient border-none text-white shadow-sm shadow-cyan-200"
                            onClick={applySuggestion}
                          >
                            应用建议
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="rounded-xl border-cyan-200 text-cyan-700 hover:bg-cyan-50"
                            onClick={() => {
                              navigator.clipboard.writeText(aiSuggestion.content);
                              toast.success('已复制建议内容');
                            }}
                          >
                            仅复制
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* History & Inbox Integrated in Capture Tab */}
            <div className="space-y-10">
              {/* Inbox */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <Inbox className="w-4 h-4" /> 待分类池 ({inspirations.filter(i => !i.unit_id && !i.is_deleted).length})
                </h3>
                <div className="grid gap-4">
                  <AnimatePresence mode="popLayout">
                    {inspirations.filter(i => !i.unit_id && !i.is_deleted).map((ins) => (
                      <motion.div
                        key={ins.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                      >
                        <Card className="group border-zinc-100 hover:border-cyan-200 transition-colors rounded-2xl">
                          <CardContent className="p-4 flex justify-between items-start gap-4">
                            <p className="text-zinc-700 leading-relaxed line-clamp-3">{ins.content}</p>
                            <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <DropdownMenu onOpenChange={(open) => !open && setInboxUnitSearch('')}>
                                <DropdownMenuTrigger render={
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                } />
                                <DropdownMenuContent align="end" className="w-56">
                                  <DropdownMenuItem className="font-medium text-cyan-600" onClick={() => {
                                    setPendingInsForUnit(ins);
                                    setNewUnitTitle('');
                                    setQuickCreateUnitOpen(true);
                                  }}>
                                    <Plus className="w-4 h-4 mr-2" /> 新建收纳单元
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <div className="px-2 py-1.5">
                                    <div className="relative">
                                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                                      <Input 
                                        placeholder="搜索单元..." 
                                        className="pl-7 h-7 text-[10px] rounded-lg border-zinc-100 bg-zinc-50/50 focus-visible:ring-0 focus-visible:border-cyan-200"
                                        value={inboxUnitSearch}
                                        onChange={(e) => setInboxUnitSearch(e.target.value)}
                                        onKeyDown={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                  </div>
                                  <ScrollArea className={units.length > 5 ? "h-[180px]" : ""}>
                                    {units
                                      .filter(u => u.title.toLowerCase().includes(inboxUnitSearch.toLowerCase()))
                                      .map(u => (
                                        <DropdownMenuItem key={u.id} onClick={() => moveInspirationToUnit(ins.id, u.id, ins.content)}>
                                          归入: {u.title}
                                        </DropdownMenuItem>
                                      ))}
                                    {units.filter(u => u.title.toLowerCase().includes(inboxUnitSearch.toLowerCase())).length === 0 && (
                                      <div className="px-2 py-4 text-center text-[10px] text-zinc-400">
                                        未找到匹配单元
                                      </div>
                                    )}
                                  </ScrollArea>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => deleteInspiration(ins.id, true)} className="text-red-600">
                                    删除
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              {/* History List */}
              <div id="history-section" className="space-y-6 scroll-mt-20">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <History className="w-4 h-4" /> 历史回顾
                  </h3>
                  <div className="relative w-48 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                    <Input 
                      placeholder="搜索..." 
                      className="pl-8 h-8 text-xs rounded-xl border-zinc-100 bg-zinc-50/50 focus-visible:ring-0 focus-visible:border-cyan-300 transition-colors"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className="max-w-3xl mx-auto space-y-8">
                  {Object.entries<Inspiration[]>(
                    inspirations
                      .filter(i => !i.is_deleted)
                      .filter(i => 
                        (i.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        units.find(u => u.id === i.unit_id)?.title.toLowerCase().includes(searchQuery.toLowerCase()))
                      )
                      .reduce((groups: Record<string, Inspiration[]>, ins) => {
                        const date = ins.created_at ? format(new Date(ins.created_at), 'yyyy-MM-dd') : '今天';
                        if (!groups[date]) groups[date] = [];
                        groups[date].push(ins);
                        return groups;
                      }, {})
                  ).map(([date, items]) => (
                    <div key={date} className="space-y-3">
                      <div className="flex items-center gap-3 px-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] whitespace-nowrap">
                          {date === format(new Date(), 'yyyy-MM-dd') ? '今天' : date}
                        </span>
                        <div className="h-px w-full bg-zinc-100" />
                      </div>
                      <div className="space-y-4">
                        {items.map((ins) => (
                          <div key={ins.id} className="group flex items-start gap-3 px-2 flex-row-reverse">
                            {/* Avatar */}
                            <div className="w-9 h-9 rounded-lg brand-gradient flex items-center justify-center shrink-0 shadow-sm">
                              <UserIcon className="w-5 h-5 text-white" />
                            </div>

                            {/* Message Bubble */}
                            <div className="flex flex-col gap-1 max-w-[85%] items-end">
                              <div className="flex items-center gap-2 px-1 flex-row-reverse">
                                <span className="text-[10px] font-medium text-zinc-400">
                                  {ins.created_at ? format(new Date(ins.created_at), 'HH:mm') : '--:--'}
                                </span>
                                {ins.unit_id && (
                                  <span className="text-[10px] font-bold text-cyan-500/70">
                                    #{units.find(u => u.id === ins.unit_id)?.title}
                                  </span>
                                )}
                              </div>
                              
                              <div className="relative group/bubble">
                                <div 
                                  className="brand-gradient text-white rounded-2xl rounded-tr-none p-3 shadow-sm hover:shadow-md transition-all cursor-pointer select-none overflow-hidden"
                                  onPointerDown={(e) => {
                                    // Only trigger for touch or primary mouse button
                                    if (e.pointerType === 'touch' || e.button === 0) {
                                      startLongPress(ins.id);
                                    }
                                  }}
                                  onPointerUp={cancelLongPress}
                                  onPointerLeave={cancelLongPress}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    setActiveDeleteId(ins.id);
                                  }}
                                  onClick={(e) => {
                                    if (activeDeleteId) {
                                      e.stopPropagation();
                                      setActiveDeleteId(null);
                                    }
                                  }}
                                >
                                  <p className="text-[14px] whitespace-pre-wrap leading-normal break-words">
                                    {ins.content}
                                  </p>
                                </div>
                                
                                {/* Action Buttons - Floating Style (Left side for right-aligned messages) */}
                                <div className={`absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-1 transition-all duration-200 ${
                                  activeDeleteId === ins.id ? 'opacity-100 scale-110' : 'opacity-0 group-hover/bubble:opacity-100'
                                }`}>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteInspiration(ins.id, false);
                                      setActiveDeleteId(null);
                                    }} 
                                    className="h-10 w-10 rounded-full bg-white shadow-lg border border-red-100 text-red-500 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Units Tab */}
          <TabsContent value="units" className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <h2 className="text-2xl font-bold tracking-tight hidden sm:block">收纳空间</h2>
              <div className="flex items-center justify-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64 max-w-[240px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                  <Input 
                    placeholder="搜索笔记标题或内容..." 
                    className="pl-9 h-9 text-sm rounded-xl border-zinc-100 bg-zinc-50/50 focus-visible:ring-0 focus-visible:border-cyan-300 transition-colors w-full"
                    value={unitSearchQuery}
                    onChange={(e) => setUnitSearchQuery(e.target.value)}
                  />
                </div>
                <NewUnitDialog onCreate={createUnit} />
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {units
                .filter(u => 
                  u.title.toLowerCase().includes(unitSearchQuery.toLowerCase()) || 
                  (u.content && u.content.toLowerCase().includes(unitSearchQuery.toLowerCase()))
                )
                .sort((a, b) => {
                  // Sort by pinned first, then by updated_at
                  if (a.is_pinned && !b.is_pinned) return -1;
                  if (!a.is_pinned && b.is_pinned) return 1;
                  
                  const timeA = new Date(a.updated_at).getTime();
                  const timeB = new Date(b.updated_at).getTime();
                  return timeB - timeA;
                })
                .map((unit) => (
                <UnitDetailDialog 
                  key={unit.id}
                  unit={unit} 
                  inspirations={inspirations}
                  onUpdateUnit={updateUnit}
                  trigger={
                    <Card className={`group border-zinc-100 hover:shadow-md hover:shadow-zinc-200/30 transition-all rounded-2xl overflow-hidden flex flex-col cursor-pointer hover:border-cyan-100 relative ${unit.is_pinned ? 'bg-cyan-50/30 border-cyan-100' : 'bg-white'}`}>
                      <div className="p-3 pr-8">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <CardTitle className="text-sm font-bold truncate">{unit.title}</CardTitle>
                            {unit.is_pinned && <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />}
                          </div>
                          <p className="text-[10px] text-zinc-400 truncate leading-tight pr-2">
                            {unit.content?.split('\n')[0] || '暂无内容...'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="absolute right-1 top-1/2 -translate-y-1/2">
                        <DropdownMenu>
                          <DropdownMenuTrigger render={
                            <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} className="rounded-lg h-6 w-6 shrink-0 text-zinc-300 hover:text-zinc-600">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          } />
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); togglePinUnit(unit.id, !!unit.is_pinned); }}>
                              <Sparkles className="w-3.5 h-3.5 mr-2 text-cyan-500" /> {unit.is_pinned ? '取消置顶' : '置顶笔记'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); copyUnitContent(unit.id); }}>
                              <Copy className="w-3.5 h-3.5 mr-2" /> 复制全部
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={async (e) => { 
                              e.stopPropagation(); 
                              try {
                                if (!invitationCode) return;
                                await dataStore.deleteUnit(unit.id, invitationCode);
                                setUnits(prev => prev.filter(u => u.id !== unit.id));
                                setInspirations(prev => prev.map(inspiration =>
                                  inspiration.unit_id === unit.id
                                    ? { ...inspiration, unit_id: null, status: 'pending' }
                                    : inspiration
                                ));
                                toast.success('收纳空间已删除');
                              } catch (err) {
                                console.error('Delete unit error:', err);
                                toast.error('删除失败', {
                                  description: err instanceof Error
                                    ? err.message
                                    : err && typeof err === 'object' && 'message' in err
                                      ? String(err.message)
                                      : '请稍后重试'
                                });
                              }
                            }} className="text-red-600">
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> 删除空间
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  }
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer / Stats */}
      <footer className="max-w-4xl mx-auto px-4 py-12 border-t border-zinc-100 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-zinc-400 text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Lightbulb className="w-4 h-4" />
              <span>已收纳 {inspirations.filter(i => !i.is_deleted).length} 条灵感</span>
            </div>
            <div className="w-px h-4 bg-zinc-200" />
            <span>总字数: {inspirations.filter(i => !i.is_deleted).reduce((acc, i) => acc + i.content.length, 0)} / 500,000</span>
          </div>
          <p>© 2026 灵感收纳箱 · AI Powered Knowledge Buffer</p>
        </div>
      </footer>

      <Dialog open={syncDialogOpen} onOpenChange={(open) => !isSyncingLocalData && setSyncDialogOpen(open)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>同步本地数据到云端</DialogTitle>
            <DialogDescription className="leading-6">
              将当前浏览器中属于空间 <span className="font-mono font-semibold text-cyan-700">{invitationCode}</span> 的数据写入 Supabase。
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="rounded-2xl bg-zinc-50 p-4 text-center">
              <div className="text-2xl font-bold text-zinc-900">{localSyncSummary.units}</div>
              <div className="mt-1 text-xs text-zinc-500">收纳单元</div>
            </div>
            <div className="rounded-2xl bg-zinc-50 p-4 text-center">
              <div className="text-2xl font-bold text-zinc-900">{localSyncSummary.inspirations}</div>
              <div className="mt-1 text-xs text-zinc-500">灵感记录</div>
            </div>
          </div>
          <p className="text-xs leading-5 text-zinc-400">
            同标题的收纳单元会以本地内容更新；相同内容和创建时间的灵感不会重复创建。
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSyncDialogOpen(false)} disabled={isSyncingLocalData}>暂不同步</Button>
            <Button onClick={syncLocalDataToCloud} disabled={isSyncingLocalData || (localSyncSummary.units === 0 && localSyncSummary.inspirations === 0)} className="brand-gradient text-white">
              {isSyncingLocalData ? '正在同步…' : '确认并开始同步'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Inspiration Dialog */}
      <Dialog open={!!editingInspiration} onOpenChange={(open) => !open && setEditingInspiration(null)}>
        <DialogContent className="sm:max-w-xl rounded-3xl">
          <DialogHeader>
            <DialogTitle>编辑笔记</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea 
              className="min-h-[300px] text-base rounded-xl border-zinc-200"
              value={editingInspiration?.content || ''}
              onChange={(e) => setEditingInspiration(prev => prev ? { ...prev, content: e.target.value } : null)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingInspiration(null)} className="rounded-xl">取消</Button>
            <Button 
              onClick={() => editingInspiration && updateInspiration(editingInspiration.id, editingInspiration.content)}
              className="rounded-xl brand-gradient border-none text-white shadow-sm shadow-cyan-100"
            >
              保存修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Unit Dialog */}
      <Dialog open={quickCreateUnitOpen} onOpenChange={setQuickCreateUnitOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>新建收纳单元</DialogTitle>
            <DialogDescription>
              为此灵感创建一个新的分类。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">标题</label>
              <Input 
                value={newUnitTitle}
                onChange={(e) => setNewUnitTitle(e.target.value)}
                placeholder="输入标题..."
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">描述 (AI 辅助分类的关键)</label>
              <Textarea 
                placeholder="描述这个单元包含什么内容..." 
                value={newUnitDesc}
                onChange={(e) => setNewUnitDesc(e.target.value)}
                className="rounded-xl min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickCreateUnitOpen(false)} className="rounded-xl">取消</Button>
            <Button 
              onClick={async () => {
                if (newUnitTitle.trim() && pendingInsForUnit) {
                  try {
                    const unitId = await createUnit(newUnitTitle, newUnitDesc || '由待分类灵感创建');
                    if (unitId) {
                      await dataStore.updateInspiration(pendingInsForUnit.id, invitationCode!, { unit_id: unitId, status: 'archived' });
                      await dataStore.updateUnit(unitId, invitationCode!, { content: pendingInsForUnit.content, updated_at: new Date().toISOString() });
                      setUnits(await dataStore.loadUnits(invitationCode!));
                      setInspirations(await dataStore.loadInspirations(invitationCode!));

                      toast.success(`已创建并归入: ${newUnitTitle}`);
                      setQuickCreateUnitOpen(false);
                      setPendingInsForUnit(null);
                      setNewUnitTitle('');
                      setNewUnitDesc('');
                    }
                  } catch (err) {
                    console.error('Error in quick create flow:', err);
                    toast.error('操作失败，请重试');
                  }
                }
              }}
              disabled={!newUnitTitle.trim()}
              className="rounded-xl brand-gradient border-none text-white shadow-sm shadow-cyan-100"
            >
              创建并归入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Notification Toast-like Dialog */}
      <AnimatePresence>
        {quickNotifyOpen && currentClassification && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-lg"
          >
            <div className="bg-white border border-zinc-100 shadow-2xl rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-cyan-50 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-cyan-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">AI 建议分类</p>
                  <p className="text-sm font-bold text-zinc-900 truncate">
                    {currentClassification.candidates.length > 0 
                      ? `归入「${currentClassification.candidates[0].title}」?`
                      : 'AI 无法确定分类，请手动选择'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-zinc-400 hover:text-zinc-600 px-3 h-8 text-xs"
                  onClick={() => {
                    setQuickNotifyOpen(false);
                    setCurrentClassification(null);
                    toast.info('已放入待分类池');
                  }}
                >
                  暂不分类
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-cyan-600 border-cyan-100 hover:bg-cyan-50 px-3 h-8 text-xs"
                  onClick={() => {
                    setQuickNotifyOpen(false);
                    setConfirmClassificationOpen(true);
                  }}
                >
                  重选
                </Button>
                {currentClassification.candidates.length > 0 && (
                  <Button 
                    size="sm" 
                    className="brand-gradient border-none text-white px-4 h-8 rounded-lg shadow-sm shadow-cyan-100 text-xs"
                    onClick={() => moveInspirationToUnit(
                      currentClassification.inspirationId, 
                      currentClassification.candidates[0].unitId, 
                      currentClassification.content
                    )}
                  >
                    确定
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Classification Confirmation Dialog (Optimized Version) */}
      <Dialog open={confirmClassificationOpen} onOpenChange={(open) => {
        if (!open) {
          setConfirmClassificationOpen(false);
          setCurrentClassification(null);
        }
      }}>
        <DialogContent className="sm:max-w-lg rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="px-6 py-5 border-b border-zinc-100 bg-white space-y-3">
            <DialogHeader>
              <DialogTitle className="text-lg flex items-center gap-2 font-bold text-zinc-900">
                <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center">
                  <Wand2 className="w-4 h-4 text-purple-500" />
                </div>
                选择分类
              </DialogTitle>
            </DialogHeader>
            {currentClassification && (
              <div className="bg-zinc-50/80 px-4 py-3 rounded-2xl border border-zinc-100/50">
                <p className="text-xs text-zinc-400 mb-1 font-medium">灵感内容</p>
                <p className="text-sm text-zinc-600 line-clamp-2 leading-relaxed italic">
                  "{currentClassification.content}"
                </p>
              </div>
            )}
          </div>
          
          <div className="px-6 py-6 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {/* AI Recommendations */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">AI 智能推荐</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {currentClassification?.candidates.map((c, idx) => (
                  <Button
                    key={c.unitId}
                    variant="outline"
                    className={`h-auto py-4 px-3 flex-col gap-2 rounded-2xl transition-all duration-200 group relative overflow-hidden ${
                      idx === 0 
                      ? 'border-cyan-200 bg-cyan-50/30 ring-1 ring-cyan-100' 
                      : 'border-zinc-100 hover:border-cyan-200 hover:bg-white hover:shadow-md'
                    }`}
                    onClick={() => currentClassification && moveInspirationToUnit(currentClassification.inspirationId, c.unitId, currentClassification.content)}
                  >
                    {idx === 0 && (
                      <div className="absolute top-0 right-0 bg-cyan-500 text-white text-[8px] px-2 py-0.5 rounded-bl-lg font-bold">
                        最佳匹配
                      </div>
                    )}
                    <span className="text-sm font-bold text-zinc-900 truncate w-full">{c.title}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1 w-12 bg-zinc-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-cyan-500 rounded-full" 
                          style={{ width: `${Math.round(c.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-cyan-600 font-bold font-mono">{Math.round(c.confidence * 100)}%</span>
                    </div>
                  </Button>
                ))}
              </div>
            </div>

            {/* Manual Selection */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Inbox className="w-3.5 h-3.5 text-zinc-400" />
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">所有收纳单元</p>
                </div>
                <div className="relative w-32 sm:w-40">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                  <Input 
                    placeholder="快速搜索..." 
                    className="pl-9 h-8 text-xs rounded-full border-zinc-100 bg-zinc-50/50 focus:bg-white transition-colors"
                    value={allUnitsSearch}
                    onChange={(e) => setAllUnitsSearch(e.target.value)}
                  />
                </div>
              </div>
              <ScrollArea className="h-[240px] pr-4">
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                  {units
                    .filter(u => u.title.toLowerCase().includes(allUnitsSearch.toLowerCase()))
                    .map(u => (
                      <Button
                        key={u.id}
                        variant="ghost"
                        className="justify-start text-sm rounded-xl hover:bg-zinc-50 hover:text-cyan-600 h-10 px-3 font-medium text-zinc-600 border border-transparent hover:border-zinc-100 transition-all"
                        onClick={() => currentClassification && moveInspirationToUnit(currentClassification.inspirationId, u.id, currentClassification.content)}
                      >
                        <span className="truncate">{u.title}</span>
                      </Button>
                    ))}
                  {units.filter(u => u.title.toLowerCase().includes(allUnitsSearch.toLowerCase())).length === 0 && (
                    <div className="col-span-2 py-12 text-center space-y-2">
                      <p className="text-sm text-zinc-400">未找到相关单元</p>
                      <Button 
                        variant="link" 
                        size="sm" 
                        className="text-cyan-600"
                        onClick={() => {
                          setConfirmClassificationOpen(false);
                          // Create a minimal Inspiration-like object for the state
                          const mockInspiration = inspirations.find(i => i.id === currentClassification.inspirationId) || {
                            id: currentClassification.inspirationId,
                            content: currentClassification.content,
                            invitation_code: invitationCode || '',
                            unit_id: null,
                            status: 'pending',
                            is_deleted: false,
                            created_at: new Date().toISOString()
                          } as Inspiration;
                          
                          setPendingInsForUnit(mockInspiration);
                          setNewUnitTitle(allUnitsSearch);
                          setQuickCreateUnitOpen(true);
                        }}
                      >
                        新建一个?
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="px-6 pt-2 pb-4 bg-zinc-50/50 border-t border-zinc-100 flex items-center justify-between sm:justify-between min-h-[54px]">
            <p className="text-[10px] text-zinc-400 hidden sm:block">提示：点击上方卡片即可快速归类</p>
            <Button variant="ghost" size="sm" onClick={() => {
              setConfirmClassificationOpen(false);
              setCurrentClassification(null);
              toast.info('已放入待分类池');
            }} className="text-xs text-zinc-500 hover:text-zinc-700 h-8 px-4 rounded-full hover:bg-zinc-100">
              暂不分类
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper Components
// Helper Components
function UnitDetailDialog({ unit, inspirations, onUpdateUnit, trigger }: { 
  unit: Unit, 
  inspirations: Inspiration[],
  onUpdateUnit: (id: string, t: string, d: string, c?: string) => void,
  trigger?: React.ReactElement;
}) {
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editTitle, setEditTitle] = useState(unit.title);
  const [editDesc, setEditDesc] = useState(unit.description);
  const [memoContent, setMemoContent] = useState('');

  // Sync internal state and handle initial data migration/display
  useEffect(() => {
    if (!unit.content) {
      // If unit has no content field yet, aggregate from inspirations
      const aggregated = inspirations
        .filter(i => i.unit_id === unit.id && !i.is_deleted)
        .map(i => i.content)
        .join('\n\n');
      setMemoContent(aggregated);
    } else {
      setMemoContent(unit.content);
    }
  }, [unit.content, inspirations, unit.id]);

  return (
    <Dialog>
      <DialogTrigger nativeButton={false} render={
        trigger || (
          <Button size="sm" className="px-4 rounded-xl h-8 text-xs brand-gradient border-none text-white shadow-sm shadow-cyan-100">
            查看
          </Button>
        )
      } />
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-3xl">
        <div className="p-6 border-b border-zinc-50 bg-zinc-50/30">
          {isEditingInfo ? (
            <div className="space-y-3">
              <Input 
                value={editTitle} 
                onChange={(e) => setEditTitle(e.target.value)}
                className="font-bold text-lg border-zinc-200 focus-visible:ring-cyan-500"
                placeholder="收纳标题"
              />
              <Textarea 
                value={editDesc} 
                onChange={(e) => setEditDesc(e.target.value)}
                className="text-sm text-zinc-500 border-zinc-200 focus-visible:ring-cyan-500 min-h-[60px]"
                placeholder="收纳描述"
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setIsEditingInfo(false)}>取消</Button>
                <Button size="sm" className="brand-gradient border-none text-white shadow-sm shadow-cyan-100" onClick={() => {
                  onUpdateUnit(unit.id, editTitle, editDesc);
                  setIsEditingInfo(false);
                }}>保存</Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-start group">
              <div 
                className="space-y-1 flex-1 cursor-pointer hover:bg-zinc-100/50 p-2 -m-2 rounded-xl transition-colors"
                onClick={() => setIsEditingInfo(true)}
              >
                <DialogTitle className="text-xl font-bold">{unit.title}</DialogTitle>
                {unit.description ? (
                  <p className="text-sm text-zinc-500 leading-relaxed">{unit.description}</p>
                ) : (
                  <p className="text-sm text-zinc-300 italic">点击添加描述...</p>
                )}
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 shrink-0"
                onClick={() => setIsEditingInfo(true)}
              >
                <Edit2 className="w-4 h-4 text-zinc-400" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-white">
          <Textarea
            value={memoContent}
            onChange={(e) => setMemoContent(e.target.value)}
            onBlur={() => {
              if (memoContent !== unit.content) {
                onUpdateUnit(unit.id, unit.title, unit.description, memoContent);
              }
            }}
            placeholder="在这里开始记录..."
            className="w-full h-full p-0 border-none focus-visible:ring-0 resize-none text-[17px] text-zinc-800 leading-relaxed min-h-[400px] bg-transparent placeholder:text-zinc-200"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewUnitDialog({ onCreate }: { onCreate: (t: string, d: string) => void }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button className="rounded-full brand-gradient border-none text-white shadow-lg shadow-cyan-200/50 h-9 px-4 sm:px-6">
          <Plus className="w-4 h-4 mr-1 sm:mr-2" /> 新建单元
        </Button>
      } />
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>新建收纳</DialogTitle>
          <CardDescription>
            为你的灵感创建一个分类。AI 将根据标题和描述自动投递内容。
          </CardDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">标题</label>
            <Input 
              placeholder="例如: 产品灵感, 读书笔记, 随笔..." 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">描述 (AI 辅助分类的关键)</label>
            <Textarea 
              placeholder="描述这个单元包含什么内容，例如: 记录关于 App 设计、功能点和用户体验的想法。" 
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="rounded-xl min-h-[100px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">取消</Button>
          <Button 
            onClick={() => {
              onCreate(title, desc);
              setTitle('');
              setDesc('');
              setOpen(false);
            }}
            disabled={!title.trim()}
            className="rounded-xl brand-gradient border-none text-white shadow-sm shadow-cyan-100"
          >
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

