import { BottomSheet } from './overlay';
import { Icon } from './ui';
import { headerDate, relativeDay, shortDate } from '../lib/dates';
import type { DateStr } from '../lib/types';

interface DeleteRecurrenceModalProps {
  open: boolean;
  onClose: () => void;
  taskTitle: string;
  selectedDate: DateStr;
  onDeleteOccurrence: () => void;
  onDeleteSeries: () => void;
}

export function DeleteRecurrenceModal({
  open,
  onClose,
  taskTitle,
  selectedDate,
  onDeleteOccurrence,
  onDeleteSeries,
}: DeleteRecurrenceModalProps) {
  const rel = relativeDay(selectedDate);
  const dateFormatted = rel === shortDate(selectedDate) ? headerDate(selectedDate) : `${rel} (${headerDate(selectedDate)})`;

  return (
    <BottomSheet open={open} onClose={onClose} title="Delete recurring task?">
      <div className="flex flex-col gap-4 py-2">
        <p className="text-body-md text-ink-sub">
          &ldquo;<strong className="text-ink font-semibold">{taskTitle}</strong>&rdquo; is a recurring task. Do you want to delete only the occurrence on <strong className="text-ink font-semibold">{dateFormatted}</strong> or delete all occurrences in this series?
        </p>

        <div className="flex flex-col gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              onClose();
              onDeleteOccurrence();
            }}
            className="w-full min-h-[54px] px-4 py-3 rounded-2xl border border-line bg-surface hover:bg-soft active:bg-line/40 transition-colors flex items-center justify-between group text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-sky/30 flex items-center justify-center text-sky-dark shrink-0">
                <Icon name="calendar_today" className="text-[20px]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-body-md font-semibold text-ink">This occurrence only</span>
                <span className="text-caption text-ink-sub">Delete only for {shortDate(selectedDate)}</span>
              </div>
            </div>
            <Icon name="chevron_right" className="text-[20px] text-ink-sub group-hover:translate-x-0.5 transition-transform shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onDeleteSeries();
            }}
            className="w-full min-h-[54px] px-4 py-3 rounded-2xl border border-err/30 bg-err-bg hover:bg-err/40 active:bg-err/60 transition-colors flex items-center justify-between group text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-err/30 flex items-center justify-center text-err-ink shrink-0">
                <Icon name="delete" className="text-[20px]" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-body-md font-semibold text-err-ink">All occurrences</span>
                <span className="text-caption text-err-ink/80">Delete this and all upcoming repeats</span>
              </div>
            </div>
            <Icon name="chevron_right" className="text-[20px] text-err-ink/60 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[46px] rounded-xl text-body-md font-medium text-ink-sub hover:text-ink active:bg-soft transition-colors mt-1"
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  );
}
