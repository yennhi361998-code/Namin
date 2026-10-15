import { useMemo } from 'react';
import { BottomSheet } from '../components/overlay';
import { Badge, CategoryIcon, Icon, MemberAvatar, PrimaryButton, cx } from '../components/ui';
import { longDate, shortDate, weekdayName } from '../lib/dates';
import { formatVnd } from '../lib/money';
import { DAILY_CATEGORY_ID } from '../lib/moneyCategories';
import { statusFromEstimate, STATUS_LABEL } from '../lib/restock';
import type { LedgerEntry } from '../lib/types';
import { quantityLabel } from '../components/rows';
import { useStore } from '../store';
import { useRestockMap } from '../store/selectors';
import { toast } from '../store/ui';

const STATUS_TONE = { in_stock: 'done', running_low: 'warn', out: 'err', unknown: 'plain' } as const;

export function TransactionDetailSheet({
  open,
  onClose,
  entry,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  entry: LedgerEntry | null;
  onEdit: (entry: LedgerEntry) => void;
}) {
  const accounts = useStore((s) => s.accounts ?? []);
  const members = useStore((s) => s.members ?? []);
  const moneyCategories = useStore((s) => s.moneyCategories ?? []);
  const items = useStore((s) => s.items);
  const allPurchases = useStore((s) => s.purchases);
  const transactions = useStore((s) => s.transactions);
  const restockMap = useRestockMap();

  const item = useMemo(() => {
    if (!entry) return undefined;
    if (entry.itemId) return items.find((i) => i.id === entry.itemId);
    return items.find((i) => i.name.trim().toLowerCase() === entry.itemName.trim().toLowerCase());
  }, [entry, items]);

  const itemPurchases = useMemo(() => {
    if (!item) return [];
    return allPurchases
      .filter((p) => p.itemId === item.id)
      .sort((a, b) => {
        const dateCmp = b.purchaseDate.localeCompare(a.purchaseDate);
        if (dateCmp !== 0) return dateCmp;
        if (a.createdAt && b.createdAt) return b.createdAt.localeCompare(a.createdAt);
        return 0;
      });
  }, [allPurchases, item]);

  const matchingTransactions = useMemo(() => {
    if (!entry || item) return [];
    const rawId = entry.id.replace(/^(tx-|pur-)/, '');
    return transactions
      .filter((t) => t.id !== rawId && t.note.trim().toLowerCase() === entry.itemName.trim().toLowerCase())
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [entry, item, transactions]);

  if (!entry) return null;

  const moneyCategory = entry.categoryId
    ? moneyCategories.find((c) => c.id === entry.categoryId)
    : undefined;

  const account = entry.accountId ? accounts.find((a) => a.id === entry.accountId) : undefined;
  const toAccount = entry.toAccountId ? accounts.find((a) => a.id === entry.toAccountId) : undefined;
  const member = entry.memberId ? members.find((m) => m.id === entry.memberId) : undefined;

  const color = moneyCategory?.color || '#94A3B8';
  const iconName = moneyCategory?.icon || (entry.type === 'transfer' ? 'swap_horiz' : 'package');
  const catName =
    moneyCategory?.name ||
    (entry.categoryId === DAILY_CATEGORY_ID
      ? 'Daily'
      : entry.type === 'income'
      ? 'Income'
      : entry.type === 'transfer'
      ? 'Transfer'
      : 'Other');

  // Quantity / packaging info
  const quantity = entry.rawPurchase?.quantity ?? entry.rawTransaction?.quantity;
  const unit = entry.rawPurchase?.unit ?? entry.rawTransaction?.unit ?? item?.unit;
  const usageUnit = item?.usageUnit?.trim() || unit;
  const ratio =
    item?.usagePerPurchaseUnit && item.usagePerPurchaseUnit > 0
      ? item.usagePerPurchaseUnit
      : entry.rawTransaction?.usagePerPurchaseUnit && entry.rawTransaction.usagePerPurchaseUnit > 0
      ? entry.rawTransaction.usagePerPurchaseUnit
      : 1;

  const packagingText =
    quantity != null && quantity > 0
      ? ratio > 1
        ? `${quantity} ${unit || 'pack'} (${quantity * ratio} ${usageUnit || 'items'})`
        : `${quantity} ${unit || 'items'}`
      : unit || null;

  // Average price calculation for item
  const priced = itemPurchases.filter((p) => p.price != null && p.price > 0);
  const totalPrice = priced.reduce((sum, p) => sum + p.price!, 0);
  const totalQty = priced.reduce((sum, p) => sum + (p.quantity || 1), 0);
  const avgPrice = totalQty > 0 ? Math.round(totalPrice / totalQty) : null;
  const hasConversion = !!(item?.usagePerPurchaseUnit && item.usagePerPurchaseUnit > 1);
  const costPerUsage = hasConversion && avgPrice != null ? Math.round(avgPrice / item!.usagePerPurchaseUnit!) : null;

  // Restock estimate for item
  const est = item ? restockMap.get(item.id) ?? null : null;
  const status = statusFromEstimate(est);

  const handleDelete = () => {
    if (entry.kind === 'purchase') {
      const rawId = entry.id.replace(/^pur-/, '');
      const undo = useStore.getState().deletePurchase(rawId);
      toast({ title: 'Purchase deleted', action: { label: 'Undo', run: undo } });
    } else {
      const rawId = entry.id.replace(/^tx-/, '');
      const undo = useStore.getState().deleteTransaction(rawId);
      toast({ title: 'Transaction deleted', action: { label: 'Undo', run: undo } });
    }
    onClose();
  };

  const formattedDate = `${weekdayName(entry.date)}, ${longDate(entry.date)}`;
  const titleLabel =
    entry.type === 'expense'
      ? 'Expense Details'
      : entry.type === 'income'
      ? 'Income Details'
      : 'Transfer Details';

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={titleLabel}
      footer={
        <div className="flex items-center gap-3 w-full">
          <button
            type="button"
            onClick={handleDelete}
            className="h-11 px-4 rounded-xl border border-err-ink/30 text-err-ink font-semibold text-body-sm hover:bg-err-ink/10 active:bg-err-ink/20 flex items-center justify-center gap-1.5 transition-colors shrink-0"
            aria-label="Delete entry"
          >
            <Icon name="delete" className="text-[18px]" />
            <span>Delete</span>
          </button>
          <PrimaryButton
            onClick={() => {
              onClose();
              onEdit(entry);
            }}
            className="flex-1 !h-11 flex items-center justify-center gap-1.5"
          >
            <Icon name="edit" className="text-[18px]" />
            <span>Edit</span>
          </PrimaryButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-2 w-full min-w-0">
        {/* Top Summary Banner */}
        <div className="flex flex-col items-center justify-center py-3.5 bg-soft/30 rounded-2xl border border-line/40">
          <span
            className="w-14 h-14 rounded-full flex items-center justify-center mb-2.5 shrink-0 shadow-2xs"
            style={{ backgroundColor: `${color}25` }}
          >
            {entry.type === 'transfer' ? (
              <Icon name="swap_horiz" className="text-[28px]" style={{ color }} />
            ) : (
              <CategoryIcon name={iconName} size={28} color={color} />
            )}
          </span>

          <span
            className={cx(
              'text-[28px] sm:text-[32px] font-bold tabular-nums tracking-tight',
              entry.type === 'expense'
                ? 'text-err-ink'
                : entry.type === 'income'
                ? 'text-done-ink'
                : 'text-ink'
            )}
          >
            {entry.type === 'expense'
              ? `-${formatVnd(entry.amount)}`
              : entry.type === 'income'
              ? `+${formatVnd(entry.amount)}`
              : formatVnd(entry.amount)}
          </span>

          <span className="text-body-sm font-semibold text-ink mt-1 px-3 py-0.5 rounded-full bg-white/80 border border-line/50">
            {catName}
          </span>
        </div>

        {/* 1. Transaction Information Card */}
        <div className="flex flex-col gap-1.5">
          <span className="text-label-md uppercase tracking-wider font-semibold text-ink-sub px-0.5">
            Transaction Details
          </span>
          <div className="bg-surface rounded-2xl border border-line/50 divide-y divide-line/40 overflow-hidden shadow-2xs">
            {/* Item Name */}
            <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
              <span className="text-ink-sub shrink-0">Item</span>
              <span className="font-semibold text-ink text-right break-words">{entry.itemName}</span>
            </div>

            {/* Date */}
            <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
              <span className="text-ink-sub shrink-0">Date</span>
              <span className="font-medium text-ink text-right">{formattedDate}</span>
            </div>

            {/* Category */}
            <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
              <span className="text-ink-sub shrink-0">Category</span>
              <div className="flex items-center gap-1.5 font-medium text-ink">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${color}20` }}
                >
                  <CategoryIcon name={iconName} size={12} color={color} />
                </span>
                <span>{catName}</span>
              </div>
            </div>

            {/* Account / Wallet or Transfer Route */}
            <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
              <span className="text-ink-sub shrink-0">
                {entry.type === 'transfer' ? 'Transfer Route' : 'Account / Wallet'}
              </span>
              <span className="font-medium text-ink text-right">
                {entry.type === 'transfer'
                  ? account && toAccount
                    ? `${account.name} → ${toAccount.name}`
                    : account?.name || toAccount?.name || 'Transfer'
                  : account?.name || 'Unassigned account'}
              </span>
            </div>

            {/* Member */}
            <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
              <span className="text-ink-sub shrink-0">Member</span>
              <div className="flex items-center gap-2">
                <MemberAvatar member={member} size={24} />
                <span className="font-medium text-ink">{member?.name || 'Anyone'}</span>
              </div>
            </div>

            {/* Quantity & Packaging */}
            {packagingText && (
              <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
                <span className="text-ink-sub shrink-0">Quantity & Packaging</span>
                <span className="font-medium text-ink text-right">{packagingText}</span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Item Insights: Average price, Typical usage, Next purchase */}
        {item && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-label-md uppercase tracking-wider font-semibold text-ink-sub">
                Item Insights
              </span>
              {status !== 'unknown' && (
                <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
              )}
            </div>
            <div className="bg-surface rounded-2xl border border-line/50 divide-y divide-line/40 overflow-hidden shadow-2xs">
              {/* Average Price */}
              <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
                <span className="text-ink-sub shrink-0">Average price</span>
                <div className="text-right">
                  {avgPrice != null ? (
                    <span className="font-semibold text-ink">
                      {formatVnd(avgPrice)} {item.unit ? `/ ${item.unit}` : ''}
                      {costPerUsage != null && (
                        <span className="block text-caption text-ink-sub font-normal">
                          ~{formatVnd(costPerUsage)} / {usageUnit}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="font-medium text-ink-sub">Not enough data</span>
                  )}
                </div>
              </div>

              {/* Typical Usage */}
              <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
                <span className="text-ink-sub shrink-0">Typical usage</span>
                <span className="font-semibold text-ink text-right">
                  {est ? `~${est.cycleDays} days` : item.expectedUsageDays ? `~${item.expectedUsageDays} days` : 'Not enough data'}
                </span>
              </div>

              {/* Next Purchase */}
              <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
                <span className="text-ink-sub shrink-0">Next purchase</span>
                <div className="text-right">
                  {est ? (
                    <span className="font-semibold text-ink">
                      Around {shortDate(est.nextPurchase)}
                      <span
                        className={cx(
                          'block text-caption font-normal',
                          est.daysLeft <= 0 ? 'text-err-ink font-semibold' : est.daysLeft <= 7 ? 'text-warn-ink' : 'text-ink-sub'
                        )}
                      >
                        {est.daysLeft > 0 ? `In ${est.daysLeft} days` : est.daysLeft === 0 ? 'Due today' : `${-est.daysLeft} days overdue`}
                      </span>
                    </span>
                  ) : (
                    <span className="font-medium text-ink-sub">Not enough data</span>
                  )}
                </div>
              </div>

              {/* Current Stock (if set) */}
              {item.currentStock != null && (
                <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
                  <span className="text-ink-sub shrink-0">Current stock</span>
                  <span className="font-semibold text-ink text-right">
                    {item.currentStock} {usageUnit}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. Purchase History */}
        {itemPurchases.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-label-md uppercase tracking-wider font-semibold text-ink-sub">
                Purchase history
              </span>
              <span className="text-body-sm text-ink-sub">
                {itemPurchases.length} {itemPurchases.length === 1 ? 'purchase' : 'purchases'}
              </span>
            </div>
            <div className="bg-surface rounded-2xl border border-line/50 divide-y divide-line/30 overflow-hidden shadow-2xs">
              {itemPurchases.map((p) => {
                const isCurrent = p.id === entry.rawPurchase?.id || entry.id === `pur-${p.id}`;
                return (
                  <div
                    key={p.id}
                    className={cx(
                      'p-3.5 flex items-center justify-between gap-3 text-body-sm transition-colors',
                      isCurrent ? 'bg-sky/15' : 'hover:bg-soft/20'
                    )}
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">{longDate(p.purchaseDate)}</span>
                        {isCurrent && (
                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-header-ink text-white">
                            Current
                          </span>
                        )}
                      </div>
                      <span className="text-caption text-ink-sub truncate mt-0.5">
                        {[quantityLabel(p.quantity, p.unit), p.store, p.notes].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </div>
                    <span className="font-semibold text-ink tabular-nums shrink-0">
                      {p.price != null ? formatVnd(p.price) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Past Transactions (when not an inventory item, but has similar past transactions) */}
        {!item && matchingTransactions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-label-md uppercase tracking-wider font-semibold text-ink-sub">
                Past transactions
              </span>
              <span className="text-body-sm text-ink-sub">
                {matchingTransactions.length} {matchingTransactions.length === 1 ? 'record' : 'records'}
              </span>
            </div>
            <div className="bg-surface rounded-2xl border border-line/50 divide-y divide-line/30 overflow-hidden shadow-2xs">
              {matchingTransactions.map((tx) => (
                <div key={tx.id} className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-ink">{longDate(tx.date)}</span>
                    <span className="text-caption text-ink-sub truncate mt-0.5">
                      {[quantityLabel(tx.quantity ?? 1, tx.unit ?? ''), tx.note].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <span className="font-semibold text-ink tabular-nums shrink-0">
                    {formatVnd(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

