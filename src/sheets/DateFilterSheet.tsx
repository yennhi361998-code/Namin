import { useState } from 'react';
import { BottomSheet } from '../components/overlay';
import { cx, Icon } from '../components/ui';
import {
  QUICK_RANGE_OPTIONS,
  type DateFilterSelection,
  type QuickRangeOption,
} from '../lib/dateRanges';
import { today } from '../lib/dates';

export function DateFilterSheet({
  open,
  onClose,
  initialSelection,
  initialMonthStartDay,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  initialSelection: DateFilterSelection;
  initialMonthStartDay: number;
  onApply: (selection: DateFilterSelection, monthStartDay: number) => void;
}) {
  const [selection, setSelection] = useState<DateFilterSelection>(initialSelection);
  const [monthStartDay] = useState<number>(initialMonthStartDay);
  const [isDefaultStartDayChecked, setIsDefaultStartDayChecked] = useState<boolean>(false);

  // Extract day number from selected startDate for the default checkbox hint
  const currentStartDayNum = selection.startDate
    ? parseInt(selection.startDate.split('-')[2] || '1', 10)
    : 1;

  const handleSelectQuick = (opt: QuickRangeOption) => {
    setSelection({
      mode: 'quick',
      monthKey: selection.monthKey,
      quickOption: opt,
      startDate: selection.startDate,
      endDate: selection.endDate,
    });
  };

  const handleCustomDateChange = (field: 'startDate' | 'endDate', val: string) => {
    setSelection({
      ...selection,
      mode: 'custom',
      [field]: val,
    });
  };

  const handleConfirm = () => {
    let updatedStartDay = monthStartDay;
    if (isDefaultStartDayChecked && selection.startDate) {
      const day = parseInt(selection.startDate.split('-')[2] || '1', 10);
      if (day >= 1 && day <= 28) {
        updatedStartDay = day;
      }
    }
    onApply(selection, updatedStartDay);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Date">
      <div className="flex flex-col gap-space-lg pb-6">
        {/* Quick Date Range */}
        <div className="flex flex-col">
          <span className="text-caption text-ink-sub/70 font-medium uppercase tracking-wider px-2 py-1 mb-1">
            Quick Date Range
          </span>
          <div className="divide-y divide-line/60 border-t border-b border-line/60">
            {QUICK_RANGE_OPTIONS.map((opt) => {
              const isSelected = selection.mode === 'quick' && selection.quickOption === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectQuick(opt.id)}
                  className={cx(
                    'w-full min-h-[48px] px-3 flex items-center justify-between text-body-md text-left transition-colors active:bg-soft',
                    isSelected ? 'text-link font-semibold bg-soft/50' : 'text-ink'
                  )}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Icon name="check" className="text-[20px] text-link" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Date Range */}
        <div className="flex flex-col gap-1">
          <span className="text-caption text-ink-sub/70 font-medium uppercase tracking-wider px-2 py-1">
            Custom Date Range
          </span>
          <div className="divide-y divide-line/60 border-t border-b border-line/60 bg-surface">
            <div className="min-h-[52px] px-3 flex items-center justify-between">
              <span className="text-body-md text-ink">Start Date</span>
              <input
                type="date"
                value={selection.startDate || today()}
                onChange={(e) => handleCustomDateChange('startDate', e.target.value)}
                className="bg-transparent text-body-md text-ink-sub focus:text-ink focus:outline-none text-right cursor-pointer"
              />
            </div>
            <div className="min-h-[52px] px-3 flex items-center justify-between">
              <span className="text-body-md text-ink">End Date</span>
              <input
                type="date"
                value={selection.endDate || today()}
                onChange={(e) => handleCustomDateChange('endDate', e.target.value)}
                className="bg-transparent text-body-md text-ink-sub focus:text-ink focus:outline-none text-right cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Checkbox: Set this day as default month start date */}
        <div className="px-2 pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDefaultStartDayChecked}
              onChange={(e) => setIsDefaultStartDayChecked(e.target.checked)}
              className="w-4 h-4 rounded border-line text-sky focus:ring-sky"
            />
            <span className="text-body-sm text-ink font-medium">
              Set day {currentStartDayNum} as default month start date
            </span>
          </label>
        </div>

        {/* Confirm OK button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full min-h-[50px] rounded-2xl bg-sky text-ink font-semibold text-body-md shadow-sm active:bg-sky-dark active:scale-[0.99] transition-all flex items-center justify-center"
          >
            OK
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
