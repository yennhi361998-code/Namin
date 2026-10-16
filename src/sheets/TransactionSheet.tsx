import { useEffect, useMemo, useRef, useState } from 'react';
import { CategoryTile } from '../components/money';
import { BottomSheet } from '../components/overlay';
import { AmountPad, Key } from '../components/keypad';
import { cx, Icon, MemberAvatar } from '../components/ui';
import { evaluate, press } from '../lib/calc';
import { guessCategory } from '../lib/categories';
import { addDays, shortDate, today } from '../lib/dates';
import { formatVnd } from '../lib/money';
import type { DateStr, FinanceScope, TxType } from '../lib/types';
import { useStore } from '../store';
import { useAccountBalances, useCategoryChoices } from '../store/selectors';
import { toast } from '../store/ui';
import { DAILY_CATEGORY_ID } from '../lib/moneyCategories';
import { CategoriesSheet } from './CategoriesSheet';
import { AccountSheet } from './AccountSheet';
import { DatePickerModal } from '../components/DatePickerModal';
import { UnitPickerModal } from '../components/UnitPickerModal';
import { getGeminiApiKey, setGeminiApiKey, parseReceiptWithGemini } from '../lib/vision';

/** Add or edit an expense/income: category grid on top, calculator keypad below. */
export function TransactionSheet({
  open,
  onClose,
  transactionId,
  txType = 'expense',
  date: initialDate,
  scope: initialScope = 'household',
  initialValues,
}: {
  open: boolean;
  onClose: () => void;
  transactionId?: string;
  txType?: TxType;
  date?: DateStr;
  scope?: FinanceScope;
  initialValues?: {
    amount?: number;
    note?: string;
    categoryId?: string;
    quantity?: number;
    unit?: string;
    shoppingItemId?: string;
    itemId?: string;
  };
}) {
  const [existing] = useState(() => {
    if (!transactionId) return undefined;
    const tx = useStore.getState().transactions.find((t) => t.id === transactionId);
    if (tx) return { ...tx, _isPurchase: false };
    const pur = useStore.getState().purchases.find((p) => p.id === transactionId);
    if (pur) {
      const it = pur.itemId ? useStore.getState().items.find((i) => i.id === pur.itemId) : undefined;
      return {
        id: pur.id,
        householdId: pur.householdId,
        type: 'expense' as TxType,
        categoryId: pur.spendCategoryId ?? DAILY_CATEGORY_ID,
        amount: pur.price ?? 0,
        date: pur.purchaseDate,
        note: pur.itemName,
        quantity: pur.quantity,
        unit: pur.unit,
        usageUnit: it?.usageUnit ?? null,
        usagePerPurchaseUnit: it?.usagePerPurchaseUnit ?? null,
        itemId: pur.itemId,
        memberId: pur.memberId ?? null,
        accountId: pur.accountId ?? null,
        toAccountId: null,
        createdAt: pur.createdAt ?? '',
        _isPurchase: true,
      };
    }
    return undefined;
  });
  const [type, setType] = useState<TxType>(existing?.type ?? txType);
  const choices = useCategoryChoices(type);
  const balances = useAccountBalances();
  const accounts = useStore((s) => s.accounts ?? []);
  const members = useStore((s) => s.members ?? []);
  const items = useStore((s) => s.items);
  const recordPurchase = useStore((s) => s.recordPurchase);
  const currentMemberId = useStore((s) => s.currentMemberId);

  const preferredAccount =
    accounts.find((a) => (initialScope === 'personal' ? a.scope === 'personal' : a.scope !== 'personal')) ??
    accounts[0];
  const [categoryId, setCategoryId] = useState<string | null>(
    () => existing?.categoryId ?? initialValues?.categoryId ?? null
  );
  const [accountId, setAccountId] = useState<string | null>(existing?.accountId ?? preferredAccount?.id ?? null);
  const [toAccountId, setToAccountId] = useState<string | null>(
    existing?.toAccountId ??
      accounts.find((a) => a.id !== (existing?.accountId ?? preferredAccount?.id))?.id ??
      accounts[1]?.id ??
      null
  );
  const [pickingAccountFor, setPickingAccountFor] = useState<'from' | 'to'>('from');
  const [memberId, setMemberId] = useState<string | null>(existing?.memberId ?? currentMemberId);
  const [expr, setExpr] = useState(() => (existing ? String(existing.amount) : initialValues?.amount ? String(initialValues.amount) : ''));
  const [note, setNote] = useState(() => existing?.note ?? initialValues?.note ?? '');
  const [quantity, setQuantity] = useState(() => existing?.quantity ?? initialValues?.quantity ?? 1);
  const [unit, setUnit] = useState(() => existing?.unit ?? initialValues?.unit ?? '');
  const [usagePerPurchaseUnit, setUsagePerPurchaseUnit] = useState(
    existing?.usagePerPurchaseUnit ? String(existing.usagePerPurchaseUnit) : '',
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(existing?.itemId ?? initialValues?.itemId ?? null);
  const [date, setDate] = useState<DateStr>(existing?.date ?? initialDate ?? today());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const submitted = useRef(false);

  // Bill & receipt scanning
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleProcessFile = async (file: File) => {
    setIsScanning(true);
    try {
      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        setPendingFile(file);
        setApiKeyModalOpen(true);
        setIsScanning(false);
        return;
      }
      const categoryOptions = choices.map((c) => ({ id: c.id, name: c.name }));
      const result = await parseReceiptWithGemini(file, categoryOptions);

      if (result.amount > 0) {
        setExpr(String(result.amount));
      }
      if (result.note) {
        setNote(result.note);
      }
      if (result.date) {
        setDate(result.date as DateStr);
      }
      if (result.matchedCategoryId) {
        setCategoryId(result.matchedCategoryId);
      }
      if (result.type && result.type !== type) {
        setType(result.type);
      }
      if (result.items && result.items.length > 0) {
        const first = result.items[0];
        if (first.quantity > 0) setQuantity(first.quantity);
        if (first.unit) setUnit(first.unit);
      }
      toast({
        title: 'Receipt parsed successfully!',
        subtitle: `${result.amount > 0 ? formatVnd(result.amount) + ' • ' : ''}${result.note}`,
      });
    } catch (err: any) {
      console.error('Scan error:', err);
      if (err.message === 'MISSING_API_KEY') {
        setPendingFile(file);
        setApiKeyModalOpen(true);
      } else {
        toast({
          title: 'Could not read receipt',
          subtitle: err.message || 'Please try again with a clearer image.',
          tone: 'error',
        });
      }
    } finally {
      setIsScanning(false);
    }
  };

  // Support clipboard paste for images (Cmd+V / Ctrl+V / paste)
  useEffect(() => {
    if (!open) return;
    const handlePaste = (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;
      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.startsWith('image/')) {
          const file = clipboardItems[i].getAsFile();
          if (file) {
            handleProcessFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [open, choices, type]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const selectedToAccount = accounts.find((a) => a.id === toAccountId);
  const selectedMember = members.find((m) => m.id === memberId);

  const swapAccounts = () => {
    const prevFrom = accountId;
    const prevTo = toAccountId;
    setAccountId(prevTo);
    setToAccountId(prevFrom);
    setError(null);
  };

  // Match item from selectedItemId or note
  const effectiveItem = useMemo(() => {
    if (selectedItemId) return items.find((i) => i.id === selectedItemId);
    const q = note.trim().toLowerCase();
    if (!q) return undefined;
    return items.find((i) => i.name.trim().toLowerCase() === q);
  }, [items, selectedItemId, note]);

  const currentPackagingUnit = unit.trim() || effectiveItem?.unit || 'pack';

  // Fall back to the most-used category when none is chosen (or the chosen one was removed).
  const selected = choices.find((c) => c.id === categoryId) ?? (existing && categoryId === existing.categoryId ? undefined : choices[0]);
  const effectiveCategoryId = selected?.id ?? categoryId;

  const key = (k: string) => {
    setExpr((e) => press(e, k));
    setError(null);
  };

  const save = () => {
    if (submitted.current) return;
    const amount = evaluate(expr);
    if (!amount || amount <= 0) return setError('Enter an amount');

    if (type === 'transfer') {
      if (!accountId || !toAccountId) return setError('Choose both source and destination accounts');
      if (accountId === toAccountId) return setError('Source and destination accounts must be different');
      submitted.current = true;
      const targetScope =
        selectedAccount?.scope === 'personal' && selectedToAccount?.scope === 'personal'
          ? ('personal' as FinanceScope)
          : ('household' as FinanceScope);
      const input = {
        type: 'transfer' as const,
        scope: targetScope,
        categoryId: null,
        amount,
        date,
        note: note.trim(),
        accountId,
        toAccountId,
        memberId,
      };
      const s = useStore.getState();
      if (existing) s.updateTransaction(existing.id, input);
      else s.addTransaction(input);
      toast({ title: existing ? 'Transfer updated' : 'Transfer recorded' });
      onClose();
      return;
    }

    if (!effectiveCategoryId) return setError('Choose a category');
    submitted.current = true;

    const currentPackagingUnit = unit.trim() || effectiveItem?.unit || 'pack';
    // If user does not enter items per, automatically understand 1 pack = 1 item
    const parsedRatio = usagePerPurchaseUnit.trim() ? Number(usagePerPurchaseUnit) : 1;
    const ratioNum = !isNaN(parsedRatio) && parsedRatio > 0 ? parsedRatio : 1;
    const resolvedUsageUnit = effectiveItem?.usageUnit || (ratioNum > 1 ? 'items' : currentPackagingUnit);

    const targetScope: FinanceScope = initialScope === 'personal' ? 'personal' : (selectedAccount?.scope ?? 'household');

    // If an item, note, or unit is specified on an expense, and it is household scope, record it as a purchase so stock and units are updated
    if (!existing && type === 'expense' && targetScope === 'household' && (note.trim() || effectiveItem || unit.trim() || initialValues?.shoppingItemId)) {
      const itemName = note.trim() || effectiveItem?.name || selected?.name || 'Expense';
      recordPurchase({
        shoppingItemId: initialValues?.shoppingItemId,
        itemId: effectiveItem?.id ?? initialValues?.itemId,
        name: itemName,
        category: effectiveItem?.category ?? guessCategory(itemName) ?? 'Other',
        quantity,
        unit: currentPackagingUnit,
        usageUnit: resolvedUsageUnit,
        usagePerPurchaseUnit: ratioNum,
        price: amount,
        store: '',
        purchaseDate: date,
        spendCategoryId: effectiveCategoryId,
        accountId,
        memberId,
      });
      onClose();
      return;
    }

    const input = {
      type,
      scope: targetScope,
      categoryId: effectiveCategoryId,
      amount,
      date,
      note,
      quantity: unit.trim() || effectiveItem ? quantity : null,
      unit: currentPackagingUnit || null,
      usageUnit: resolvedUsageUnit ?? null,
      usagePerPurchaseUnit: ratioNum > 1 ? ratioNum : null,
      itemId: effectiveItem?.id ?? null,
      accountId,
      toAccountId: null,
      memberId,
    };
    const s = useStore.getState();
    if (existing) {
      if ((existing as any)._isPurchase) {
        s.updatePurchase(existing.id, {
          price: amount,
          purchaseDate: date,
          itemName: note.trim() || effectiveItem?.name || existing.note,
          quantity,
          unit: currentPackagingUnit,
          spendCategoryId: effectiveCategoryId,
          accountId,
          memberId,
        });
        toast({ title: 'Expense updated' });
        onClose();
        return;
      }
      s.updateTransaction(existing.id, input);
    } else {
      s.addTransaction(input);
      if (initialValues?.shoppingItemId) {
        s.removeShoppingItem(initialValues.shoppingItemId);
      }
    }
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    if ((existing as any)._isPurchase) {
      const undo = useStore.getState().deletePurchase(existing.id);
      toast({ title: 'Expense deleted', action: { label: 'Undo', run: undo } });
      onClose();
      return;
    }
    const undo = useStore.getState().deleteTransaction(existing.id);
    toast({ title: 'Entry deleted', action: { label: 'Undo', run: undo } });
    onClose();
  };

  const t = today();
  const dateLabel = date === t ? 'Today' : date === addDays(t, -1) ? 'Yesterday' : shortDate(date);
  const label = type === 'expense' ? 'expense' : type === 'income' ? 'income' : 'transfer';

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title={existing ? `Edit ${label}` : `Add ${label}`}
        bodyClassName="pt-1"
        footerClassName="!bg-soft border-line-strong/60 px-3"
        header={
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <button type="button" onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-full text-ink-sub active:bg-soft" aria-label="Close">
              <Icon name="close" className="text-[24px]" />
            </button>
            <div className="flex p-1 bg-line rounded-full" role="tablist" aria-label="Entry type">
              {(['expense', 'income', 'transfer'] as const).map((tp) => (
                <button
                  key={tp}
                  type="button"
                  role="tab"
                  aria-selected={type === tp}
                  onClick={() => {
                    setType(tp);
                    setCategoryId(null);
                    setError(null);
                  }}
                  className={cx('min-h-[36px] px-3.5 rounded-full text-label-md transition-all', type === tp ? 'bg-sky text-ink font-semibold shadow-sm' : 'text-ink-sub')}
                >
                  {tp === 'expense' ? 'Expense' : tp === 'income' ? 'Income' : 'Transfer'}
                </button>
              ))}
            </div>
            <div className="flex items-center">
              {existing && (
                <button type="button" onClick={remove} className="w-11 h-11 flex items-center justify-center rounded-full text-err-ink active:bg-err/50" aria-label="Delete entry">
                  <Icon name="delete" className="text-[22px]" />
                </button>
              )}
              <button type="button" onClick={save} className="w-11 h-11 flex items-center justify-center rounded-full text-link active:bg-soft" aria-label="Save">
                <Icon name="check" className="text-[26px]" />
              </button>
            </div>
          </div>
        }
        footer={
          <>
            <AmountPad
              expr={expr}
              onKey={key}
              note={note}
              onNote={(v) => {
                setNote(v);
                setSelectedItemId(null);
              }}
              notePlaceholder={
                type === 'transfer'
                  ? 'Transfer note'
                  : type === 'income'
                  ? 'Income note'
                  : 'Item name'
              }
              error={error}
              onSave={save}
              accountName={type === 'transfer' ? undefined : selectedAccount?.name}
              middleSlot={
                type === 'expense' ? (
                  (() => {
                    const currentPackagingUnit = unit.trim() || effectiveItem?.unit || 'pack';
                    const parsedRatio = usagePerPurchaseUnit.trim() ? Number(usagePerPurchaseUnit) : 1;
                    const ratio = !isNaN(parsedRatio) && parsedRatio > 0 ? parsedRatio : 1;
                    const inflow = quantity * ratio;

                    return (
                      <div className="flex flex-col gap-1 py-0.5">
                        {/* 1 row: [Quantity] ([ - ] 2 [ + ]) - [Packaging unit] (dropdown) - [Items quantity input] - [per 'Packaging unit' text] */}
                        <div className="flex items-center gap-1.5">
                          {/* Upload / Scan button matching the accountSlot column width */}
                          <div className="shrink-0 w-[calc((100%-3*6px)/4)] flex">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isScanning}
                              aria-label="Upload or scan receipt / bill"
                              title="Upload or scan receipt / bill"
                              className={cx(
                                'w-full h-9 rounded-lg bg-surface border border-line/60 shadow-2xs flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer',
                                isScanning ? 'bg-sky/20 text-sky-dark animate-pulse' : 'text-ink-sub hover:text-ink hover:border-line-strong'
                              )}
                            >
                              {isScanning ? (
                                <Icon name="sync" className="text-[17px] animate-spin text-sky-dark" />
                              ) : (
                                <>
                                  <Icon name="upload" className="text-[16px] text-sky-dark" />
                                  <span className="text-[11px] font-semibold text-ink-sub">Scan</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="flex-1 min-w-0 pl-1 flex items-center gap-2 flex-nowrap overflow-x-auto no-scrollbar py-0.5">
                            {/* [Quantity] Stepper ([ - ] 2 [ + ]) */}
                            <div className="inline-flex items-center border border-[#BBD8EB] rounded-lg bg-white shrink-0 h-9 shadow-2xs">
                              <button
                                type="button"
                                className="w-7 h-full flex items-center justify-center text-sky-dark active:bg-soft hover:bg-soft/60 disabled:opacity-25 rounded-l-lg transition-colors"
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                disabled={quantity <= 1}
                                aria-label="Decrease quantity"
                              >
                                <Icon name="remove" className="text-[16px]" />
                              </button>
                              <span className="w-7 text-center text-body-sm font-semibold tabular-nums select-none text-ink">
                                {quantity}
                              </span>
                              <button
                                type="button"
                                className="w-7 h-full flex items-center justify-center text-sky-dark active:bg-soft hover:bg-soft/60 rounded-r-lg transition-colors"
                                onClick={() => setQuantity(quantity + 1)}
                                aria-label="Increase quantity"
                              >
                                <Icon name="add" className="text-[16px]" />
                              </button>
                            </div>

                            {/* [Packaging unit] (button opening modal) */}
                            <button
                              type="button"
                              onClick={() => setUnitPickerOpen(true)}
                              aria-label="Select packaging unit"
                              className="h-9 px-2.5 rounded-lg bg-white border border-[#BBD8EB] text-body-sm font-medium text-ink hover:bg-soft/40 active:bg-soft focus:outline-none focus:border-sky-dark focus:ring-2 focus:ring-sky/30 inline-flex items-center gap-1 cursor-pointer shadow-2xs shrink-0 capitalize"
                            >
                              <span>{currentPackagingUnit}</span>
                              <Icon name="expand_more" className="text-[16px] text-sky-dark pointer-events-none" />
                            </button>

                            {/* [Items quantity input] */}
                            <input
                              inputMode="numeric"
                              value={usagePerPurchaseUnit}
                              onChange={(e) => setUsagePerPurchaseUnit(e.target.value.replace(/[^\d]/g, ''))}
                              placeholder="1"
                              aria-label={`Items per ${currentPackagingUnit}`}
                              className="w-11 h-9 px-1 text-center rounded-lg bg-white border border-[#BBD8EB] text-body-md font-medium text-ink placeholder:text-ink-sub/50 focus:outline-none focus:border-sky-dark focus:ring-2 focus:ring-sky/30 shadow-2xs shrink-0"
                            />

                            {/* [per 'Packaging unit' text] */}
                            <span className="text-body-sm text-ink-sub font-medium shrink-0 select-none whitespace-nowrap">
                              per {currentPackagingUnit}
                            </span>
                          </div>
                        </div>

                        {/* Stock live preview */}
                        {ratio > 1 ? (
                          <div className="flex items-center gap-1.5">
                            <div className="shrink-0 w-[calc((100%-3*6px)/4)]" aria-hidden />
                            <div className="flex-1 min-w-0 pl-1 flex items-center justify-between text-caption text-sky-dark font-medium">
                              <span>
                                {effectiveItem?.currentStock != null
                                  ? `Current stock: ${effectiveItem.currentStock}`
                                  : 'Inventory tracking'}
                              </span>
                              <span>
                                Adds +{inflow} items ({quantity} × {ratio} per {currentPackagingUnit})
                              </span>
                            </div>
                          </div>
                        ) : effectiveItem?.currentStock != null ? (
                          <div className="flex items-center gap-1.5">
                            <div className="shrink-0 w-[calc((100%-3*6px)/4)]" aria-hidden />
                            <div className="flex-1 min-w-0 pl-1 flex items-center justify-between text-caption text-ink-sub">
                              <span>Current stock: {effectiveItem.currentStock} {effectiveItem.usageUnit || currentPackagingUnit}</span>
                              <span>Adds +{quantity} {currentPackagingUnit} to stock</span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })()
                ) : type === 'income' ? (
                  <div className="flex items-center gap-1.5 py-0.5">
                    <div className="shrink-0 w-[calc((100%-3*6px)/4)] flex">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isScanning}
                        aria-label="Upload or scan receipt / bill"
                        title="Upload or scan receipt / bill"
                        className={cx(
                          'w-full h-9 rounded-lg bg-surface border border-line/60 shadow-2xs flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer',
                          isScanning ? 'bg-sky/20 text-sky-dark animate-pulse' : 'text-ink-sub hover:text-ink hover:border-line-strong'
                        )}
                      >
                        {isScanning ? (
                          <Icon name="sync" className="text-[17px] animate-spin text-sky-dark" />
                        ) : (
                          <>
                            <Icon name="upload" className="text-[16px] text-sky-dark" />
                            <span className="text-[11px] font-semibold text-ink-sub">Scan</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : null
              }
              accountSlot={
                type === 'transfer' ? undefined : (
                  <button
                    type="button"
                    onClick={() => {
                      setPickingAccountFor('from');
                      setAccountPickerOpen(true);
                    }}
                    aria-label={`Select account: ${selectedAccount?.name ?? 'Not selected'}`}
                    className="w-full h-full min-h-[56px] rounded-xl bg-surface border border-line/60 shadow-sm flex flex-col items-center justify-center gap-0.5 p-1 active:scale-95 transition-transform"
                  >
                    <Icon
                      name={(selectedAccount?.icon as any) || 'account_balance_wallet'}
                      className="text-[22px]"
                      style={{ color: selectedAccount?.color || '#3FA88B' }}
                    />
                    <span className="text-[10px] font-semibold text-ink-sub truncate max-w-full leading-none">
                      {selectedAccount?.name ?? 'Account'}
                    </span>
                  </button>
                )
              }
              memberSlot={
                <button
                  type="button"
                  onClick={() => setMemberPickerOpen(true)}
                  aria-label={`Select member: ${selectedMember?.name ?? 'All household'}`}
                  className="w-full h-12 rounded-xl bg-surface border border-line/60 shadow-sm flex items-center justify-center active:scale-95 transition-transform"
                >
                  {selectedMember ? (
                    <MemberAvatar member={selectedMember} size={28} />
                  ) : (
                    <Icon name="group" className="text-[22px] text-ink-sub" />
                  )}
                </button>
              }
              firstKey={
                <Key onClick={() => setDatePickerOpen(true)} tone="soft" label={`Date: ${dateLabel}`}>
                  <span className="flex items-center gap-1 text-label-md font-semibold">
                    <Icon name="calendar_today" className="text-[16px]" />
                    {dateLabel}
                  </span>
                </Key>
              }
            />
            <DatePickerModal
              open={datePickerOpen}
              onClose={() => setDatePickerOpen(false)}
              value={date}
              onChange={setDate}
              title="Select Date"
            />
            <UnitPickerModal
              open={unitPickerOpen}
              onClose={() => setUnitPickerOpen(false)}
              value={currentPackagingUnit}
              onChange={setUnit}
            />
          </>
        }
      >
        <div className="flex flex-col gap-3 pb-3">
          {type === 'transfer' ? (
            <div className="py-1 flex flex-col gap-2.5">
              <div className="text-caption font-semibold text-ink-sub uppercase tracking-wider px-1">
                Transfer route
              </div>
              <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2">
                {/* From account */}
                <button
                  type="button"
                  onClick={() => {
                    setPickingAccountFor('from');
                    setAccountPickerOpen(true);
                  }}
                  className="flex flex-col items-center justify-center p-3 rounded-2xl bg-surface hover:bg-surface/80 shadow-xs active:scale-98 transition-all text-center min-h-[90px]"
                >
                  <span className="text-caption text-ink-muted mb-1 font-medium">From</span>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center mb-1.5 shrink-0"
                    style={{ backgroundColor: `${selectedAccount?.color || '#3FA88B'}20` }}
                  >
                    <Icon
                      name={(selectedAccount?.icon as any) || 'account_balance_wallet'}
                      className="text-[20px]"
                      style={{ color: selectedAccount?.color || '#3FA88B' }}
                    />
                  </div>
                  <span className="text-body-sm font-semibold text-ink truncate max-w-full">
                    {selectedAccount?.name ?? 'Select'}
                  </span>
                </button>

                {/* Swap button */}
                <button
                  type="button"
                  onClick={swapAccounts}
                  aria-label="Swap accounts"
                  className="w-10 h-10 rounded-full bg-surface shadow-xs flex items-center justify-center text-ink hover:text-sky-dark active:scale-95 transition-all"
                >
                  <Icon name="swap_horiz" className="text-[20px]" />
                </button>

                {/* To account */}
                <button
                  type="button"
                  onClick={() => {
                    setPickingAccountFor('to');
                    setAccountPickerOpen(true);
                  }}
                  className="flex flex-col items-center justify-center p-3 rounded-2xl bg-surface hover:bg-surface/80 shadow-xs active:scale-98 transition-all text-center min-h-[90px]"
                >
                  <span className="text-caption text-ink-muted mb-1 font-medium">To</span>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center mb-1.5 shrink-0"
                    style={{ backgroundColor: `${selectedToAccount?.color || '#6366F1'}20` }}
                  >
                    <Icon
                      name={(selectedToAccount?.icon as any) || 'account_balance_wallet'}
                      className="text-[20px]"
                      style={{ color: selectedToAccount?.color || '#6366F1' }}
                    />
                  </div>
                  <span className="text-body-sm font-semibold text-ink truncate max-w-full">
                    {selectedToAccount?.name ?? 'Select'}
                  </span>
                </button>
              </div>

              {accountId && toAccountId && accountId === toAccountId && (
                <p className="text-caption text-err-ink font-medium text-center">
                  Source and destination accounts must be different.
                </p>
              )}

              {accounts.length < 2 && (
                <button
                  type="button"
                  onClick={() => setCreatingAccount(true)}
                  className="text-label-sm text-link font-medium flex items-center justify-center gap-1.5 py-1.5 border border-dashed border-line-strong rounded-xl hover:bg-soft"
                >
                  <Icon name="add" className="text-[16px]" />
                  Add another account to transfer
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-x-1 gap-y-2" role="radiogroup" aria-label="Category">
              {choices.map((c) => {
                const active = c.id === effectiveCategoryId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setCategoryId(c.id);
                      setError(null);
                    }}
                    className={cx('flex flex-col items-center gap-1 py-2 rounded-xl border-2 transition-colors', active ? 'border-sky-dark bg-soft' : 'border-transparent active:bg-canvas')}
                  >
                    <CategoryTile category={c} size={44} />
                    <span className={cx('text-label-sm truncate max-w-full px-1', active ? 'text-ink font-semibold' : 'text-ink-muted')}>{c.name}</span>
                  </button>
                );
              })}
              <button type="button" onClick={() => setManaging(true)} className="flex flex-col items-center gap-1 py-2 rounded-xl border-2 border-transparent active:bg-canvas" aria-label={`Edit ${label} categories`}>
                <span className="w-11 h-11 rounded-full border-2 border-dashed border-line-strong text-ink-sub flex items-center justify-center">
                  <Icon name="tune" className="text-[20px]" />
                </span>
                <span className="text-label-sm text-ink-sub">Edit</span>
              </button>
            </div>
          )}
        </div>
      </BottomSheet>
      <CategoriesSheet open={managing} onClose={() => setManaging(false)} type={type === 'transfer' ? 'expense' : type} />

      {/* Account Picker Sheet */}
      <BottomSheet
        open={accountPickerOpen}
        onClose={() => setAccountPickerOpen(false)}
        title={
          type === 'transfer'
            ? pickingAccountFor === 'to'
              ? 'Select destination account'
              : 'Select source account'
            : 'Select payment account'
        }
      >
        <div className="flex flex-col gap-3 pb-2">
          {/* Account Groups ordered by scope */}
          {(() => {
            const renderGroup = (isPersonal: boolean) => {
              const list = accounts.filter((a) => (isPersonal ? a.scope === 'personal' : a.scope !== 'personal'));
              if (list.length === 0) return null;
              const title = isPersonal ? 'My Wallets' : 'Our Wallets';
              return (
                <div key={title} className="flex flex-col gap-1.5">
                  <span className="text-caption font-semibold uppercase tracking-wider text-ink-sub px-1">
                    {title}
                  </span>
                  {list.map((acc) => {
                    const active =
                      acc.id === (type === 'transfer' && pickingAccountFor === 'to' ? toAccountId : accountId);
                    const balance = balances[acc.id] ?? 0;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          if (type === 'transfer' && pickingAccountFor === 'to') {
                            setToAccountId(acc.id);
                          } else {
                            setAccountId(acc.id);
                          }
                          setAccountPickerOpen(false);
                          setError(null);
                        }}
                        className={cx(
                          'w-full min-h-[52px] px-3.5 rounded-xl flex items-center gap-3 transition-colors text-left',
                          active ? 'bg-soft border border-sky/40' : 'hover:bg-soft/60 active:bg-soft'
                        )}
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${acc.color || '#3FA88B'}20` }}
                        >
                          <Icon
                            name={(acc.icon as any) || 'account_balance_wallet'}
                            className="text-[20px]"
                            style={{ color: acc.color || '#3FA88B' }}
                          />
                        </div>
                        <span className="flex-1 text-body-md font-medium text-ink truncate">{acc.name}</span>
                        <div className="flex items-center gap-2.5 shrink-0 text-right">
                          <span
                            className={cx(
                              'text-body-sm font-semibold tabular-nums',
                              balance < 0 ? 'text-err-ink' : 'text-ink'
                            )}
                          >
                            {formatVnd(balance)}
                          </span>
                          {active && <Icon name="check" className="text-link text-[20px] shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            };

            return initialScope === 'personal' ? (
              <>
                {renderGroup(true)}
                {renderGroup(false)}
              </>
            ) : (
              <>
                {renderGroup(false)}
                {renderGroup(true)}
              </>
            );
          })()}

          <button
            type="button"
            onClick={() => {
              setAccountPickerOpen(false);
              setCreatingAccount(true);
            }}
            className="w-full min-h-[48px] px-3.5 rounded-xl border border-dashed border-line-strong flex items-center justify-center gap-2 text-link font-semibold text-label-md mt-1 active:scale-98 transition-transform"
          >
            <Icon name="add" className="text-[20px]" />
            Add new account
          </button>
        </div>
      </BottomSheet>

      {/* Member Picker Sheet */}
      <BottomSheet
        open={memberPickerOpen}
        onClose={() => setMemberPickerOpen(false)}
        title="Select member"
      >
        <div className="flex flex-col gap-1.5 pb-2">
          <button
            type="button"
            onClick={() => {
              setMemberId(null);
              setMemberPickerOpen(false);
            }}
            className={cx(
              'w-full min-h-[52px] px-3.5 rounded-xl flex items-center gap-3 transition-colors text-left',
              memberId == null ? 'bg-soft border border-sky/40' : 'hover:bg-canvas active:bg-soft'
            )}
          >
            <div className="w-9 h-9 rounded-full bg-line/60 flex items-center justify-center shrink-0">
              <Icon name="group" className="text-[20px] text-ink-sub" />
            </div>
            <span className="flex-1 text-body-md font-medium text-ink">All household</span>
            {memberId == null && <Icon name="check" className="text-link text-[22px]" />}
          </button>

          {members.map((m) => {
            const active = m.id === memberId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMemberId(m.id);
                  setMemberPickerOpen(false);
                }}
                className={cx(
                  'w-full min-h-[52px] px-3.5 rounded-xl flex items-center gap-3 transition-colors text-left',
                  active ? 'bg-soft border border-sky/40' : 'hover:bg-canvas active:bg-soft'
                )}
              >
                <MemberAvatar member={m} size={36} />
                <span className="flex-1 text-body-md font-medium text-ink truncate">{m.name}</span>
                {active && <Icon name="check" className="text-link text-[22px]" />}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {creatingAccount && (
        <AccountSheet
          open={creatingAccount}
          onClose={() => setCreatingAccount(false)}
          initialScope={initialScope}
          onCreated={(newId) => {
            if (type === 'transfer' && pickingAccountFor === 'to') {
              setToAccountId(newId);
            } else {
              setAccountId(newId);
            }
          }}
        />
      )}

      {/* Hidden file input for bill / receipt scan */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleProcessFile(file);
            e.target.value = '';
          }
        }}
      />

      {/* Gemini API Key Configuration Sheet */}
      <BottomSheet
        open={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        title="Scan Receipt with Gemini AI"
      >
        <div className="p-4 flex flex-col gap-4">
          <p className="text-body-sm text-ink-sub leading-relaxed">
            Namin uses Google Gemini 1.5 Flash to automatically parse receipts, invoices, and bank transfer screenshots.
          </p>
          <div className="p-3 bg-sky/10 border border-sky/30 rounded-xl flex items-center justify-between gap-3">
            <div className="text-[13px] text-ink font-medium">
              Need a key? Get one for free at Google AI Studio
            </div>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-sky text-ink font-semibold text-[12px] shrink-0 hover:brightness-95 inline-flex items-center gap-1"
            >
              <span>Get Key</span>
              <Icon name="open_in_full" className="text-[12px]" />
            </a>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-semibold text-ink-sub uppercase tracking-wider">
              Google Gemini API Key
            </label>
            <input
              type="password"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              placeholder="Paste API Key (starts with AIzaSy...)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-surface text-body-md text-ink placeholder:text-ink-sub/60 focus:outline-none focus:border-sky-dark"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setApiKeyModalOpen(false)}
              className="px-4 py-2.5 text-body-sm text-ink-sub hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (tempApiKey.trim()) {
                  setGeminiApiKey(tempApiKey.trim());
                  setApiKeyModalOpen(false);
                  toast({ title: 'Gemini API Key saved!' });
                  if (pendingFile) {
                    handleProcessFile(pendingFile);
                    setPendingFile(null);
                  }
                }
              }}
              disabled={!tempApiKey.trim()}
              className="px-5 py-2.5 rounded-xl bg-sky text-ink font-semibold text-body-sm disabled:opacity-40 hover:brightness-95 transition-all shadow-sm"
            >
              Save & Scan Now
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
