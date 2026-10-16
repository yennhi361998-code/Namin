/**
 * AI Vision module to parse receipts, invoices, and banking screenshots
 * using Google Gemini 1.5 Flash API with local regex heuristics fallback.
 */

export interface ParsedReceiptItem {
  name: string;
  quantity: number;
  price: number;
  unit?: string;
}

export interface ParsedReceipt {
  amount: number;
  note: string;
  date?: string; // YYYY-MM-DD
  type: 'expense' | 'income';
  suggestedCategory?: string;
  matchedCategoryId?: string;
  items?: ParsedReceiptItem[];
  rawResponse?: string;
}

const API_KEY_STORAGE_KEY = 'namin:gemini_api_key';

export function getGeminiApiKey(): string {
  try {
    const saved = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {
    /* ignore */
  }
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() || '';
}

export function setGeminiApiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Converts a File or Blob into base64 and its mime type.
 */
export async function fileToBase64(file: Blob): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const [header, base64] = dataUrl.split(',');
      const mimeMatch = header.match(/:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Prepares and compresses image for Google Gemini Vision.
 * Automatically converts iPhone HEIC/HEIF or large raw photos to standard, lightweight JPEG (<300KB).
 */
export async function prepareImageForGemini(
  file: Blob,
  maxDimension = 1600,
  quality = 0.85
): Promise<{ base64: string; mimeType: string }> {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);

      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (width > 0 && height > 0) {
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const [, base64] = dataUrl.split(',');
          if (base64) {
            return { base64, mimeType: 'image/jpeg' };
          }
        }
      }
    } catch (err) {
      console.warn('Canvas compression failed, falling back to raw fileToBase64:', err);
    }
  }

  return fileToBase64(file);
}

/**
 * Match a category name from Gemini's suggestion to one of the user's category choices.
 */
export function matchCategory(
  suggestion: string | undefined,
  categories: Array<{ id: string; name: string }>
): string | undefined {
  if (!suggestion || !categories.length) return undefined;
  const clean = suggestion.trim().toLowerCase();

  // 1. Exact match
  const exact = categories.find((c) => c.name.trim().toLowerCase() === clean);
  if (exact) return exact.id;

  // 2. Substring match
  const substring = categories.find(
    (c) => c.name.trim().toLowerCase().includes(clean) || clean.includes(c.name.trim().toLowerCase())
  );
  if (substring) return substring.id;

  return undefined;
}

/**
 * Parses raw text (e.g. from clipboard or SMS) via heuristics.
 */
