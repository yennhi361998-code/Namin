import { addMonths, monthKey, shiftMonth, today } from './dates';
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
  { id: 'exp-others', type: 'expense', name: 'Others', icon: 'coin' },
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
  const counters: Record<string, number> = { expense: 0, income: 0, transfer: 0 };
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
        accountId: ['acc-cash', 'acc-bank', 'acc-momo'][i % 3],
        createdAt: new Date().toISOString(),
      });
    }),
  );
  return out;
}

export function demoPersonalTransactions(householdId: string, memberId: string, ref: DateStr = today()): Transaction[] {
  const current = monthKey(ref);
  const prev = shiftMonth(current, -1);
  const months = [prev, current];
  const plan: [categoryId: string, day: number, amount: number, note: string, accountId: string][] = [
    ['exp-food', 1, 45_000, 'Morning coffee', 'acc-personal-cash'],
    ['exp-traffic', 2, 40_000, 'Grab to office', 'acc-personal-bank'],
    ['exp-food', 3, 75_000, 'Lunch bowl', 'acc-personal-cash'],
    ['inc-salary', 5, 22_000_000, 'Monthly salary', 'acc-personal-bank'],
    ['exp-clothes', 6, 350_000, 'Uniqlo polo shirt', 'acc-personal-bank'],
    ['exp-food', 8, 55_000, 'Coffee with friend', 'acc-personal-cash'],
    ['exp-entertainment', 9, 120_000, 'Cinema ticket', 'acc-personal-bank'],
    ['exp-traffic', 11, 65_000, 'Taxi ride', 'acc-personal-bank'],
    ['exp-beauty', 12, 180_000, 'Haircut', 'acc-personal-cash'],
    ['inc-bonus', 15, 3_500_000, 'Design freelance', 'acc-personal-bank'],
    ['exp-food', 16, 95_000, 'Dinner pho', 'acc-personal-cash'],
    ['exp-social', 18, 250_000, 'Weekend hangout', 'acc-personal-bank'],
    ['exp-entertainment', 20, 99_000, 'Streaming subscription', 'acc-personal-bank'],
    ['exp-food', 22, 60_000, 'Bubble tea', 'acc-personal-cash'],
    ['exp-traffic', 24, 45_000, 'Bus card topup', 'acc-personal-cash'],
    ['exp-medical', 26, 120_000, 'Vitamin C & skin care', 'acc-personal-bank'],
    ['exp-food', 28, 85_000, 'Lunch bento', 'acc-personal-cash'],
  ];

  const out: Transaction[] = [];
  months.forEach((m, mi) =>
    plan.forEach(([categoryId, day, amount, note, accountId]) => {
      const date = `${m}-${String(day).padStart(2, '0')}`;
      if (date > ref) return;
      out.push({
        id: uid(),
        householdId,
        scope: 'personal',
        type: categoryId.startsWith('inc-') ? 'income' : 'expense',
        categoryId,
        amount: Math.round((amount * (mi === 0 ? 0.95 : 1)) / 1000) * 1000,
        date,
        note,
        memberId: memberId || null,
        accountId,
        createdAt: new Date().toISOString(),
      });
    }),
  );
  return out;
}

