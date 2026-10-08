import { useState } from 'react';
import { BottomSheet } from '../components/overlay';
import { cx, Icon } from '../components/ui';
import { DatePickerModal } from '../components/DatePickerModal';
import {
  getCurrentCycleMonthKey,
  QUICK_RANGE_OPTIONS,
  resolveDateRange,
  type DateFilterSelection,
  type QuickRangeOption,
} from '../lib/dateRanges';
import { addDays, addMonths, monthKey, today } from '../lib/dates';

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
  const [resolvedStart, resolvedEnd] = resolveDateRange(initialSelection, initialMonthStartDay);

  const [selection, setSelection] = useState<DateFilterSelection>(() => ({
    ...initialSelection,
    startDate: initialSelection.startDate || resolvedStart,
    endDate: initialSelection.endDate || resolvedEnd,
  }));

  const [isDefaultStartDayChecked, setIsDefaultStartDayChecked] = useState<boolean>(
    initialMonthStartDay > 1
  );
  const [pickerField, setPickerField] = useState<'startDate' | 'endDate' | null>(null);

  // Extract day number for the default checkbox hint
  const currentStartDayNum = selection.startDate
    ? parseInt(selection.startDate.split('-')[2] || '1', 10)
    : (initialMonthStartDay > 1 ? initialMonthStartDay : 1);

  const handleSelectQuick = (opt: QuickRangeOption) => {
    const effectiveStartDay = isDefaultStartDayChecked ? currentStartDayNum : 1;
    const [qStart, qEnd] = resolveDateRange(
      { mode: 'quick', quickOption: opt, monthKey: selection.monthKey },
      effectiveStartDay
    );
    setSelection({
      mode: 'quick',
      monthKey: selection.monthKey,
      quickOption: opt,
      startDate: qStart,
      endDate: qEnd,
    });
  };

  const handleCustomDateChange = (field: 'startDate' | 'endDate', val: string) => {
    if (field === 'startDate') {
      let newEnd = selection.endDate;
      if (isDefaultStartDayChecked || !newEnd || newEnd <= val) {
        newEnd = addDays(addMonths(val, 1), -1);
      }
      setSelection({
        ...selection,
        mode: 'custom',
        startDate: val,
        endDate: newEnd,
      });
    } else {
      setSelection({
        ...selection,
        mode: 'custom',
        endDate: val,
      });
    }
  };

  const handleToggleDefaultStartDay = (checked: boolean) => {
    setIsDefaultStartDayChecked(checked);
    if (checked) {
      if (selection.startDate) {
        const newEnd = addDays(addMonths(selection.startDate, 1), -1);
        setSelection((prev) => ({
          ...prev,
          endDate: newEnd,
        }));
      }
    } else {
      // Unticked: default start date = 1!
      if (selection.mode === 'quick' && selection.quickOption) {
        const [qStart, qEnd] = resolveDateRange(
          { mode: 'quick', quickOption: selection.quickOption, monthKey: selection.monthKey },
          1
        );
        setSelection((prev) => ({
          ...prev,
          startDate: qStart,
          endDate: qEnd,
        }));
      }
    }
  };

  const handleConfirm = () => {
    let updatedStartDay = 1;
    let finalSelection = { ...selection };

    if (isDefaultStartDayChecked) {
      const day = selection.startDate
        ? parseInt(selection.startDate.split('-')[2] || '1', 10)
        : initialMonthStartDay;
      if (day >= 1 && day <= 28) {
        updatedStartDay = day;
      }
      if (selection.mode === 'custom' && selection.startDate) {
        const cycleKey = getCurrentCycleMonthKey(selection.startDate, updatedStartDay);
        finalSelection = {
          mode: 'month',
          monthKey: cycleKey,
          startDate: selection.startDate,
          endDate: selection.endDate || addDays(addMonths(selection.startDate, 1), -1),
        };
      }
    } else {
      // User unticked "Set day X as default": default start date = 1 ALWAYS!
      updatedStartDay = 1;
      if (selection.mode === 'month') {
        finalSelection = {
          mode: 'month',
          monthKey: monthKey(today()),
        };
      }
    }

    onApply(finalSelection, updatedStartDay);
    onClose();
  };

  return (
    <>
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
              <button
                type="button"
                onClick={() => setPickerField('startDate')}
                className="w-full min-h-[52px] px-3 flex items-center justify-between text-left transition-colors active:bg-soft"
              >
                <span className="text-body-md text-ink">Start Date</span>
                <span className="text-body-md text-ink-sub flex items-center gap-1">
                  {selection.startDate || today()}
                  <Icon name="chevron_right" className="text-[18px]" />
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPickerField('endDate')}
                className="w-full min-h-[52px] px-3 flex items-center justify-between text-left transition-colors active:bg-soft"
              >
                <span className="text-body-md text-ink">End Date</span>
                <span className="text-body-md text-ink-sub flex items-center gap-1">
                  {selection.endDate || today()}
                  <Icon name="chevron_right" className="text-[18px]" />
                </span>
              </button>
            </div>
          </div>

          {/* Checkbox: Set this day as default month start date */}
          <div className="px-2 pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isDefaultStartDayChecked}
                onChange={(e) => handleToggleDefaultStartDay(e.target.checked)}
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

      <DatePickerModal
        open={pickerField !== null}
        onClose={() => setPickerField(null)}
        value={(pickerField && selection[pickerField]) || today()}
        onChange={(val) => {
          if (pickerField) handleCustomDateChange(pickerField, val);
        }}
        title={pickerField === 'startDate' ? 'Select Start Date' : 'Select End Date'}
      />
    </>
  );
}
