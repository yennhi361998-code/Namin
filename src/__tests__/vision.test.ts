import { describe, it, expect } from 'vitest';
import { parseReceiptFromText, matchCategory } from '../lib/vision';

describe('Vision & Receipt Parsing', () => {
  const categories = [
    { id: 'cat-food', name: 'Ăn uống' },
    { id: 'cat-cafe', name: 'Cà phê' },
    { id: 'cat-groceries', name: 'Đi chợ' },
    { id: 'cat-transport', name: 'Di chuyển' },
  ];

  it('matches categories correctly', () => {
    expect(matchCategory('Cà phê', categories)).toBe('cat-cafe');
    expect(matchCategory('ăn uống', categories)).toBe('cat-food');
    expect(matchCategory('Đi chợ hàng ngày', categories)).toBe('cat-groceries');
    expect(matchCategory('Không có danh mục này', categories)).toBeUndefined();
  });

  it('parses banking screenshot text with amounts', () => {
    const text = `
      Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank)
      GIAO DỊCH THÀNH CÔNG
      Số tiền: 120.000 VND
      Thời gian: 15/10/2026 14:30:22
      Nội dung: Highlands Coffee Pham Ngoc Thach
    `;
    const res = parseReceiptFromText(text, categories);
    expect(res.amount).toBe(120000);
    expect(res.date).toBe('2026-10-15');
    expect(res.type).toBe('expense');
    expect(res.note).toContain('Highlands Coffee');
    expect(res.matchedCategoryId).toBe('cat-cafe');
  });

  it('detects incoming transfer (income)', () => {
    const text = `
      + 2.500.000 VND
      Tài khoản nhận tiền: 1012345678
      Nội dung: Tien thuong du an
      15/10/2026
    `;
    const res = parseReceiptFromText(text, categories);
    expect(res.amount).toBe(2500000);
    expect(res.type).toBe('income');
  });

  it('handles "k" shorthand amounts', () => {
    const text = 'Cafe sang 45k 15/10/2026';
    const res = parseReceiptFromText(text, categories);
    expect(res.amount).toBe(45000);
    expect(res.matchedCategoryId).toBe('cat-cafe');
  });
});
