import type { IconName } from './icons';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useCurrentMember } from '../store/selectors';
import { useStore } from '../store';
import { openSheet, useUi } from '../store/ui';
import { Logo } from './Logo';
import { cx, Icon, MemberAvatar } from './ui';

const TABS: { to: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { to: '/tasks', label: 'Tasks', icon: 'check_circle', match: (p: string) => p.startsWith('/tasks') },
  {
    to: '/our-wallet',
    label: 'Our Wallet',
    icon: 'roofing',
    match: (p: string) => p.startsWith('/our-wallet') || p.startsWith('/shopping') || p.startsWith('/items') || p.startsWith('/spending') || p.startsWith('/charts'),
  },
  {
    to: '/my-wallet',
    label: 'My Wallet',
    icon: 'person',
    match: (p: string) => p.startsWith('/my-wallet'),
  },
];

function useIsStandalone(): boolean {
  const [standalone, setStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as any)?.standalone)
    );
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(display-mode: standalone)');
    const onChange = (e: MediaQueryListEvent) => setStandalone(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return standalone;
}

/** Floating pill navigation bar with rounded-full shape, compact Facebook-style tabs. */
export function BottomNavigation() {
  const { pathname } = useLocation();
  const isStandalone = useIsStandalone();

  return (
    <nav
      className="fixed z-40 inset-x-0 mx-auto w-[calc(100%-32px)] max-w-[360px] bg-surface/90 dark:bg-surface/90 backdrop-blur-xl border border-line/80 rounded-full shadow-float transition-[bottom] duration-200 ease-out"
      style={{
        bottom: isStandalone ? 'max(14px, env(safe-area-inset-bottom))' : '14px',
      }}
      aria-label="Main"
    >
      <div className="h-11 p-[3px] flex items-center justify-around gap-1">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <NavLink
              key={t.to}
              to={t.to}
              replace
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
              title={t.label}
              className={cx(
                'flex-1 max-w-[104px] h-full rounded-full flex items-center justify-center transition-all duration-200',
                active
                  ? 'bg-header text-header-ink shadow-xs font-semibold'
                  : 'text-ink-sub/70 hover:text-ink active:scale-95'
              )}
            >
              <Icon name={t.icon} filled={active} className={cx('text-[20px]', active ? 'text-header-ink' : 'text-ink-sub')} />
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

/** Go back, or to `fallback` when the screen was opened directly (no in-app history). */
export function useBack(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => (location.key !== 'default' ? navigate(-1) : navigate(fallback, { replace: true }));
}

function useHideOnScroll() {
  const [visible, setVisible] = useState(true);
  const { pathname } = useLocation();

  useEffect(() => {
    setVisible(true);
  }, [pathname]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateScroll = () => {
      const scrollY = window.scrollY;
      if (scrollY < 20) {
        setVisible(true);
      } else if (Math.abs(scrollY - lastScrollY) > 8) {
        setVisible(scrollY < lastScrollY);
      }
      lastScrollY = scrollY > 0 ? scrollY : 0;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScroll);
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return visible;
}

const HEADER = 'sticky top-0 z-30 -mx-margin bg-header text-header-ink pt-safe shadow-[0_2px_10px_rgba(38,52,59,0.08)] transition-transform duration-300 ease-in-out';

/** Round icon button for the header band. */
export function HeaderButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="w-11 h-11 rounded-full flex items-center justify-center text-header-ink active:bg-header-ink/10">
      <Icon name={icon} className="text-[26px]" />
    </button>
  );
}

/**
 * Pill tabs. `tone="header"` sits on the light-blue band (Charts); the default sits on the page.
 */
export function PillTabs<T extends string>({
  value,
  onChange,
  options,
  label,
  tone = 'page',
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
  tone?: 'page' | 'header';
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5" role="tablist" aria-label={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              size === 'sm'
                ? 'min-h-[32px] sm:min-h-[36px] px-2.5 sm:px-3 rounded-full text-caption sm:text-label-md transition-colors inline-flex items-center whitespace-nowrap'
                : 'min-h-[36px] sm:min-h-[38px] px-3 sm:px-4 rounded-full text-label-md transition-colors inline-flex items-center whitespace-nowrap',
              tone === 'header'
                ? active
                  ? 'bg-header text-header-ink font-semibold shadow-sm border border-header-ink/20'
                  : 'text-header-ink/80 active:bg-header-ink/10'
                : active
                  ? 'bg-header text-header-ink font-semibold shadow-sm border border-header-ink/20'
                  : 'bg-surface text-ink-sub border border-line active:bg-soft',
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cx('ml-1.5 text-caption px-1.5 rounded-full', active ? 'bg-white/60 text-header-ink' : 'bg-canvas border border-line')}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Header of the three main screens: the Namin logo centred in white, profile on the right. */
export function BrandHeader() {
  const me = useCurrentMember();
  const visible = useHideOnScroll();
  return (
    <header className={cx(HEADER, !visible && '-translate-y-full')}>
      <div className="h-12 px-1.5 grid grid-cols-[52px_1fr_52px] items-center">
        <span aria-hidden />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            title="Làm mới trang"
            aria-label="Làm mới trang"
            className="flex items-center justify-center p-1 rounded-lg active:scale-95 transition-transform cursor-pointer"
          >
            <Logo height={30} color="#FFFFFF" />
          </button>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={() => openSheet({ type: 'household' })} aria-label="Household and members" className="w-11 h-11 rounded-full flex items-center justify-center active:bg-white/40">
            <span className="rounded-full ring-2 ring-white">
              <MemberAvatar member={me} size={28} />
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

/** Light-blue band for pushed screens (details, Charts): back, centred title, one action, optional extra row. */
export function PageHeader({ title, back, right, children }: { title: string; back: string; right?: ReactNode; children?: ReactNode }) {
  const goBack = useBack(back);
  const visible = useHideOnScroll();
  return (
    <header className={cx(HEADER, !visible && '-translate-y-full')}>
      <div className="h-12 px-1.5 grid grid-cols-[52px_1fr_52px] items-center">
        <div className="flex justify-start">
          <HeaderButton icon="chevron_left" label="Back" onClick={goBack} />
        </div>
        <h1 className="text-title-sm text-header-ink text-center truncate">{title}</h1>
        <div className="flex justify-end">{right}</div>
      </div>
      {children && <div className="px-margin pb-3">{children}</div>}
    </header>
  );
}

/** Screen title + primary action, on the page under the brand header. */
export function ScreenTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 sm:gap-3 pt-space-lg pb-space-md">
      <div className="flex flex-col min-w-0">
        <h1 className="text-[22px] sm:text-headline-lg leading-[32px] sm:leading-[36px] pb-1 pr-1 text-ink tracking-tight font-bold truncate">{title}</h1>
        {subtitle && <div className="text-body-sm text-ink-sub mt-0.5">{subtitle}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** All / per-member chips filtering task lists by assignee (shared across Home and Tasks). */
export function AssigneeFilter() {
  const members = useStore((s) => s.members);
  const assignee = useUi((s) => s.assignee);
  const setAssignee = useUi((s) => s.setAssignee);
  // A removed member (or stale stored id) falls back to "All".
  const value = members.some((m) => m.id === assignee) ? assignee : null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-margin px-margin" role="radiogroup" aria-label="Show tasks for">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        onClick={() => setAssignee(null)}
        className={cx(
          'min-h-[36px] px-3.5 rounded-full text-label-md inline-flex items-center shrink-0 border transition-all duration-200',
          value === null
            ? 'bg-header border-header-ink/30 text-header-ink font-semibold shadow-xs'
            : 'bg-surface border-line text-ink-sub hover:bg-soft/60'
        )}
      >
        All
      </button>
      {members.map((m) => {
        const isSelected = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => setAssignee(m.id)}
            title={m.name}
            aria-label={`Filter by ${m.name}`}
            className={cx(
              'min-h-[36px] rounded-full inline-flex items-center shrink-0 border transition-all duration-200',
              isSelected
                ? 'pl-1 pr-3 gap-1.5 bg-header border-header-ink/30 text-header-ink font-semibold shadow-xs text-label-md'
                : 'w-[36px] h-[36px] p-0 justify-center bg-surface border-line hover:bg-soft/60 active:scale-95'
            )}
          >
            <MemberAvatar member={m} size={isSelected ? 26 : 28} />
            {isSelected && <span>{m.name}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Floating "+" in the bottom-right corner, just above the tab bar: the screen's main add action. */
export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="fixed z-40 w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-surface text-header-ink ring-2 ring-header shadow-float flex items-center justify-center active:scale-95 active:bg-header transition-all"
      style={{
        right: 'max(16px, calc((100vw - 640px) / 2 + 16px))',
        bottom: 'calc(44px + max(8px, env(safe-area-inset-bottom, 8px)) + 12px)',
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
      }}
    >
      <Icon name="add" className="text-[26px] sm:text-[28px]" filled />
    </button>
  );
}

export function PullToRefresh({ children }: { children: ReactNode }) {
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const isPullingRef = useRef(false);
  const sheetOpen = useUi((s) => s.sheetOpen);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // Only start gesture if scrolled at the very top, no bottom sheet/modal is open
      if (window.scrollY <= 2 && !sheetOpen && !isRefreshing) {
        const target = e.target as HTMLElement | null;
        if (target?.closest('[role="dialog"]') || target?.closest('input') || target?.closest('textarea')) {
          isPullingRef.current = false;
          return;
        }
        startYRef.current = e.touches[0].clientY;
        isPullingRef.current = true;
      } else {
        isPullingRef.current = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isRefreshing || sheetOpen) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startYRef.current;

      if (diff > 0 && window.scrollY <= 2) {
        // Smooth logarithmic resistance curve
        const distance = Math.min(80, Math.pow(diff, 0.82) * 1.6);
        setPullY(distance);
      } else if (diff < 0) {
        isPullingRef.current = false;
        setPullY(0);
      }
    };

    const handleTouchEnd = () => {
      if (!isPullingRef.current || isRefreshing) return;
      isPullingRef.current = false;

      if (pullY >= 55) {
        setIsRefreshing(true);
        setPullY(55);
        setTimeout(() => {
          window.location.reload();
        }, 350);
      } else {
        setPullY(0);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [pullY, isRefreshing, sheetOpen]);

  return (
    <>
      {(pullY > 0 || isRefreshing) && (
        <div
          className="fixed top-0 inset-x-0 z-50 flex items-center justify-center pointer-events-none transition-transform duration-150 ease-out"
          style={{
            transform: `translateY(${Math.max(10, pullY)}px)`,
            paddingTop: 'env(safe-area-inset-top, 10px)',
          }}
        >
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface/95 backdrop-blur-md shadow-lg border border-line text-ink text-[12.5px] font-medium">
            <Icon
              name="sync"
              className={cx(
                'text-[16px] text-sky-dark transition-transform duration-200',
                isRefreshing || pullY >= 55 ? 'animate-spin' : ''
              )}
              style={{
                transform: !isRefreshing && pullY < 55 ? `rotate(${pullY * 5}deg)` : undefined,
              }}
            />
            <span>{isRefreshing ? 'Đang làm mới...' : pullY >= 55 ? 'Thả để làm mới' : 'Kéo xuống để làm mới'}</span>
          </div>
        </div>
      )}
      {children}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <PullToRefresh>
      <div className="min-h-dvh bg-canvas">
        <main className="pb-[calc(44px+max(8px,env(safe-area-inset-bottom,8px))+32px)] px-margin max-w-[640px] mx-auto">{children}</main>
        <BottomNavigation />
      </div>
    </PullToRefresh>
  );
}
