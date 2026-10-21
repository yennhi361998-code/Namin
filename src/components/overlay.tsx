import type { IconName } from './icons';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useUi } from '../store/ui';
import { cx, Icon } from './ui';

interface ViewportState {
  height: number;
  offsetTop: number;
  isKeyboardOpen: boolean;
}

/** Track visual viewport height and offset so sheets and inputs stay above the software keyboard on mobile. */
function useVisualViewport(active: boolean): ViewportState {
  const [state, setState] = useState<ViewportState>(() => {
    if (typeof window === 'undefined') return { height: 0, offsetTop: 0, isKeyboardOpen: false };
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    const offset = vv ? vv.offsetTop : 0;
    return {
      height: h,
      offsetTop: offset,
      isKeyboardOpen: false,
    };
  });

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const onUpdate = () => {
      const screenH = window.innerHeight;
      const isUp = vv.height < screenH - 80;
      setState({
        height: vv.height,
        offsetTop: vv.offsetTop,
        isKeyboardOpen: isUp,
      });
    };

    onUpdate();
    vv.addEventListener('resize', onUpdate);
    vv.addEventListener('scroll', onUpdate);
    return () => {
      vv.removeEventListener('resize', onUpdate);
      vv.removeEventListener('scroll', onUpdate);
    };
  }, [active]);

  return state;
}

const EXIT_MS = 220;

