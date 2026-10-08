import { useState, useEffect } from 'react';
import { BottomSheet } from './overlay';
import { cx, Icon } from './ui';
import { today } from '../lib/dates';
import type { DateStr } from '../lib/types';

interface DatePickerModalProps {
  open: boolean;
  onClose: () => void;
  value: DateStr;
  onChange: (date: DateStr) => void;
  title?: string;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function DatePickerModal({
  open,
  onClose,
  value,
  onChange,
  title = 'Select Date',
}: DatePickerModalProps) {
  const [currentYear, setCurrentYear] = useState<number>(() => {
    const parts = (value || today()).split('-');
    return parseInt(parts[0], 10) || 2026;
  });

  const [currentMonth, setCurrentMonth] = useState<number>(() => {
    const parts = (value || today()).split('-');
    return parseInt(parts[1], 10) || 10;
  });

  // Keep display year/month in sync when modal opens or value changes
  useEffect(() => {
    if (open) {
      const parts = (value || today()).split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (y) setCurrentYear(y);
      if (m) setCurrentMonth(m);
    }
  }, [open, value]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Days in month
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  // First day of week (Monday = 0 ... Sunday = 6)
  const firstDayOfWeek = (new Date(currentYear, currentMonth - 1, 1).getDay() + 6) % 7;

  const handleSelectDay = (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(dateStr);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4 pb-4 pt-1">
        {/* Month Navigation Row */}
        <div className="flex items-center justify-between px-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="w-10 h-10 rounded-full flex items-center justify-center text-ink hover:bg-soft active:bg-soft transition-colors"
            aria-label="Previous month"
          >
            <Icon name="chevron_left" className="text-[22px]" />
          </button>

          <button
            type="button"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-soft transition-colors text-body-lg font-semibold text-ink"
          >
            <span>{MONTH_NAMES[currentMonth - 1]} {currentYear}</span>
            <Icon name="expand_more" className="text-[18px] text-ink" />
          </button>

          <button
            type="button"
            onClick={handleNextMonth}
            className="w-10 h-10 rounded-full flex items-center justify-center text-ink hover:bg-soft active:bg-soft transition-colors"
            aria-label="Next month"
          >
            <Icon name="chevron_right" className="text-[22px]" />
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="flex flex-col gap-2">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-body-sm font-semibold text-ink/75 py-1">
                {w}
              </span>
            ))}
          </div>

          {/* Month Days */}
          <div className="grid grid-cols-7 gap-y-2 place-items-center">
            {/* Empty slots for start-of-month padding */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="w-10 h-10" />
            ))}

            {/* Days of current month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = dateStr === value;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={cx(
                    'w-10 h-10 rounded-full flex items-center justify-center text-body-md transition-all select-none',
                    isSelected
                      ? 'bg-[#B5E7F1] text-ink font-bold shadow-sm'
                      : 'text-ink hover:bg-soft active:scale-95'
                  )}
                  aria-selected={isSelected}
                  aria-label={`${MONTH_NAMES[currentMonth - 1]} ${day}, ${currentYear}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
