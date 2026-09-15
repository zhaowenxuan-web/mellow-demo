import { useEffect, useState } from 'react';
import { BookOpen, ChevronRight, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function ProductInfo({
  className = '',
  onOpenChange,
}: {
  className?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [Guide, setGuide] = useState<typeof import('./ProductInfoContent').default | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Fetch only on open; a failed chunk request must not disrupt the user's draft.
  useEffect(() => {
    if (!open || Guide) return;
    let active = true;
    setFailed(false);
    import('./ProductInfoContent').then(module => {
      if (active) setGuide(() => module.default);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [open, Guide, attempt]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
      }}
    >
      <DialogTrigger render={<Button variant="outline" className={`group h-9 gap-2 rounded-full border-cyan-200 bg-cyan-50 px-3.5 text-xs font-semibold text-cyan-800 shadow-sm shadow-cyan-100/80 transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-100 hover:text-cyan-900 hover:shadow-md focus-visible:ring-cyan-500 ${className}`} />}>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-cyan-600 shadow-sm" aria-hidden="true">
          <BookOpen className="h-3.5 w-3.5" />
        </span>
        产品说明
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none bg-[#FDFCFB] p-0 sm:h-auto sm:max-h-[90dvh] sm:max-w-4xl sm:rounded-3xl" showCloseButton={false}>
        <DialogHeader className="shrink-0 border-b border-zinc-100 px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white">
                <Inbox className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold tracking-[0.2em] text-cyan-600">MELLOW · 产品手册</p>
                <DialogTitle className="text-lg font-bold text-zinc-900">关于灵感收纳箱</DialogTitle>
              </div>
            </div>
            <DialogClose render={<Button variant="ghost" className="shrink-0 rounded-full text-xs text-zinc-500" />}>关闭说明</DialogClose>
          </div>
          <DialogDescription className="mt-2 text-sm text-zinc-500">随手写下，灵感自己归位。</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" tabIndex={0} aria-label="产品说明正文">
          {Guide ? <Guide /> : failed ? (
            <div className="p-8 text-sm leading-7 text-zinc-500">
              <p role="alert">产品说明暂时未能加载，不影响继续记录灵感。</p>
              <Button variant="outline" className="mt-3" onClick={() => setAttempt(value => value + 1)}>重新加载说明</Button>
            </div>
          ) : <p role="status" className="p-8 text-center text-sm text-zinc-400">正在打开产品说明…</p>}
        </div>
        <div className="shrink-0 border-t border-zinc-100 px-5 py-3 text-center text-[11px] leading-5 text-zinc-400 sm:px-8">
          完整产品手册 · 点击章节展开
        </div>
      </DialogContent>
    </Dialog>
  );
}