// Counted so overlapping sheets (menu → edit sheet) don't unlock page scroll early.
let scrollLocks = 0;
function lockScroll() {
  if (scrollLocks++ === 0) document.body.style.overflow = 'hidden';
  return () => {
    if (--scrollLocks === 0) document.body.style.overflow = '';
  };
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  header,
  bodyClassName,
  footerClassName,
  centered,
  zIndex,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Replaces the default title + close row (title is still the dialog's accessible name). */
  header?: ReactNode;
  bodyClassName?: string;
  footerClassName?: string;
  centered?: boolean;
  zIndex?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const vp = useVisualViewport(mounted);
  const isEffectiveCentered = Boolean(centered);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Focus the dialog panel container for accessibility and Escape key handling without raising the keyboard.
  useLayoutEffect(() => {
    if (!open || !mounted) return;
    panel.current?.focus({ preventScroll: true });
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      unlock();
      window.removeEventListener('keydown', onKey);
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  const maxH = vp.height ? `${Math.max(200, vp.height - (vp.isKeyboardOpen ? 8 : 24))}px` : '90dvh';
  return createPortal(
    <div
      className={cx(
        isEffectiveCentered
          ? 'fixed inset-0 flex items-center justify-center p-3 sm:p-4 overflow-hidden'
          : cx('fixed inset-x-0', !vp.isKeyboardOpen && 'inset-0'),
        zIndex || 'z-[60]',
      )}
      style={
        vp.isKeyboardOpen
          ? {
              top: `${vp.offsetTop}px`,
              height: `${vp.height}px`,
            }
          : undefined
      }
      role="presentation"
    >
      <div
        className={cx('absolute inset-0 bg-ink/40 transition-opacity duration-200', shown ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          isEffectiveCentered
            ? 'relative w-full max-w-[540px] mx-auto bg-surface rounded-[24px] shadow-float border border-line/60 flex flex-col outline-none overflow-hidden my-auto'
            : 'absolute inset-x-0 bottom-0 mx-auto w-full max-w-[560px] bg-surface rounded-t-[20px] shadow-float flex flex-col outline-none overflow-hidden',
          'transition-transform duration-200 ease-out',
        )}
        style={{
          ...(isEffectiveCentered
            ? {
                maxHeight: `${Math.min(vp.height - 24, window.innerHeight * 0.88)}px`,
                transform: shown ? 'scale(1)' : 'scale(0.95)',
                opacity: shown ? 1 : 0,
              }
            : {
                maxHeight: maxH,
                transform: shown ? `translateY(${drag}px)` : 'translateY(100%)',
                transitionDuration: dragStart.current != null ? '0ms' : undefined,
              }),
        }}
      >
        {!isEffectiveCentered && (
          <div
            className="pt-2 pb-1 flex flex-col items-center touch-none cursor-grab"
            onPointerDown={(e) => {
              dragStart.current = e.clientY;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => dragStart.current != null && setDrag(Math.max(0, e.clientY - dragStart.current))}
            onPointerUp={() => {
              dragStart.current = null;
              if (drag > 80) onClose();
              setDrag(0);
            }}
            onPointerCancel={() => {
              dragStart.current = null;
              setDrag(0);
            }}
          >
            <span className="w-9 h-1 rounded-full bg-line-strong" aria-hidden />
          </div>
        )}
        {header ?? (
          <div className={cx('flex items-center justify-between px-4 pb-2 min-w-0', isEffectiveCentered && 'pt-3.5')}>
            <h2 className="text-title-sm text-ink truncate pr-2 flex-1 min-w-0">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-ink-sub active:bg-soft shrink-0"
              aria-label="Close"
            >
              <Icon name="close" className="text-[22px]" />
            </button>
          </div>
        )}
        <div className={cx('flex-1 min-h-0 overflow-y-auto overflow-x-hidden min-w-0 w-full overscroll-contain px-4 pb-4', bodyClassName)}>{children}</div>
        {footer && (
          <div
            className={cx('shrink-0 px-4 pt-3 border-t border-line bg-surface', footerClassName)}
            style={{ paddingBottom: isEffectiveCentered ? 16 : vp.isKeyboardOpen ? 12 : 'max(12px, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export interface SheetAction {
  label: string;
  icon: IconName;
  onSelect: () => void;
  destructive?: boolean;
}

/** List of actions in a sheet (long-press menu). */
export function ActionSheet({ open, onClose, title, actions }: { open: boolean; onClose: () => void; title: string; actions: SheetAction[] }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col -mx-1 pb-[env(safe-area-inset-bottom)]">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => {
              onClose();
              a.onSelect();
            }}
            className={cx('min-h-[52px] px-3 rounded-lg flex items-center gap-3 text-body-md active:bg-soft', a.destructive ? 'text-err-ink' : 'text-ink')}
          >
            <Icon name={a.icon} className="text-[22px]" />
            {a.label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

/** Snackbar from Stitch: dark pill above the tab bar with an optional Undo. */
export function Snackbar() {
  const toast = useUi((s) => s.toast);
  const dismiss = useUi((s) => s.dismissToast);
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(toast);

  useEffect(() => {
    if (!toast) {
      setVisible(false);
      return;
    }
    setCurrent(toast);
    setVisible(true);
    const t = setTimeout(dismiss, toast.action ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  return (
    <div
      className="fixed left-4 right-4 mx-auto max-w-[528px] z-[70] pointer-events-none"
      style={{ bottom: 'calc(56px + 12px + env(safe-area-inset-bottom) + 82px)' }}
      aria-live="polite"
      role="status"
    >
      {current && (
        <div
          className={cx(
            'bg-ink text-white rounded-xl p-3 pl-3.5 shadow-float flex items-center justify-between gap-3 transition-all duration-300',
            visible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4',
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={cx(
                'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                current.tone === 'error'
                  ? 'bg-err text-err-ink'
                  : current.tone === 'success'
                  ? 'bg-[#10B981] text-white'
                  : 'bg-sky text-ink',
              )}
            >
              <Icon name={current.tone === 'error' ? 'priority_high' : 'check'} className="text-[16px] font-bold" />
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-label-md font-medium truncate">{current.title}</span>
              {current.subtitle && <span className="text-caption text-[#BCC9CD] truncate">{current.subtitle}</span>}
            </div>
          </div>
          {current.action && (
            <button
              type="button"
              onClick={() => {
                current.action!.run();
                dismiss();
              }}
              className="min-h-[40px] px-3 rounded-lg text-label-md font-semibold text-sky active:bg-white/10 shrink-0"
            >
              {current.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface SwipeAction {
  label: string;
  icon: IconName;
  onSelect: () => void;
  tone?: 'sky' | 'err' | 'done' | 'warn' | 'indigo' | 'soft';
  className?: string;
}

const ACTION_W = 76;

const SWIPE_TONE_CLASSES: Record<string, string> = {
  sky: 'bg-soft text-link active:bg-sky/40',
  err: 'bg-err text-err-ink active:bg-red-200',
  done: 'bg-done text-done-ink active:bg-emerald-200',
  warn: 'bg-warn text-warn-ink active:bg-amber-200',
  indigo: 'bg-[#E9EEF8] text-[#4A5F96] active:bg-indigo-100',
  soft: 'bg-soft text-ink active:bg-line',
};

/**
 * Row that reveals trailing actions on a horizontal swipe and fires onLongPress on a
 * ~500ms hold. Vertical scrolling is left to the browser (touch-action: pan-y).
 */
export function SwipeRow({
  actions,
  onLongPress,
  children,
  surface = 'bg-surface',
  actionWidth,
  className,
}: {
  actions: SwipeAction[];
  onLongPress?: () => void;
  children: ReactNode;
  /** Background of the sliding row (must be opaque to hide the actions behind it). */
  surface?: string;
  actionWidth?: number;
  className?: string;
}) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; axis: 'x' | 'y' | null } | null>(null);
  const suppressClick = useRef(false);
  const longTimer = useRef<number>();
  const actionW = actionWidth ?? ACTION_W;
  const max = actions.length * actionW;

  const clearLong = () => window.clearTimeout(longTimer.current);

  return (
    <div className={cx('relative overflow-hidden', className)}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: max }} aria-hidden={x === 0}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={x === 0 ? -1 : 0}
            onClick={() => {
              setX(0);
              a.onSelect();
            }}
            style={{ width: actionW }}
            className={cx(
              'flex flex-col items-center justify-center gap-0.5 text-caption font-medium shrink-0',
              a.className || SWIPE_TONE_CLASSES[a.tone ?? 'sky'] || SWIPE_TONE_CLASSES.sky
            )}
          >
            <Icon name={a.icon} className="text-[18px]" />
            <span className="text-[11px] font-semibold leading-tight">{a.label}</span>
          </button>
        ))}
      </div>
      <div
        className={cx('relative touch-pan-y', surface, !dragging && 'transition-transform duration-200')}
        style={{ transform: `translateX(${x}px)` }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY, base: x, axis: null };
          suppressClick.current = false;
          if (onLongPress)
            longTimer.current = window.setTimeout(() => {
              suppressClick.current = true;
              start.current = null;
              navigator.vibrate?.(10);
              onLongPress();
            }, 500);
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (!s.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            clearLong();
            s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            if (s.axis === 'x') {
              setDragging(true);
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }
          }
          if (s.axis === 'x') {
            suppressClick.current = true;
            setX(Math.min(0, Math.max(-max - 24, s.base + dx)));
          }
        }}
        onPointerUp={() => {
          clearLong();
          if (start.current?.axis === 'x') setX((cur) => (cur < -max / 2 ? -max : 0));
          else if (x !== 0 && !suppressClick.current) {
            // Tapping an open row closes it instead of activating it.
            suppressClick.current = true;
            setX(0);
          }
          start.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          clearLong();
          start.current = null;
          setDragging(false);
          setX((cur) => (cur < -max / 2 ? -max : 0));
        }}
        onContextMenu={(e) => {
          // Desktop right-click and Android long-press both land here.
          if (onLongPress) {
            e.preventDefault();
            if (!suppressClick.current) {
              clearLong();
              suppressClick.current = true;
              onLongPress();
            }
          }
        }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
