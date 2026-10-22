import { useState } from 'react';
import { BottomSheet } from '../components/overlay';
import { cx, GhostButton, Icon, PrimaryButton } from '../components/ui';
import {
  BACKGROUND_COLOR_OPTIONS,
  DEFAULT_THEME_SETTINGS,
  getRelativeLuminance,
  getThemeSettings,
  saveThemeSettings,
  THEME_COLOR_OPTIONS,
  type ThemeSettings,
} from '../lib/theme';
import { toast } from '../store/ui';

export function ThemeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setTheme] = useState<ThemeSettings>(() => getThemeSettings());

  const handleSelectCanvas = (hex: string) => {
    const updated: ThemeSettings = { ...theme, canvasColor: hex };
    setTheme(updated);
    saveThemeSettings(updated);
  };

  const handleSelectHeader = (hex: string) => {
    const updated: ThemeSettings = { ...theme, headerColor: hex };
    setTheme(updated);
    saveThemeSettings(updated);
  };

  const handleReset = () => {
    setTheme(DEFAULT_THEME_SETTINGS);
    saveThemeSettings(DEFAULT_THEME_SETTINGS);
    toast({
      title: 'Theme reset to default',
      subtitle: 'Butter Cream background & Aqua Sky theme restored',
    });
  };

  // Preview calculations
  const headerLum = getRelativeLuminance(theme.headerColor);
  const previewHeaderInk = headerLum < 0.4 ? '#FFFFFF' : '#175562';
  const previewLogoColor = headerLum > 0.88 ? previewHeaderInk : '#FFFFFF';

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Theme"
      footer={
        <div className="flex items-center gap-2">
          <GhostButton className="flex-1" onClick={handleReset}>
            Reset to default
          </GhostButton>
          <PrimaryButton className="flex-1" onClick={onClose}>
            Done
          </PrimaryButton>
        </div>
      }
    >
      <div className="flex flex-col gap-6 pb-4">
        {/* Live Mini Preview Card */}
        <div className="rounded-2xl border border-line overflow-hidden shadow-card">
          <div className="text-caption font-semibold text-ink-sub px-3.5 py-2 bg-surface border-b border-line flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Icon name="palette" className="text-[14px] text-sky-dark" />
              Live Preview
            </span>
            <span className="text-[11px] font-mono text-ink-sub/70">
              {theme.canvasColor} · {theme.headerColor}
            </span>
          </div>

          <div
            className="p-3.5 flex flex-col gap-3 transition-colors duration-200"
            style={{ backgroundColor: theme.canvasColor }}
          >
            {/* Mini Header */}
            <div
              className="h-9 px-3 rounded-xl shadow-xs flex items-center justify-between transition-colors duration-200"
              style={{
                backgroundColor: theme.headerColor,
                color: previewHeaderInk,
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3.5 h-3.5 rounded-sm border flex items-center justify-center text-[10px] font-bold"
                  style={{ borderColor: previewLogoColor, color: previewLogoColor }}
                >
                  N
                </span>
                <span className="text-caption font-bold truncate">Namin Home</span>
              </div>
              <div className="w-5 h-5 rounded-full bg-white/40 border border-white/60" />
            </div>

            {/* Mini Content Card */}
            <div className="bg-surface rounded-xl p-3 border border-line shadow-2xs flex items-center justify-between gap-2">
              <div className="flex flex-col min-w-0">
                <span className="text-label-sm font-semibold text-ink truncate">Today's Household Plan</span>
                <span className="text-[11px] text-ink-sub">3 chores scheduled</span>
              </div>
              {/* Mini FAB with ring */}
              <div
                className="w-7 h-7 rounded-full bg-surface flex items-center justify-center shrink-0 shadow-xs"
                style={{
                  boxShadow: `0 0 0 2px ${theme.headerColor}`,
                  color: previewHeaderInk,
                }}
              >
                <Icon name="add" className="text-[16px]" filled />
              </div>
            </div>

            {/* Mini Bottom Nav Bar */}
            <div className="bg-surface/95 rounded-full p-1 border border-line/80 shadow-xs flex items-center justify-around gap-1">
              <div
                className="flex-1 py-1 px-2 rounded-full flex items-center justify-center text-[11px] font-bold shadow-2xs transition-colors duration-200"
                style={{
                  backgroundColor: theme.headerColor,
                  color: previewHeaderInk,
                }}
              >
                Tasks
              </div>
              <div className="flex-1 py-1 px-2 rounded-full flex items-center justify-center text-[11px] text-ink-sub">
                Inventory
              </div>
              <div className="flex-1 py-1 px-2 rounded-full flex items-center justify-center text-[11px] text-ink-sub">
                Wallet
              </div>
            </div>
          </div>
        </div>

        {/* Section 1: Background Color */}
        <div className="flex flex-col gap-2.5">
          <div className="px-1">
            <span className="text-label-md font-semibold text-ink">Background color</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {BACKGROUND_COLOR_OPTIONS.map((opt) => {
              const isSelected = theme.canvasColor.toUpperCase() === opt.hex.toUpperCase();
              const isDark = getRelativeLuminance(opt.hex) < 0.4;
              return (
                <button
                  key={opt.hex}
                  type="button"
                  onClick={() => handleSelectCanvas(opt.hex)}
                  className={cx(
                    'p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer relative',
                    isSelected
                      ? 'border-sky-dark bg-surface shadow-xs ring-2 ring-sky-dark/20'
                      : 'border-line bg-surface hover:border-line-strong hover:bg-black/[0.01]'
                  )}
                >
                  <span
                    className="w-6 h-6 rounded-full border border-black/10 shrink-0 flex items-center justify-center shadow-xs"
                    style={{ backgroundColor: opt.hex }}
                  >
                    {isSelected && (
                      <Icon
                        name="check"
                        className={cx('text-[13px] font-bold', isDark ? 'text-white' : 'text-sky-dark')}
                      />
                    )}
                  </span>
                  <div className="flex flex-col min-w-0 pr-1">
                    <span className="text-label-sm font-semibold text-ink truncate leading-tight flex items-center gap-1">
                      {opt.name}
                      {opt.isDefault && (
                        <span className="text-[9px] uppercase font-bold px-1 py-0.2 rounded bg-sky/50 text-sky-dark">
                          Def
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-mono text-ink-sub truncate leading-tight">{opt.hex}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Theme Color */}
        <div className="flex flex-col gap-2.5">
          <div className="px-1">
            <span className="text-label-md font-semibold text-ink">Theme color</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {THEME_COLOR_OPTIONS.map((opt) => {
              const isSelected = theme.headerColor.toUpperCase() === opt.hex.toUpperCase();
              const isDark = getRelativeLuminance(opt.hex) < 0.4;
              return (
                <button
                  key={opt.hex}
                  type="button"
                  onClick={() => handleSelectHeader(opt.hex)}
                  className={cx(
                    'p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer relative',
                    isSelected
                      ? 'border-sky-dark bg-surface shadow-xs ring-2 ring-sky-dark/20'
                      : 'border-line bg-surface hover:border-line-strong hover:bg-black/[0.01]'
                  )}
                >
                  <span
                    className="w-6 h-6 rounded-full border border-black/10 shrink-0 flex items-center justify-center shadow-xs"
                    style={{ backgroundColor: opt.hex }}
                  >
                    {isSelected && (
                      <Icon
                        name="check"
                        className={cx('text-[13px] font-bold', isDark ? 'text-white' : 'text-sky-dark')}
                      />
                    )}
                  </span>
                  <div className="flex flex-col min-w-0 pr-1">
                    <span className="text-label-sm font-semibold text-ink truncate leading-tight flex items-center gap-1">
                      {opt.name}
                      {opt.isDefault && (
                        <span className="text-[9px] uppercase font-bold px-1 py-0.2 rounded bg-sky/50 text-sky-dark">
                          Def
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-mono text-ink-sub truncate leading-tight">{opt.hex}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
