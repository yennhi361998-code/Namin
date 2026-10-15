import { useState, useEffect } from 'react';
import { BottomSheet } from './overlay';
import { cx, Icon } from './ui';

export const BASIC_PURCHASE_UNITS = [
  'pack',
  'item',
  'box',
  'bottle',
  'bag',
  'roll',
] as const;

export function UnitPickerModal({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (unit: string) => void;
}) {
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (open) {
      if (!BASIC_PURCHASE_UNITS.includes(value as any)) {
        setCustom(value);
      } else {
        setCustom('');
      }
    }
  }, [open, value]);

  const handleSelect = (u: string) => {
    onChange(u);
    onClose();
  };

  const handleCustomSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (custom.trim()) {
      onChange(custom.trim().toLowerCase());
      onClose();
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Packaging Unit"
      centered
      zIndex="z-[70]"
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-3 gap-2.5">
          {BASIC_PURCHASE_UNITS.map((u) => {
            const isSelected = value.toLowerCase() === u;
            return (
              <button
                key={u}
                type="button"
                onClick={() => handleSelect(u)}
                className={cx(
                  'py-3 px-2 rounded-xl text-body-md font-medium capitalize flex items-center justify-center gap-1.5 transition-all cursor-pointer',
                  isSelected
                    ? 'bg-header text-header-ink font-semibold shadow-xs border border-header-ink/30 ring-2 ring-sky/40'
                    : 'bg-canvas text-ink border border-line hover:bg-soft active:scale-95'
                )}
              >
                <span>{u}</span>
                {isSelected && <Icon name="check" className="text-[16px] text-header-ink" />}
              </button>
            );
          })}
        </div>

        {/* Custom unit input */}
        <form onSubmit={handleCustomSubmit} className="pt-3 border-t border-line/40 flex flex-col gap-2">
          <span className="text-caption font-semibold text-ink-sub uppercase tracking-wider">Other unit</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. kg, can, set"
              maxLength={20}
              className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-canvas border border-line text-body-md text-ink placeholder:text-ink-sub/70 focus:outline-none focus:border-sky-dark focus:bg-surface transition-colors"
            />
            <button
              type="submit"
              disabled={!custom.trim()}
              className="min-h-[44px] px-4 rounded-xl bg-header text-header-ink text-label-md font-semibold border border-header-ink/20 disabled:opacity-30 disabled:pointer-events-none transition-opacity cursor-pointer"
            >
              Set
            </button>
          </div>
        </form>
      </div>
    </BottomSheet>
  );
}
