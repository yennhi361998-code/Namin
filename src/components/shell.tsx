import type { IconName } from './icons';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useCurrentMember } from '../store/selectors';
import { useStore } from '../store';
import { openSheet, useUi } from '../store/ui';
import { Logo } from './Logo';
import { cx, Icon, MemberAvatar } from './ui';

const TABS: { to: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { to: '/', label: 'Home', icon: 'roofing', match: (p: string) => p === '/' },
  { to: '/tasks', label: 'Tasks', icon: 'check_circle', match: (p: string) => p.startsWith('/tasks') },
  {
    to: '/shopping',
    label: 'Shopping',
    icon: 'shopping_bag',
    match: (p: string) => p.startsWith('/shopping') || p.startsWith('/items') || p.startsWith('/spending') || p.startsWith('/charts'),
  },
];

/** Floating, icon-only tab bar. Labels stay available to screen readers. */
export function BottomNavigation() {
  const { pathname } = useLocation();
  return (
    <nav
      className="fixed inset-x-4 mx-auto max-w-[608px] z-40 bg-surface/90 backdrop-blur-xl border border-line rounded-full shadow-float"
      style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      aria-label="Main"
    >
      <div className="flex items-center p-1.5">
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
                'flex-1 h-11 rounded-full flex items-center justify-center transition-colors',
                // Selected: aqua pill + deep aqua icon. Others: same hue, lighter (pill shape marks the state too).
                active ? 'bg-header text-header-ink' : 'text-header-ink/55 active:bg-header/50',
              )}
            >
              <Icon name={t.icon} filled={active} className="text-[24px]" />
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

const HEADER = 'sticky top-0 z-30 -mx-margin bg-header text-ink pt-safe shadow-[0_2px_10px_rgba(38,52,59,0.08)] transition-transform duration-300 ease-in-out';

/** Round icon button for the header band. */
export function HeaderButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="w-11 h-11 rounded-full flex items-center justify-center text-ink active:bg-white/40">
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
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
  tone?: 'page' | 'header';
}) {
  return (
    <div className="flex items-center gap-2" role="tablist" aria-label={label}>
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
              'min-h-[38px] px-4 rounded-full text-label-md transition-colors inline-flex items-center',
              tone === 'header'
                ? active
                  ? 'bg-white text-ink font-semibold shadow-sm'
                  : 'text-ink/80 active:bg-white/30'
                : active
                  ? 'bg-sky text-ink font-semibold shadow-sm'
                  : 'bg-surface text-ink-sub border border-line active:bg-soft',
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cx('ml-1.5 text-caption px-1.5 rounded-full', active ? 'bg-white/60' : 'bg-canvas border border-line')}>{o.count}</span>
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
          <Logo height={30} color="#FFFFFF" />
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
        <h1 className="text-title-sm text-ink text-center truncate">{title}</h1>
        <div className="flex justify-end">{right}</div>
      </div>
      {children && <div className="px-margin pb-3">{children}</div>}
    </header>
  );
}

/** Screen title + primary action, on the page under the brand header. */
export function ScreenTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-space-lg pb-space-md">
      <div className="flex flex-col min-w-0">
        <h1 className="text-headline-lg text-ink tracking-tight">{title}</h1>
        {subtitle && <div className="text-body-sm text-ink-sub mt-0.5">{subtitle}</div>}
      </div>
      {action}
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
  const chip = (active: boolean) =>
    cx('min-h-[36px] rounded-full text-label-md inline-flex items-center gap-1.5 shrink-0 border transition-colors', active ? 'bg-header border-header-ink/30 text-header-ink font-semibold' : 'bg-surface border-line text-ink-sub');
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-margin px-margin" role="radiogroup" aria-label="Show tasks for">
      <button type="button" role="radio" aria-checked={value === null} onClick={() => setAssignee(null)} className={cx(chip(value === null), 'px-3.5')}>
        All
      </button>
      {members.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={value === m.id} onClick={() => setAssignee(m.id)} className={cx(chip(value === m.id), 'pl-1 pr-3')}>
          <MemberAvatar member={m} size={26} />
          {m.name}
        </button>
      ))}
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
      className="fixed z-40 w-14 h-14 rounded-full bg-surface text-header-ink ring-2 ring-header shadow-float flex items-center justify-center active:scale-95 active:bg-header transition-all"
      style={{ right: 'max(16px, calc((100vw - 640px) / 2 + 16px))', bottom: 'calc(56px + 12px + env(safe-area-inset-bottom) + 14px)' }}
    >
      <Icon name="add" className="text-[30px]" filled />
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <main className="pb-[calc(56px+12px+env(safe-area-inset-bottom)+88px)] px-margin max-w-[640px] mx-auto">{children}</main>
      <BottomNavigation />
    </div>
  );
}
