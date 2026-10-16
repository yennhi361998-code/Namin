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

  it('correctly formats Google GenAI REST request and parses response in parseReceiptWithGemini', async () => {
    const { parseReceiptWithGemini, setGeminiApiKey } = await import('../lib/vision');
    setGeminiApiKey('AIzaSyTestValidKey');

    const originalFetch = globalThis.fetch;
    let interceptedUrl = '';
    let interceptedBody: any = null;

    globalThis.fetch = async (url: any, init: any) => {
      interceptedUrl = String(url);
      interceptedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      amount: 156000,
                      note: 'WinMart Supermarket',
                      date: '2026-10-16',
                      type: 'expense',
                      suggestedCategory: 'Đi chợ',
                      items: [
                        { name: 'Sữa tươi Vinamilk', quantity: 2, price: 38000, unit: 'hộp' }
                      ]
                    })
                  }
                ]
              }
            }
          ]
        })
      } as any;
    };

    try {
      const dummyFile = new Blob(['fake image data'], { type: 'image/jpeg' });
      const result = await parseReceiptWithGemini(dummyFile, categories);

      expect(interceptedUrl).toContain('models/gemini-2.0-flash:generateContent');
      expect(interceptedBody.contents[0].parts[0].inlineData).toBeDefined();
      expect(interceptedBody.contents[0].parts[0].inlineData.mimeType).toBe('image/jpeg');
      expect(interceptedBody.generationConfig.responseMimeType).toBe('application/json');

      expect(result.amount).toBe(156000);
      expect(result.note).toBe('WinMart Supermarket');
      expect(result.date).toBe('2026-10-16');
      expect(result.matchedCategoryId).toBe('cat-groceries');
      expect(result.items?.length).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws helpful Vietnamese error on invalid API key', async () => {
    const { parseReceiptWithGemini, setGeminiApiKey } = await import('../lib/vision');
    setGeminiApiKey('AIzaSyInvalidKey');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 400,
          message: 'API key not valid. Please pass a valid API key.',
          status: 'INVALID_ARGUMENT'
        }
      })
    } as any);

    try {
      const dummyFile = new Blob(['fake image data'], { type: 'image/jpeg' });
      await expect(parseReceiptWithGemini(dummyFile, categories)).rejects.toThrow('API Key Google Gemini không hợp lệ');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

