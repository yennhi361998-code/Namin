import { useState } from 'react';
import { BottomSheet } from '../components/overlay';
import { Icon, PrimaryButton } from '../components/ui';
import { FormField, TextInput } from '../components/forms';
import { useStore } from '../store';
import { toast } from '../store/ui';

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
  { id: 'wallet', label: 'Ví tiền' },
  { id: 'credit_card', label: 'Thẻ tín dụng / ATM' },
  { id: 'account_balance_wallet', label: 'Ví điện tử' },
  { id: 'account_balance', label: 'Ngân hàng' },
  { id: 'payments', label: 'Tiền mặt' },
  { id: 'savings', label: 'Tiết kiệm' },
  { id: 'smartphone', label: 'Di động' },
  { id: 'store', label: 'Kinh doanh' },
];

export function AccountSheet({
  open,
  onClose,
  accountId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  accountId?: string;
  onCreated?: (newId: string) => void;
}) {
  const accounts = useStore((s) => s.accounts ?? []);
  const addAccount = useStore((s) => s.addAccount);
  const updateAccount = useStore((s) => s.updateAccount);

  const existing = accountId ? accounts.find((a) => a.id === accountId) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? ACCOUNT_COLORS[0]);
  const [icon, setIcon] = useState(existing?.icon ?? 'wallet');
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Vui lòng nhập tên ví / tài khoản');
      return;
    }

    if (existing) {
      updateAccount(existing.id, { name: trimmed, color, icon });
      toast({ title: 'Đã cập nhật ví', subtitle: trimmed });
      onClose();
    } else {
      const id = addAccount(trimmed, icon, color);
      toast({ title: 'Đã thêm ví mới', subtitle: trimmed });
      onCreated?.(id);
      onClose();
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={existing ? 'Chỉnh sửa ví' : 'Thêm ví mới'}
      footer={<PrimaryButton onClick={handleSave}>{existing ? 'Lưu thay đổi' : 'Tạo ví'}</PrimaryButton>}
    >
      <div className="flex flex-col gap-5 pb-6 pt-1">
        <FormField label="Tên ví / tài khoản" htmlFor="account-name" error={error}>
          <TextInput
            id="account-name"
            placeholder="Ví dụ: Techcombank, Tiền mặt, Momo..."
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            data-autofocus
          />
        </FormField>

        {/* Color Palette */}
        <div className="flex flex-col gap-2">
          <label className="text-label-md font-semibold text-ink">Màu sắc</label>
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
                  aria-label={`Chọn màu ${c}`}
                >
                  {isSelected && <Icon name="check" className="text-white text-[18px]" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Icon Selection */}
        <div className="flex flex-col gap-2">
          <label className="text-label-md font-semibold text-ink">Biểu tượng</label>
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