const SPEND_KEYWORDS: [string, string[]][] = [
  ['exp-food', ['bánh', 'sữa', 'thịt', 'cá', 'rau', 'củ', 'quả', 'trứng', 'gạo', 'dầu', 'mì', 'cơm', 'nước', 'trà', 'cà phê', 'cf', 'food', 'snack', 'drink', 'beer', 'bia', 'chè', 'bún', 'phở', 'hủ tíu', 'bread', 'meat', 'egg', 'milk', 'fruit', 'vegetable', 'rice', 'oil', 'sugar', 'salt', 'muối', 'đường', 'nước mắm', 'hạt nêm', 'tiêu', 'bột ngọt', 'chanh', 'tỏi', 'hành', 'gừng', 'ớt', 'táo', 'chuối', 'cam', 'quýt', 'bò', 'heo', 'gà', 'vịt', 'tôm', 'cua', 'mực']],
  ['exp-beauty', ['son', 'phấn', 'kem', 'dưỡng', 'serum', 'shampoo', 'dầu gội', 'sữa tắm', 'lotion', 'lipstick', 'hair', 'nail', 'spa', 'makeup', 'nước hoa', 'mỹ phẩm', 'mặt nạ', 'chống nắng', 'toner', 'tẩy trang']],
  ['exp-clothes', ['áo', 'quần', 'váy', 'đầm', 'giày', 'dép', 'túi', 'shirt', 'pants', 'dress', 'shoes', 'socks', 'tất', 'vớ', 'nón', 'mũ', 'khoác']],
  ['exp-medical', ['thuốc', 'khẩu trang', 'vitamin', 'panadol', 'paracetamol', 'bông', 'y tế', 'medicine', 'pill', 'gạc', 'dược']],
  ['exp-electric', ['điện', 'pin', 'bóng đèn', 'dây điện', 'sạc', 'ổ cắm', 'battery', 'bulb']],
  ['exp-traffic', ['xăng', 'gas', 'vé xe', 'grab', 'be', 'taxi', 'parking', 'gửi xe', 'rửa xe', 'thay nhớt']],
];

export function guessSpendCategory(name: string): string {
  const n = name.toLowerCase().trim();
  for (const [catId, words] of SPEND_KEYWORDS) {
    if (words.some((w) => n.includes(w))) return catId;
  }
  return DAILY_CATEGORY_ID;
}

/**
 * Item Insight Exclusion Rules:
 * Category group 1: Completely HIDE the "Item Insights" card.
 * Applies to: Food, Drink, Social, Family, Gifts, Medical / Doctor.
 */
export function isCategoryHiddenFromInsights(categoryId?: string | null, categoryName?: string | null): boolean {
  const catId = (categoryId || '').toLowerCase();
  const name = (categoryName || '').toLowerCase();

  // Food & Drink
  if (
    catId === 'exp-food' ||
    /food|drink|beverage|ăn uống|đồ uống|cà phê|cafe|thực phẩm/i.test(name)
  ) {
    return true;
  }

  // Giao tiếp & Hiếu hỷ (Social, Gifts, Family, Wedding)
  if (
    catId === 'exp-social' ||
    catId === 'exp-family' ||
    catId === 'inc-gift' ||
    catId === 'inc-wedding' ||
    /social|family|gift|wedding|hiếu hỷ|giao tiếp|quà|bạn bè|gia đình|đám cưới/i.test(name)
  ) {
    return true;
  }

  // Y tế phát sinh (Medical / Doctor)
  if (
    catId === 'exp-medical' ||
    /medical|doctor|y tế|bác sĩ|thuốc phát sinh|khám bệnh/i.test(name)
  ) {
    return true;
  }

  return false;
}

/**
 * Category group 2: HIDE "Typical usage" & "Next purchase", but keep "Average".
 * Applies to: Traffic / Transport, Entertainment, Clothes / Fashion.
 * (Beauty / Cosmetics EXPLICITLY shows Typical usage & Next purchase).
 */
export function isCategoryCycleHidden(categoryId?: string | null, categoryName?: string | null): boolean {
  const catId = (categoryId || '').toLowerCase();
  const name = (categoryName || '').toLowerCase();

  // Beauty / Cosmetics explicitly SHOWS cycle
  if (catId === 'exp-beauty' || /beauty|mỹ phẩm|cosmetic|làm đẹp|chăm sóc da/i.test(name)) {
    return false;
  }

  // Traffic / Transport: Đi lại & Di chuyển
  if (
    catId === 'exp-traffic' ||
    /traffic|transport|đi lại|di chuyển|xe|xăng/i.test(name)
  ) {
    return true;
  }

  // Entertainment: Giải trí & Trải nghiệm
  if (
    catId === 'exp-entertainment' ||
    /entertainment|giải trí|trải nghiệm|cinema|phim|game/i.test(name)
  ) {
    return true;
  }

  // Clothes / Fashion: Thời trang
  if (
    catId === 'exp-clothes' ||
    /clothes|clothing|fashion|thời trang|quần áo/i.test(name)
  ) {
    return true;
  }

  return false;
}

