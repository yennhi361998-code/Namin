import type { Category } from './types';

export const CATEGORY_COLOR: Record<Category, string> = {
  Cleaning: '#8CC9E8',
  Kitchen: '#A9D8C8',
  Bathroom: '#B8C7E6',
  Groceries: '#F2D6A7',
  Maintenance: '#D7C4E8',
  Other: '#CBD5DA',
};

// Order matters: earlier categories win ("paper towel" → Kitchen, "water filter" → Maintenance).
const KEYWORDS: [Category, string[]][] = [
  ['Cleaning', ['detergent', 'softener', 'bleach', 'cleaner', 'mop', 'dish soap', 'dishwash', 'laundry', 'broom', 'duster', 'wipes', 'vim', 'giặt', 'nước rửa']],
  ['Kitchen', ['trash bag', 'garbage', 'sponge', 'foil', 'cling', 'wrap', 'paper towel', 'kitchen', 'zip bag', 'napkin']],
  ['Bathroom', ['toilet', 'tissue', 'shampoo', 'conditioner', 'hand soap', 'body wash', 'toothpaste', 'toothbrush', 'towel', 'razor', 'soap']],
  ['Maintenance', ['bulb', 'battery', 'batteries', 'filter', 'fuse', 'tape', 'screw', 'glue', 'light']],
  ['Groceries', ['rice', 'egg', 'milk', 'oil', 'sugar', 'salt', 'coffee', 'tea', 'bread', 'noodle', 'fish sauce', 'sauce', 'fruit', 'vegetable', 'meat', 'chicken', 'pork', 'beef', 'water', 'gạo', 'trứng', 'sữa']],
];

/** Best-effort category from an item name; null if nothing matches. */
export function guessCategory(name: string): Category | null {
  const n = name.toLowerCase();
  for (const [cat, words] of KEYWORDS) if (words.some((w) => n.includes(w))) return cat;
  return null;
}