export function parseReceiptFromText(
  text: string,
  categories: Array<{ id: string; name: string }> = []
): ParsedReceipt {
  // 1. Find date first (DD/MM/YYYY or YYYY-MM-DD) so years like 2026 are not confused with amounts
  let date: string | undefined = undefined;
  let textWithoutDate = text;
  const dateMatch = text.match(/([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{2,4})/);
  if (dateMatch) {
    let [, d, m, y] = dateMatch;
    if (y.length === 2) y = `20${y}`;
    date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    textWithoutDate = text.replace(dateMatch[0], ' ');
  }

  // 2. Find amount
  let amount = 0;
  // Match patterns like: 120.000 VND, 50.000đ, 50000 VND, -150.000 d, 50k
  const explicitVndMatch = textWithoutDate.match(/(?:[-+]?\s*)([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,})\s*(?:VND|VNĐ|đ|d|dong)\b/i);
  const kMatch = textWithoutDate.match(/\b([0-9]+)\s*k\b/i);
  const formattedVndMatch = textWithoutDate.match(/(?:[-+]?\s*)([0-9]{1,3}(?:[.,][0-9]{3})+)/);

  if (explicitVndMatch) {
    const numStr = explicitVndMatch[1].replace(/[.,]/g, '');
    amount = Math.abs(parseInt(numStr, 10)) || 0;
  } else if (kMatch) {
    amount = parseInt(kMatch[1], 10) * 1000;
  } else if (formattedVndMatch) {
    const numStr = formattedVndMatch[1].replace(/[.,]/g, '');
    amount = Math.abs(parseInt(numStr, 10)) || 0;
  }

  // 3. Detect type (expense / income)
  let type: 'expense' | 'income' = 'expense';
  if (
    text.includes('+') ||
    /nhan tien|nhận tiền|chuyen vao|cộng|cong tien|chuyển khoản đến/i.test(text)
  ) {
    type = 'income';
  }

  // 4. Extract note / merchant
  let note = 'Transaction';
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const ndLine = lines.find((l) => /ND:|Nội dung:|Chi tiết:|Lời nhắn:|Description:|Note:/i.test(l));
  if (ndLine) {
    note = ndLine.replace(/ND:|Nội dung:|Chi tiết:|Lời nhắn:|Description:|Note:/i, '').trim();
  } else if (lines.length > 0) {
    note = lines[0].slice(0, 50);
  }

  // 5. Category guess
  let matchedCategoryId: string | undefined = undefined;
  if (/cafe|cà phê|coffee|highlands|starbucks|phúc long/i.test(text)) {
    matchedCategoryId = matchCategory('Cà phê', categories) || matchCategory('Ăn uống', categories) || matchCategory('Food', categories);
  } else if (/grab|be|taxi|xăng|petrolimex|gas|transport/i.test(text)) {
    matchedCategoryId = matchCategory('Di chuyển', categories) || matchCategory('Traffic', categories);
  } else if (/siêu thị|coop|winmart|bách hoá|chợ|market|supermarket|grocery/i.test(text)) {
    matchedCategoryId = matchCategory('Đi chợ', categories) || matchCategory('Daily', categories) || matchCategory('Food', categories);
  }

  return {
    amount,
    note,
    date,
    type,
    matchedCategoryId,
    rawResponse: text,
  };
}

/**
 * Send receipt image to Google Gemini 1.5 Flash to extract structured transaction data.
 */
export async function parseReceiptWithGemini(
  file: Blob,
  categories: Array<{ id: string; name: string }> = []
): Promise<ParsedReceipt> {
  const rawKey = getGeminiApiKey();
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, '').trim();
  if (!apiKey) {
    throw new Error('MISSING_API_KEY');
  }

  const { base64, mimeType } = await prepareImageForGemini(file);
  const categoryNames = categories.map((c) => c.name).join(', ');

  const systemPrompt = `You are an intelligent family finance assistant for the Namin app.
Your task is to parse this image (which may be a grocery receipt, restaurant bill, retail invoice, mobile banking transfer confirmation screenshot such as Vietcombank, Techcombank, MB Bank, Momo, Apple Pay, etc. in Vietnamese or English).

Extract the transaction details and return ONLY a valid JSON string (no markdown \`\`\`json fences, no explanations).

JSON structure:
{
  "amount": total transaction amount (integer number, e.g. 120000, without commas or decimals),
  "note": "merchant name or concise transaction note (e.g. Highlands Coffee, WinMart, Lunch with team)",
  "date": "YYYY-MM-DD" (transaction date or receipt date if visible, otherwise null),
  "type": "expense" or "income" (default to "expense" unless it is an incoming money transfer),
  "suggestedCategory": "choose the closest matching category name from this list: [${categoryNames}]",
  "items": [
    {
      "name": "item name",
      "quantity": number,
      "price": unit price or total price for item (number),
      "unit": "pack, can, cup, kg, bottle, item if available"
    }
  ]
}

Guidelines:
1. If this is an itemized receipt, extract individual items into the "items" array.
2. "amount" must be the final total paid amount after any discounts.
3. "note" prioritizes merchant/store name and a short summary.
4. Return pure valid JSON syntax ready for JSON.parse().`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: systemPrompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: 'application/json',
    },
  };

  const models = ['gemini-1.5-flash', 'gemini-2.0-flash'];
  let response: Response | null = null;
  let lastErrorText = '';

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        break;
      }

      const errorData = await response.json().catch(() => ({}));
      lastErrorText = errorData?.error?.message || `Gemini API error (${response.status}): ${response.statusText}`;

      if (/api_key_invalid|api key not valid/i.test(lastErrorText)) {
        throw new Error('API Key Google Gemini không hợp lệ. Vui lòng kiểm tra lại trong Cài đặt.');
      }
      if (/quota|rate limit/i.test(lastErrorText)) {
        throw new Error('Hạn mức gọi Gemini API đã hết (Quota exceeded). Vui lòng thử lại sau.');
      }
    } catch (err: any) {
      if (err.message && (err.message.includes('API Key') || err.message.includes('Hạn mức'))) {
        throw err;
      }
      lastErrorText = err.message || 'Network request failed';
    }
  }

  if (!response || !response.ok) {
    throw new Error(lastErrorText || 'Could not connect to Gemini Vision API');
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error('No response received from AI.');
  }

  // Clean JSON in case markdown fences were included
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.warn('JSON parse failed on Gemini response:', rawText);
    return parseReceiptFromText(rawText, categories);
  }

  const amount = Number(parsed.amount) || 0;
  const note = String(parsed.note || 'Transaction').trim();
  const date = parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : undefined;
  const type: 'expense' | 'income' = parsed.type === 'income' ? 'income' : 'expense';
  const suggestedCategory = parsed.suggestedCategory ? String(parsed.suggestedCategory).trim() : undefined;
  const matchedCategoryId = matchCategory(suggestedCategory, categories);

  const items: ParsedReceiptItem[] = Array.isArray(parsed.items)
    ? parsed.items
        .map((it: any) => ({
          name: String(it.name || '').trim(),
          quantity: Number(it.quantity) || 1,
          price: Number(it.price) || 0,
          unit: it.unit ? String(it.unit).trim() : undefined,
        }))
        .filter((it: ParsedReceiptItem) => it.name.length > 0)
    : [];

  return {
    amount,
    note,
    date,
    type,
    suggestedCategory,
    matchedCategoryId,
    items,
    rawResponse: rawText,
  };
}
