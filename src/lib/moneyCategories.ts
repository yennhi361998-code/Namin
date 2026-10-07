import { addMonths, today } from './dates';
import { uid } from './id';
import type { CategoryIconName } from '../components/icons';
import type { DateStr, MoneyCategory, Transaction, TxType } from './types';

/**
 * Chart palette in Namin's blue family, in fixed slot order. Validated for colour-blind
 * separation (adjacent ΔE ≥ 13) and normal-vision floor; labels carry identity alongside.
 */
export const CHART_COLORS = ['#3E97C8', '#E5806A', '#5A7FCC', '#D29A26', '#8A72C4', '#3FA88B'];
export const OTHER_COLOR = '#A7B1B7';

/** Purchases without a chosen spending category land here. */
export const DAILY_CATEGORY_ID = 'exp-daily';

const DEFAULTS: { id: string; type: TxType; name: string; icon: CategoryIconName }[] = [
  { id: 'exp-food', type: 'expense', name: 'Food', icon: 'steaming-bowl' },
  { id: 'exp-clothes', type: 'expense', name: 'Clothes', icon: 't-shirt' },
  { id: 'exp-social', type: 'expense', name: 'Social', icon: 'party-popper' },
  { id: 'exp-traffic', type: 'expense', name: 'Traffic', icon: 'motor-scooter' },
  { id: 'exp-beauty', type: 'expense', name: 'Beauty', icon: 'person-getting-haircut' },
  { id: 'exp-housing', type: 'expense', name: 'Housing', icon: 'house-with-garden' },
  { id: 'exp-bill', type: 'expense', name: 'Bill', icon: 'receipt' },
  { id: DAILY_CATEGORY_ID, type: 'expense', name: 'Daily', icon: 'basket' },
  { id: 'exp-family', type: 'expense', name: 'Family', icon: 'red-heart' },
  { id: 'exp-medical', type: 'expense', name: 'Medical', icon: 'pill' },
  { id: 'exp-electric', type: 'expense', name: 'Electric', icon: 'electric-plug' },
  { id: 'exp-entertainment', type: 'expense', name: 'Entertainment', icon: 'clapper-board' },
  { id: 'inc-salary', type: 'income', name: 'Salary', icon: 'briefcase' },
  { id: 'inc-bonus', type: 'income', name: 'Bonus', icon: 'money-bag' },
  { id: 'inc-interest', type: 'income', name: 'Interest', icon: 'bank' },
  { id: 'inc-investment', type: 'income', name: 'Investment', icon: 'chart-increasing' },
  { id: 'inc-parttime', type: 'income', name: 'Part-time', icon: 'alarm-clock' },
  { id: 'inc-gift', type: 'income', name: 'Gift', icon: 'wrapped-gift' },
  { id: 'inc-wedding', type: 'income', name: 'Wedding', icon: 'ring' },
  { id: 'inc-others', type: 'income', name: 'Others', icon: 'coin' },
];

export function defaultMoneyCategories(householdId: string): MoneyCategory[] {
  const counters = { expense: 0, income: 0 };
  return DEFAULTS.map((d) => {
    const i = counters[d.type]++;
    return { ...d, householdId, color: CHART_COLORS[i % CHART_COLORS.length], archived: false, order: i };
  });
}

/** Pictures offered when creating a category (Lucide). */
export const ICON_CHOICES: CategoryIconName[] = [
  'steaming-bowl', 'bento-box', 'hot-beverage', 'shopping-cart', 'basket', 't-shirt', 'high-heeled-shoe', 'lipstick',
  'person-getting-haircut', 'house-with-garden', 'couch-and-lamp', 'wrench', 'receipt', 'light-bulb', 'electric-plug', 'mobile-phone',
  'motor-scooter', 'automobile', 'fuel-pump', 'bus', 'airplane', 'party-popper', 'clapper-board', 'video-game',
  'books', 'graduation-cap', 'red-heart', 'baby', 'dog-face', 'pill', 'hospital', 'person-lifting-weights',
  'wrapped-gift', 'ring', 'briefcase', 'money-bag', 'bank', 'chart-increasing', 'alarm-clock', 'coin',
];

