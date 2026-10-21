import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '../components/overlay';
import { Badge, CategoryIcon, Icon, MemberAvatar, PrimaryButton, cx } from '../components/ui';
import { longDate, shortDate, today, weekdayName } from '../lib/dates';
import { formatVnd } from '../lib/money';
import { DAILY_CATEGORY_ID, isCategoryHiddenFromInsights, isCategoryCycleHidden } from '../lib/moneyCategories';
import { estimateRestock, statusFromEstimate, STATUS_LABEL } from '../lib/restock';
import type { LedgerEntry } from '../lib/types';
import { quantityLabel } from '../components/rows';
import { useStore } from '../store';
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
  const navigate = useNavigate();
  const accounts = useStore((s) => s.accounts ?? []);
  const members = useStore((s) => s.members ?? []);
  const moneyCategories = useStore((s) => s.moneyCategories ?? []);
  const items = useStore((s) => s.items ?? []);
  const allPurchases = useStore((s) => s.purchases ?? []);
  const transactions = useStore((s) => s.transactions ?? []);

  const [linkedItemId, setLinkedItemId] = useState<string | null>(null);

  useEffect(() => {
    setLinkedItemId(null);
  }, [entry?.id, open]);

  const rawItemName = (entry?.itemName || entry?.notes || '').trim();
  const entryName = rawItemName.toLowerCase();

  const item = useMemo(() => {
    if (!entry) return undefined;
    const targetId = linkedItemId || entry.itemId;
    if (targetId) {
      const found = items.find((i) => i.id === targetId);
      if (found) return found;
    }
    if (!entryName) return undefined;
    return items.find((i) => i.name && i.name.trim().toLowerCase() === entryName);
  }, [entry, items, entryName, linkedItemId]);

  const allHistoryPurchases = useMemo(() => {
    if (!entry) return [];
    const list: Array<{
      id: string;
      date: string;
      price: number | null;
      quantity: number;
      unit: string;
      store: string;
      notes: string;
      isCurrent: boolean;
    }> = [];
    const currentRawId = (entry.id || '').replace(/^(pur-|tx-)/, '');

    // 1. Household purchases
    for (const p of allPurchases) {
      const pName = (p.itemName || '').trim().toLowerCase();
      const match = (item && p.itemId === item.id) || (Boolean(entryName) && pName === entryName);
      if (match) {
        list.push({
          id: `pur-${p.id}`,
          date: p.purchaseDate || '',
          price: p.price ?? null,
          quantity: p.quantity || 1,
          unit: p.unit || item?.unit || 'item',
          store: p.store || '',
          notes: p.notes || '',
          isCurrent: entry.kind === 'purchase' && (entry.rawPurchase?.id === p.id || currentRawId === p.id),
        });
      }
    }

    // 2. Personal / household transactions
    for (const tx of transactions) {
      if (tx.type !== 'expense') continue;
      const txNote = (tx.note || '').trim().toLowerCase();
      const match = (item && tx.itemId === item.id) || (Boolean(entryName) && txNote === entryName);
      if (match) {
        list.push({
          id: `tx-${tx.id}`,
          date: tx.date || '',
          price: tx.amount ?? null,
          quantity: tx.quantity || 1,
          unit: tx.unit || item?.unit || 'item',
          store: '',
          notes: tx.note || '',
          isCurrent: entry.kind === 'transaction' && (entry.rawTransaction?.id === tx.id || currentRawId === tx.id),
        });
      }
    }

    if (!list.some((p) => p.isCurrent)) {
      list.unshift({
        id: entry.id || '',
        date: entry.date || '',
        price: entry.amount ?? null,
        quantity: entry.rawPurchase?.quantity ?? entry.rawTransaction?.quantity ?? 1,
        unit: entry.rawPurchase?.unit ?? entry.rawTransaction?.unit ?? item?.unit ?? 'item',
        store: entry.rawPurchase?.store ?? '',
        notes: entry.notes ?? '',
        isCurrent: true,
      });
    }

    return list.sort((a, b) => {
      const cmp = (b.date || '').localeCompare(a.date || '');
      return cmp !== 0 ? cmp : (b.id || '').localeCompare(a.id || '');
    });
  }, [entry, item, entryName, allPurchases, transactions]);

  // Restock estimate / product cycle calculation (Hook placed before any early returns)
  const est = useMemo(() => {
    if (!entry) return null;
    try {
      const purchaseDates = allHistoryPurchases
        .filter((p) => Boolean(p.date))
        .map((p) => ({
          purchaseDate: p.date,
          quantity: p.quantity,
          unit: p.unit,
        }));
      if (purchaseDates.length === 0) return null;
      return estimateRestock(
        {
          expectedUsageDays: item?.expectedUsageDays ?? null,
          usagePerPurchaseUnit: item?.usagePerPurchaseUnit ?? null,
        },
        purchaseDates,
        today(),
      );
    } catch (err) {
      console.warn('Failed to calculate estimateRestock', err);
      return null;
    }
  }, [entry, allHistoryPurchases, item]);

  if (!open || !entry) return null;

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
        ? `${quantity} ${unit || 'item'} (${quantity * ratio} ${usageUnit || 'items'})`
        : `${quantity} ${unit || 'items'}`
      : unit || null;

  // Average price calculation for item across all history purchases
  const priced = allHistoryPurchases.filter((p) => p.price != null && p.price > 0);
  const totalPrice = priced.reduce((sum, p) => sum + (p.price || 0), 0);
  const totalQty = priced.reduce((sum, p) => sum + (p.quantity || 1), 0);
  const avgPrice = totalQty > 0 ? Math.round(totalPrice / totalQty) : null;
  const hasConversion = !!(item?.usagePerPurchaseUnit && item.usagePerPurchaseUnit > 1);
  const costPerUsage = hasConversion && avgPrice != null ? Math.round(avgPrice / item!.usagePerPurchaseUnit!) : null;

  const status = statusFromEstimate(est);

  const effectiveCatId = entry.categoryId || entry.rawPurchase?.spendCategoryId;
  const hideAllInsights =
    entry.type !== 'expense' || isCategoryHiddenFromInsights(effectiveCatId, catName);
  const hideCycleInsights = isCategoryCycleHidden(effectiveCatId, catName);

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

  const handleAddToInventory = () => {
    if (!entry) return;
    const rawName = (entry.itemName || entry.notes || '').trim() || 'Item';
    const newItemId = useStore.getState().addItemFromExpense(entry);
    setLinkedItemId(newItemId);
    toast({ title: 'Added to inventory', subtitle: rawName });
  };

  const handleViewInInventory = () => {
    if (!item) return;
    onClose();
    navigate(`/items/${item.id}`);
  };

  const formattedDate = entry.date ? `${weekdayName(entry.date)}, ${longDate(entry.date)}` : '—';
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
        entry.type === 'expense' ? (
          <div className="grid grid-cols-3 gap-2.5 w-full">
            {/* Button 1: icon thùng rác ko có text */}
            <button
              type="button"
              onClick={handleDelete}
              className="h-11 w-full rounded-xl border border-err-ink/30 text-err-ink hover:bg-err-ink/10 active:bg-err-ink/20 flex items-center justify-center transition-colors shadow-2xs"
              aria-label="Xóa"
              title="Xóa giao dịch"
            >
              <Icon name="delete" className="text-[20px]" />
            </button>

            {/* Button 2: icon " +" và hình box (hoặc xem trong kho nếu đã có) */}
            {item ? (
              <button
                type="button"
                onClick={handleViewInInventory}
                className="h-11 w-full rounded-xl border border-line/70 bg-white text-ink hover:bg-soft active:bg-soft/80 flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                aria-label="Xem trong kho"
                title="Xem trong kho"
              >
                <Icon name="package" className="text-[20px] text-accent shrink-0" />
                <Icon name="chevron_right" className="text-[16px] text-ink-sub shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAddToInventory}
                className="h-11 w-full rounded-xl bg-sky text-ink hover:bg-sky-dark/15 active:bg-sky-dark active:text-white active:scale-[0.99] flex items-center justify-center gap-1.5 transition-all shadow-sm"
                aria-label="Thêm vào kho"
                title="Thêm vào kho"
              >
                <Icon name="add" className="text-[17px] stroke-[2.5] shrink-0" />
                <Icon name="package" className="text-[20px] shrink-0" />
              </button>
            )}

            {/* Button 3: icon bút + text "Edit" */}
            <PrimaryButton
              onClick={() => {
                onClose();
                onEdit(entry);
              }}
              className="!min-h-0 !h-11 !rounded-xl !px-2 w-full flex items-center justify-center gap-1.5 text-body-sm font-semibold"
              aria-label="Edit"
            >
              <Icon name="edit" className="text-[18px]" />
              <span>Edit</span>
            </PrimaryButton>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 w-full">
            <button
              type="button"
              onClick={handleDelete}
              className="h-11 px-4 rounded-xl border border-err-ink/30 text-err-ink hover:bg-err-ink/10 active:bg-err-ink/20 flex items-center justify-center transition-colors shadow-2xs"
              aria-label="Xóa"
              title="Xóa giao dịch"
            >
              <Icon name="delete" className="text-[20px]" />
            </button>
            <PrimaryButton
              onClick={() => {
                onClose();
                onEdit(entry);
              }}
              className="flex-1 !min-h-0 !h-11 !rounded-xl flex items-center justify-center gap-1.5 text-body-sm font-semibold"
            >
              <Icon name="edit" className="text-[18px]" />
              <span>Edit</span>
            </PrimaryButton>
          </div>
        )
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
              <span className="text-ink-sub shrink-0">
                {entry.type === 'transfer' ? 'Description' : 'Item'}
              </span>
              <div className="flex items-center gap-2 justify-end text-right flex-wrap min-w-0">
                <span className="font-semibold text-ink break-words">
                  {entry.itemName || entry.notes || (entry.type === 'transfer' ? 'Transfer' : '—')}
                </span>
                {entry.type === 'expense' && item && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-done-ink bg-done-ink/10 px-2 py-0.5 rounded-full shrink-0">
                    Trong kho ✓
                  </span>
                )}
              </div>
            </div>

            {/* Note if different from item name */}
            {entry.notes && entry.notes.trim() !== (entry.itemName || '').trim() && (
              <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
                <span className="text-ink-sub shrink-0">Note</span>
                <span className="font-medium text-ink text-right break-words">{entry.notes}</span>
              </div>
            )}

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

        {/* 2. Item Insights: Average, Typical usage, Next purchase */}
        {!hideAllInsights && (hideCycleInsights ? (avgPrice != null || item?.currentStock != null) : (item || allHistoryPurchases.length > 0 || avgPrice != null || est != null)) && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-label-md uppercase tracking-wider font-semibold text-ink-sub">
                Item Insights
              </span>
              {!hideCycleInsights && status !== 'unknown' && (
                <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
              )}
            </div>
            <div className="bg-surface rounded-2xl border border-line/50 divide-y divide-line/40 overflow-hidden shadow-2xs">
              {/* Average */}
              <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
                <span className="text-ink-sub shrink-0">Average</span>
                <div className="text-right">
                  {avgPrice != null ? (
                    <span className="font-semibold text-ink">
                      {formatVnd(avgPrice)} {unit ? `/ ${unit}` : ''}
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

              {/* Typical Usage (Product cycle) */}
              {!hideCycleInsights && (
                <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
                  <span className="text-ink-sub shrink-0">Typical usage</span>
                  <div className="text-right">
                    {est ? (
                      <div>
                        <span className="font-semibold text-ink">
                          ~{est.cycleDays} days / {unit || 'item'}
                        </span>
                        {hasConversion && est.daysPerUnit && est.daysPerUnit !== est.cycleDays && (
                          <span className="block text-caption text-ink-sub font-normal">
                            ~{est.daysPerUnit >= 1 ? est.daysPerUnit.toFixed(1) : est.daysPerUnit.toFixed(2)} days / {usageUnit}
                          </span>
                        )}
                      </div>
                    ) : item?.expectedUsageDays ? (
                      <span className="font-semibold text-ink">~{item.expectedUsageDays} days</span>
                    ) : (
                      <span className="font-medium text-ink-sub">Not enough data</span>
                    )}
                  </div>
                </div>
              )}

              {/* Next Purchase */}
              {!hideCycleInsights && (
                <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
                  <span className="text-ink-sub shrink-0">Next purchase</span>
                  <div className="text-right">
                    {est ? (
                      <span className="font-semibold text-ink">
                        Around {shortDate(est.nextPurchase)}
                        {est.lastQuantity > 1 && (
                          <span className="text-caption text-ink-sub font-normal ml-1">
                            (x{est.lastQuantity})
                          </span>
                        )}
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
              )}

              {/* Current Stock (if set) */}
              {item?.currentStock != null && (
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

        {/* 3. History (Unified across household & personal records) */}
        {allHistoryPurchases.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-label-md uppercase tracking-wider font-semibold text-ink-sub">
                History
              </span>
              <span className="text-body-sm text-ink-sub">
                {allHistoryPurchases.length} {allHistoryPurchases.length === 1 ? 'record' : 'records'}
              </span>
            </div>
            <div className="bg-surface rounded-2xl border border-line/50 divide-y divide-line/30 overflow-hidden shadow-2xs">
              {allHistoryPurchases.map((p) => (
                <div
                  key={p.id}
                  className={cx(
                    'p-3.5 flex items-center justify-between gap-3 text-body-sm transition-colors',
                    p.isCurrent ? 'bg-sky/15' : 'hover:bg-soft/20'
                  )}
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{longDate(p.date)}</span>
                      {p.isCurrent && (
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
              ))}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

