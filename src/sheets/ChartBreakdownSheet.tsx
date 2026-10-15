import { type ReactNode, useMemo } from 'react';
import { BottomSheet } from '../components/overlay';
import { LedgerRow } from '../components/rows';
import { CategoryIcon, EmptyState, cx } from '../components/ui';
import { shortWeekday } from '../lib/dates';
import { formatVnd } from '../lib/money';
import { sharePct } from '../components/money';
import type { LedgerEntry, TxType } from '../lib/types';
import { useStore } from '../store';

export interface ChartBreakdownSlice {
  key: string;
  name: string;
  icon?: string;
  avatar?: ReactNode;
  color: string;
  total: number;
  count: number;
  share: number;
}

export function ChartBreakdownSheet({
  open,
  onClose,
  slice,
  groupBy,
  txType,
  timeRangeLabel,
  entries,
  onSelectEntry,
}: {
  open: boolean;
  onClose: () => void;
  slice: ChartBreakdownSlice | null;
  groupBy: 'category' | 'account' | 'member';
  txType: TxType;
  timeRangeLabel: string;
  entries: LedgerEntry[];
  onSelectEntry: (entry: LedgerEntry) => void;
}) {
  const accounts = useStore((s) => s.accounts ?? []);
  const members = useStore((s) => s.members ?? []);
  const moneyCategories = useStore((s) => s.moneyCategories ?? []);

  const accountsMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const membersMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const categoriesMap = useMemo(() => new Map(moneyCategories.map((c) => [c.id, c])), [moneyCategories]);

  // Group entries by date
  const dayGroups = useMemo(() => {
    const byDate = new Map<string, LedgerEntry[]>();
    for (const entry of entries) {
      const list = byDate.get(entry.date) ?? [];
      list.push(entry);
      byDate.set(entry.date, list);
    }

    const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

    return sortedDates.map((date) => {
      const dayEntries = byDate.get(date) ?? [];
      dayEntries.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return b.id.localeCompare(a.id);
      });

      const dayTotal = dayEntries.reduce((sum, e) => sum + e.amount, 0);
      const parts = date.split('-').map(Number);
      const dayLabel = `${shortWeekday(date)}, ${parts[1]}/${parts[2]}`;

      return {
        date,
        dayLabel,
        dayTotal,
        entries: dayEntries,
      };
    });
  }, [entries]);

  if (!slice) return null;

  const groupLabel =
    groupBy === 'category'
      ? 'Category'
      : groupBy === 'account'
      ? 'Wallet'
      : 'Member';

  const typeLabel = txType === 'expense' ? 'Expenses' : txType === 'income' ? 'Income' : 'Transfers';

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`${slice.name} · ${timeRangeLabel}`}
      centered
    >
      <div className="flex flex-col gap-4 pb-[env(safe-area-inset-bottom)] w-full min-w-0">
        {/* Summary Card */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-line/50 shadow-xs flex items-center justify-between gap-3 w-full min-w-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            {slice.avatar ? (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0">
                {slice.avatar}
              </div>
            ) : (
              <span
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${slice.color}20` }}
              >
                <CategoryIcon
                  name={(slice.icon as any) || 'package'}
                  size={22}
                  color={slice.color}
                />
              </span>
            )}
            <div className="flex flex-col min-w-0 flex-1">
              <h2 className="text-title-sm font-bold text-ink truncate">{slice.name}</h2>
              <span className="text-body-sm text-ink-sub truncate">
                {groupLabel} · {entries.length} {entries.length === 1 ? 'transaction' : 'transactions'}
              </span>
            </div>
          </div>

          <div className="text-right shrink-0 flex flex-col items-end min-w-0">
            <span
              className={`text-title-sm font-bold tabular-nums whitespace-nowrap ${
                txType === 'expense' ? 'text-err-ink' : txType === 'income' ? 'text-done-ink' : 'text-ink'
              }`}
            >
              {txType === 'expense'
                ? `-${formatVnd(slice.total)}`
                : txType === 'income'
                ? `+${formatVnd(slice.total)}`
                : formatVnd(slice.total)}
            </span>
            <span className="text-caption text-ink-sub whitespace-nowrap">
              {sharePct(slice.share)} of {typeLabel.toLowerCase()}
            </span>
          </div>
        </div>

        {/* Transaction List */}
        {entries.length === 0 ? (
          <div className="py-8">
            <EmptyState message={`No ${typeLabel.toLowerCase()} found for this period.`} />
          </div>
        ) : (
          <div className="flex flex-col gap-2 w-full min-w-0">
            <span className="text-label-md uppercase tracking-wider font-semibold text-ink-sub px-0.5">
              Transactions ({entries.length})
            </span>

            <div className="flex flex-col w-full min-w-0">
              {dayGroups.map((group, groupIdx) => (
                <div key={group.date} className="w-full min-w-0">
                  <div
                    className={cx(
                      'py-2 flex items-center justify-between gap-2 text-body-sm text-ink-sub min-w-0',
                      groupIdx > 0 && 'pt-3.5 border-t border-line/40'
                    )}
                  >
                    <span className="font-semibold text-ink truncate">{group.dayLabel}</span>
                    <span className="text-caption font-medium tabular-nums text-ink-muted shrink-0">
                      {formatVnd(group.dayTotal)}
                    </span>
                  </div>

                  <div className="divide-y divide-line/30">
                    {group.entries.map((entry) => {
                      const moneyCat = entry.categoryId ? categoriesMap.get(entry.categoryId) : undefined;
                      const acc = entry.accountId ? accountsMap.get(entry.accountId) : undefined;
                      const toAcc = entry.toAccountId ? accountsMap.get(entry.toAccountId) : undefined;
                      const mem = entry.memberId ? membersMap.get(entry.memberId) : undefined;

                      const accountName =
                        entry.type === 'transfer'
                          ? acc && toAcc
                            ? `${acc.name} → ${toAcc.name}`
                            : acc?.name || toAcc?.name || 'Transfer'
                          : acc?.name;

                      return (
                        <LedgerRow
                          key={entry.id}
                          entry={entry}
                          moneyCategory={moneyCat}
                          accountName={accountName}
                          memberName={mem?.name}
                          onOpen={() => onSelectEntry(entry)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
