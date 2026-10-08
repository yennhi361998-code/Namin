import { useRef, useState } from 'react';
import { CategoryTile } from '../components/money';
import { BottomSheet } from '../components/overlay';
import { AmountPad, Key } from '../components/keypad';
import { cx, Icon, MemberAvatar } from '../components/ui';
import { evaluate, press } from '../lib/calc';
import { addDays, shortDate, today } from '../lib/dates';
import type { DateStr, TxType } from '../lib/types';
import { useStore } from '../store';
import { useCategoryChoices } from '../store/selectors';
import { toast } from '../store/ui';
import { CategoriesSheet } from './CategoriesSheet';
import { AccountSheet } from './AccountSheet';
import { DatePickerModal } from '../components/DatePickerModal';

/** Add or edit an expense/income: category grid on top, calculator keypad below. */
export function TransactionSheet({
  open,
  onClose,
  transactionId,
  txType = 'expense',
  date: initialDate,
}: {
  open: boolean;
  onClose: () => void;
  transactionId?: string;
  txType?: TxType;
  date?: DateStr;
}) {
  const [existing] = useState(() => (transactionId ? useStore.getState().transactions.find((t) => t.id === transactionId) : undefined));
  const [type, setType] = useState<TxType>(existing?.type ?? txType);
  const choices = useCategoryChoices(type);
  const accounts = useStore((s) => s.accounts ?? []);
  const members = useStore((s) => s.members ?? []);
  const currentMemberId = useStore((s) => s.currentMemberId);

  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [accountId, setAccountId] = useState<string | null>(existing?.accountId ?? accounts[0]?.id ?? null);
  const [memberId, setMemberId] = useState<string | null>(existing?.memberId ?? currentMemberId);
  const [expr, setExpr] = useState(existing ? String(existing.amount) : '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [date, setDate] = useState<DateStr>(existing?.date ?? initialDate ?? today());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const submitted = useRef(false);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const selectedMember = members.find((m) => m.id === memberId);

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
    if (!effectiveCategoryId) return setError('Choose a category');
    submitted.current = true;
    const input = { type, categoryId: effectiveCategoryId, amount, date, note, accountId, memberId };
    const s = useStore.getState();
    if (existing) s.updateTransaction(existing.id, input);
    else s.addTransaction(input);
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    const undo = useStore.getState().deleteTransaction(existing.id);
    toast({ title: 'Entry deleted', action: { label: 'Undo', run: undo } });
    onClose();
  };

  const t = today();
  const dateLabel = date === t ? 'Today' : date === addDays(t, -1) ? 'Yesterday' : shortDate(date);
  const label = type === 'expense' ? 'expense' : 'income';

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
              {(['expense', 'income'] as const).map((tp) => (
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
                  className={cx('min-h-[36px] px-4 rounded-full text-label-md transition-all', type === tp ? 'bg-sky text-ink font-semibold shadow-sm' : 'text-ink-sub')}
                >
                  {tp === 'expense' ? 'Expense' : 'Income'}
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
              onNote={setNote}
              error={error}
              onSave={save}
              accountName={selectedAccount?.name}
              accountSlot={
                <button
                  type="button"
                  onClick={() => setAccountPickerOpen(true)}
                  aria-label={`Chọn ví: ${selectedAccount?.name ?? 'Chưa chọn'}`}
                  className="w-full h-full min-h-[56px] rounded-xl bg-surface border border-line/60 shadow-sm flex flex-col items-center justify-center gap-0.5 p-1 active:scale-95 transition-transform"
                >
                  <Icon
                    name={(selectedAccount?.icon as any) || 'account_balance_wallet'}
                    className="text-[22px]"
                    style={{ color: selectedAccount?.color || '#3FA88B' }}
                  />
                  <span className="text-[10px] font-semibold text-ink-sub truncate max-w-full leading-none">
                    {selectedAccount?.name ?? 'Ví'}
                  </span>
                </button>
              }
              memberSlot={
                <button
                  type="button"
                  onClick={() => setMemberPickerOpen(true)}
                  aria-label={`Chọn người chi: ${selectedMember?.name ?? 'Chung'}`}
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
          </>
        }
      >
        <div className="flex flex-col gap-3 pb-3">
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
        </div>
      </BottomSheet>
      <CategoriesSheet open={managing} onClose={() => setManaging(false)} type={type} />

      {/* Account Picker Sheet */}
      <BottomSheet
        open={accountPickerOpen}
        onClose={() => setAccountPickerOpen(false)}
        title="Chọn ví thanh toán"
      >
        <div className="flex flex-col gap-1.5 pb-2">
          {accounts.map((acc) => {
            const active = acc.id === accountId;
            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => {
                  setAccountId(acc.id);
                  setAccountPickerOpen(false);
                }}
                className={cx(
                  'w-full min-h-[52px] px-3.5 rounded-xl flex items-center gap-3 transition-colors text-left',
                  active ? 'bg-soft border border-sky/40' : 'hover:bg-canvas active:bg-soft'
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
                {active && <Icon name="check" className="text-link text-[22px]" />}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setAccountPickerOpen(false);
              setCreatingAccount(true);
            }}
            className="w-full min-h-[48px] px-3.5 rounded-xl border border-dashed border-line-strong flex items-center justify-center gap-2 text-link font-semibold text-label-md mt-2 active:scale-98 transition-transform"
          >
            <Icon name="add" className="text-[20px]" />
            Thêm ví mới
          </button>
        </div>
      </BottomSheet>

      {/* Member Picker Sheet */}
      <BottomSheet
        open={memberPickerOpen}
        onClose={() => setMemberPickerOpen(false)}
        title="Chọn người chi"
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
            <span className="flex-1 text-body-md font-medium text-ink">Chung (Cả nhà)</span>
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
          onCreated={(newId) => setAccountId(newId)}
        />
      )}
    </>
  );
}
