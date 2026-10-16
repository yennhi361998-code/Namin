import { useState, useEffect } from 'react';
import { BottomSheet } from '../components/overlay';
import { cx, Icon, PrimaryButton } from '../components/ui';
import { FormField, TextInput } from '../components/forms';
import { formatVnd } from '../lib/money';
import { useStore } from '../store';
import { toast } from '../store/ui';
import type { AccountNature, FinanceScope } from '../lib/types';

const ACCOUNT_COLORS = [
  '#3FA88B', // Green / Cash
  '#4B7BFF', // Blue / Bank
  '#D946EF', // Purple / Momo
  '#F59E0B', // Amber / Gold
  '#EF4444', // Red
  '#06B6D4', // Cyan
  '#8B5CF6', // Violet
  '#64748B', // Slate
];

const ACCOUNT_ICONS = [
  { id: 'payments', label: 'Cash' },
  { id: 'account_balance', label: 'Bank Account' },
  { id: 'credit_card', label: 'Credit Card' },
  { id: 'debit_card', label: 'Debit Card' },
  { id: 'account_balance_wallet', label: 'E-Wallet' },
  { id: 'savings', label: 'Savings' },
  { id: 'gold', label: 'Gold' },
  { id: 'silver', label: 'Silver' },
  { id: 'stock', label: 'Stock / Investment' },
  { id: 'vault', label: 'Vault / Safe' },
  { id: 'real_estate', label: 'Real Estate' },
  { id: 'store', label: 'Business' },
];