/** Emoji stored by data v3 → the icon id that replaces it (v4). */
export const EMOJI_TO_ICON: Record<string, CategoryIconName> = {
  '🍜': 'steaming-bowl',
  '👕': 't-shirt',
  '🎉': 'party-popper',
  '🛵': 'motor-scooter',
  '💇': 'person-getting-haircut',
  '🏠': 'house-with-garden',
  '🧾': 'receipt',
  '🧺': 'basket',
  '❤️': 'red-heart',
  '💊': 'pill',
  '🔌': 'electric-plug',
  '🎬': 'clapper-board',
  '💼': 'briefcase',
  '💰': 'money-bag',
  '🏦': 'bank',
  '📈': 'chart-increasing',
  '⏰': 'alarm-clock',
  '🎁': 'wrapped-gift',
  '💍': 'ring',
  '🪙': 'coin',
  '📦': 'package',
  '🍱': 'bento-box',
  '☕': 'hot-beverage',
  '🛒': 'shopping-cart',
  '👟': 'high-heeled-shoe',
  '💄': 'lipstick',
  '🛋️': 'couch-and-lamp',
  '🔧': 'wrench',
  '💡': 'light-bulb',
  '📱': 'mobile-phone',
  '🚗': 'automobile',
  '⛽': 'fuel-pump',
  '🚌': 'bus',
  '✈️': 'airplane',
  '🎮': 'video-game',
  '📚': 'books',
  '🎓': 'graduation-cap',
  '👶': 'baby',
  '🐶': 'dog-face',
  '🏥': 'hospital',
  '🏋️': 'person-lifting-weights',
};


/** Demo entries for the previous and current month, never dated after today. */
export function demoTransactions(householdId: string, memberIds: string[], ref: DateStr = today()): Transaction[] {
  const months = [addMonths(ref, -1).slice(0, 7), ref.slice(0, 7)];
  const plan: [string, number, number, string][] = [
    ['inc-salary', 1, 32_500_000, ''],
    ['inc-interest', 5, 933_000, 'Savings interest'],
    ['inc-gift', 12, 2_000_000, 'Birthday'],
    ['inc-others', 20, 1_000_000, 'Sold old bike'],
    ['exp-housing', 1, 1_060_000, 'Building fee'],
    ['exp-food', 2, 185_000, 'Lunch'],
    ['exp-family', 3, 3_255_000, 'Parents'],
    ['exp-traffic', 4, 60_000, 'Fuel'],
    ['exp-food', 6, 142_000, ''],
    ['exp-social', 8, 1_255_000, 'Team dinner'],
    ['exp-food', 9, 98_000, ''],
    ['exp-clothes', 10, 1_227_000, ''],
    ['exp-traffic', 11, 60_000, 'Fuel'],
    ['exp-beauty', 13, 250_000, 'Haircut'],
    ['exp-food', 14, 210_000, ''],
    ['exp-bill', 15, 420_000, 'Internet'],
    ['exp-entertainment', 16, 280_000, 'Cinema'],
    ['exp-food', 18, 105_000, ''],
    ['exp-traffic', 19, 60_000, 'Fuel'],
    ['exp-medical', 21, 150_000, 'Pharmacy'],
    ['exp-food', 22, 176_000, ''],
    ['exp-electric', 25, 680_000, 'Electricity'],
    ['exp-traffic', 26, 60_000, 'Fuel'],
    ['exp-food', 27, 134_000, ''],
  ];
  const out: Transaction[] = [];
  months.forEach((m, mi) =>
    plan.forEach(([categoryId, day, amount, note], i) => {
      const date = `${m}-${String(day).padStart(2, '0')}`;
      if (date > ref) return;
      out.push({
        id: uid(),
        householdId,
        type: categoryId.startsWith('inc-') ? 'income' : 'expense',
        categoryId,
        // Vary amounts a little month to month so the two months don't look copied.
        amount: Math.round((amount * (mi === 0 ? 0.94 : 1)) / 1000) * 1000,
        date,
        note,
        memberId: memberIds[i % memberIds.length] ?? null,
        createdAt: new Date().toISOString(),
      });
    }),
  );
  return out;
}