export function AccountSheet({
  open,
  onClose,
  accountId,
  onCreated,
  initialScope = 'household',
}: {
  open: boolean;
  onClose: () => void;
  accountId?: string;
  onCreated?: (newId: string) => void;
  initialScope?: FinanceScope;
}) {
  const accounts = useStore((s) => s.accounts ?? []);
  const addAccount = useStore((s) => s.addAccount);
  const updateAccount = useStore((s) => s.updateAccount);

  const existing = accountId ? accounts.find((a) => a.id === accountId) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [initialBalance, setInitialBalance] = useState<string>(
    existing?.initialBalance != null && existing.initialBalance !== 0
      ? String(Math.abs(existing.initialBalance))
      : ''
  );
  const [scope, setScope] = useState<FinanceScope>(existing?.scope ?? initialScope);
  const [nature, setNature] = useState<AccountNature>(
    existing?.nature ?? (existing?.name.toLowerCase().includes('credit') ? 'debt' : 'asset')
  );
  const [excludeFromTotal, setExcludeFromTotal] = useState<boolean>(existing?.excludeFromTotal ?? false);
  const [archived, setArchived] = useState<boolean>(existing?.archived ?? false);
  const [color, setColor] = useState(existing?.color ?? ACCOUNT_COLORS[0]);
  const [icon, setIcon] = useState(existing?.icon ?? 'payments');
  const [error, setError] = useState<string | null>(null);

  // Sync state whenever sheet opens or target account changes
  useEffect(() => {
    if (open) {
      if (existing) {
        setName(existing.name || '');
        setInitialBalance(
          existing.initialBalance != null && existing.initialBalance !== 0
            ? String(Math.abs(existing.initialBalance))
            : ''
        );
        setScope(existing.scope ?? initialScope);
        setNature(existing.nature ?? (existing.name.toLowerCase().includes('credit') ? 'debt' : 'asset'));
        setExcludeFromTotal(existing.excludeFromTotal ?? false);
        setArchived(existing.archived ?? false);
        setColor(existing.color ?? ACCOUNT_COLORS[0]);
        setIcon(existing.icon ?? 'payments');
        setError(null);
      } else {
        setName('');
        setInitialBalance('');
        setScope(initialScope);
        setNature('asset');
        setExcludeFromTotal(false);
        setArchived(false);
        setColor(ACCOUNT_COLORS[0]);
        setIcon('payments');
        setError(null);
      }
    }
  }, [open, accountId, existing, initialScope]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter an account name');
      return;
    }

    const parsedInit = parseInt(initialBalance.replace(/\D/g, '') || '0', 10);
    const absInitial = Number.isNaN(parsedInit) ? 0 : parsedInit;
    const finalInitialBalance = nature === 'debt' && absInitial > 0 ? -absInitial : absInitial;

    if (existing) {
      updateAccount(existing.id, {
        name: trimmed,
        color,
        icon,
        scope,
        nature,
        initialBalance: finalInitialBalance,
        excludeFromTotal,
        archived,
      });
      toast({ title: 'Account updated', subtitle: trimmed });
      onClose();
    } else {
      const id = addAccount(trimmed, icon, color, scope, nature, finalInitialBalance, excludeFromTotal, archived);
      toast({ title: 'New account created', subtitle: trimmed });
      onCreated?.(id);
      onClose();
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit account' : 'Add account'}
      footer={<PrimaryButton onClick={handleSave}>{existing ? 'Save changes' : 'Create account'}</PrimaryButton>}
    >
      <div className="flex flex-col gap-5 pb-6 pt-1">
        <FormField label="Account name" htmlFor="account-name" error={error}>
          <TextInput
            id="account-name"
            placeholder="Account name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
          />
        </FormField>

        {/* Initial Balance Input */}
        <FormField label="Initial balance (VND)" htmlFor="account-initial-balance" hint="Starting balance when opening this account">
          <TextInput
            id="account-initial-balance"
            placeholder="0"
            value={initialBalance ? formatVnd(parseInt(initialBalance.replace(/\D/g, '') || '0', 10)) : ''}
            onChange={(e) => {
              const clean = e.target.value.replace(/\D/g, '');
              setInitialBalance(clean);
            }}
          />
        </FormField>

        {/* Wallet Scope Selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-label-md font-semibold text-ink">Wallet Scope</label>
          <div className="grid grid-cols-2 p-1 bg-line/60 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setScope('household')}
              className={cx(
                'py-2 rounded-lg text-body-sm font-semibold transition-all flex items-center justify-center gap-1.5',
                scope === 'household' ? 'bg-surface text-ink shadow-xs' : 'text-ink-sub hover:text-ink'
              )}
            >
              <Icon name="roofing" className="text-[18px]" />
              <span>Our Wallet</span>
            </button>
            <button
              type="button"
              onClick={() => setScope('personal')}
              className={cx(
                'py-2 rounded-lg text-body-sm font-semibold transition-all flex items-center justify-center gap-1.5',
                scope === 'personal' ? 'bg-surface text-ink shadow-xs' : 'text-ink-sub hover:text-ink'
              )}
            >
              <Icon name="person" className="text-[18px]" />
              <span>My Wallet</span>
            </button>
          </div>
        </div>

        {/* Account Nature Selector: Asset vs Debt */}
        <div className="flex flex-col gap-1.5">
          <label className="text-label-md font-semibold text-ink">Account Nature</label>
          <div className="grid grid-cols-2 p-1 bg-line/60 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setNature('asset')}
              className={cx(
                'py-2 rounded-lg text-body-sm font-semibold transition-all flex items-center justify-center gap-1.5',
                nature === 'asset' ? 'bg-surface text-ink shadow-xs' : 'text-ink-sub hover:text-ink'
              )}
            >
              <Icon name="paid" className="text-[18px] text-done-ink" />
              <span>Asset</span>
            </button>
            <button
              type="button"
              onClick={() => setNature('debt')}
              className={cx(
                'py-2 rounded-lg text-body-sm font-semibold transition-all flex items-center justify-center gap-1.5',
                nature === 'debt' ? 'bg-surface text-ink shadow-xs' : 'text-ink-sub hover:text-ink'
              )}
            >
              <Icon name="credit_card" className="text-[18px] text-err-ink" />
              <span>Debt</span>
            </button>
          </div>
        </div>

        {/* Exclude From Total Toggle */}
        <label className="flex items-center justify-between p-3.5 bg-canvas rounded-xl border border-line/60 cursor-pointer hover:bg-soft transition-colors select-none">
          <div className="flex flex-col pr-3">
            <span className="text-label-md font-semibold text-ink">Exclude from total</span>
            <span className="text-caption text-ink-sub">Do not count towards Total Assets or Net Worth</span>
          </div>
          <input
            type="checkbox"
            checked={excludeFromTotal}
            onChange={(e) => setExcludeFromTotal(e.target.checked)}
            className="w-5 h-5 rounded border-line text-header focus:ring-header accent-[#3FA88B] cursor-pointer"
          />
        </label>

        {/* Hide Account Toggle */}
        <label className="flex items-center justify-between p-3.5 bg-canvas rounded-xl border border-line/60 cursor-pointer hover:bg-soft transition-colors select-none">
          <div className="flex flex-col pr-3">
            <div className="flex items-center gap-1.5">
              <Icon name="visibility_off" className="text-[17px] text-ink-sub" />
              <span className="text-label-md font-semibold text-ink">Hide account</span>
            </div>
            <span className="text-caption text-ink-sub mt-0.5">Hide from active lists and transaction selectors</span>
          </div>
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
            className="w-5 h-5 rounded border-line text-header focus:ring-header accent-[#3FA88B] cursor-pointer"
          />
        </label>

        {/* Color Palette */}
        <div className="flex flex-col gap-2">
          <label className="text-label-md font-semibold text-ink">Color</label>
          <div className="flex flex-wrap gap-2.5">
            {ACCOUNT_COLORS.map((c) => {
              const isSelected = color === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                >
                  {isSelected && <Icon name="check" className="text-white text-[18px]" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Icon Selection */}
        <div className="flex flex-col gap-2">
          <label className="text-label-md font-semibold text-ink">Icon</label>
          <div className="grid grid-cols-4 gap-2">
            {ACCOUNT_ICONS.map((ic) => {
              const isSelected = icon === ic.id;
              return (
                <button
                  key={ic.id}
                  type="button"
                  onClick={() => setIcon(ic.id)}
                  title={ic.label}
                  className={`min-h-[44px] rounded-xl flex items-center justify-center border transition-all active:scale-95 ${
                    isSelected
                      ? 'bg-header border-header-ink text-header-ink shadow-xs'
                      : 'bg-surface border-line text-ink hover:bg-soft'
                  }`}
                >
                  <Icon name={ic.id as any} className="text-[22px]" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
