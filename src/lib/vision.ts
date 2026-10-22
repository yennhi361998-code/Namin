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

const SECURE_STORAGE_KEY = 'namin:sec_v1_gk';
const LEGACY_STORAGE_KEY = 'namin:gemini_api_key';
let inMemoryApiKey = '';

const SALT = [0x5a, 0x3f, 0x91, 0xc4, 0x7e, 0x22, 0xb8, 0x4d, 0x19, 0xee];

function scrambleKey(raw: string): string {
  if (!raw) return '';
  try {
    const utf8 = encodeURIComponent(raw);
    const out: number[] = [];
    for (let i = 0; i < utf8.length; i++) {
      out.push(utf8.charCodeAt(i) ^ SALT[i % SALT.length]);
    }
    return btoa(String.fromCharCode(...out));
  } catch {
    return '';
  }
}

function unscrambleKey(encoded: string): string {
  if (!encoded) return '';
  try {
    const bin = atob(encoded);
    const out: number[] = [];
    for (let i = 0; i < bin.length; i++) {
      out.push(bin.charCodeAt(i) ^ SALT[i % SALT.length]);
    }
    return decodeURIComponent(String.fromCharCode(...out));
  } catch {
    return '';
  }
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 10) return '••••••••';
  return `${trimmed.slice(0, 6)}••••••••••••${trimmed.slice(-4)}`;
}

export function getGeminiApiKey(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const secureVal = localStorage.getItem(SECURE_STORAGE_KEY);
      if (secureVal) {
        const decoded = unscrambleKey(secureVal);
        if (decoded) return decoded;
      }
      // Migrate legacy cleartext key if present
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy && legacy.trim()) {
        const clean = legacy.trim();
        localStorage.setItem(SECURE_STORAGE_KEY, scrambleKey(clean));
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        return clean;
      }
    }
  } catch {
    /* ignore */
  }
  if (inMemoryApiKey) return inMemoryApiKey;
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() || '';
}

export function setGeminiApiKey(key: string): void {
  inMemoryApiKey = key.trim();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      if (key.trim()) {
        localStorage.setItem(SECURE_STORAGE_KEY, scrambleKey(key.trim()));
      } else {
        localStorage.removeItem(SECURE_STORAGE_KEY);
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Converts a File or Blob into base64 and its mime type.
 */
export async function fileToBase64(file: Blob): Promise<{ base64: string; mimeType: string }> {
  if (typeof FileReader !== 'undefined') {
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

  // Fallback using arrayBuffer
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(buffer).toString('base64');
  return { base64, mimeType: file.type || 'image/jpeg' };
}

/**
 * Prepares and compresses image for Google Gemini Vision.
 * Automatically converts iPhone HEIC/HEIF or large raw photos to standard, lightweight JPEG (<300KB).
 */
export async function prepareImageForGemini(
  file: Blob,
  maxDimension = 1600,
  quality = 0.82
): Promise<{ base64: string; mimeType: string }> {
  // 1. First attempt: createImageBitmap (handles raw formats natively, fast & memory-efficient)
  if (typeof window !== 'undefined' && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      let width = bmp.width;
      let height = bmp.height;

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
          ctx.drawImage(bmp, 0, 0, width, height);
          bmp.close();

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const [, base64] = dataUrl.split(',');
          if (base64 && base64.length > 50) {
            return { base64, mimeType: 'image/jpeg' };
          }
        }
      }
      bmp.close();
    } catch (err) {
      console.warn('createImageBitmap failed, falling back to Image element:', err);
    }
  }

  // 2. Second attempt: HTMLImageElement with decode() and proper objectUrl lifecycle
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = objectUrl;

      if (typeof img.decode === 'function') {
        try {
          await img.decode();
        } catch {
          await new Promise<void>((resolve, reject) => {
            (img as any).onload = () => resolve();
            (img as any).onerror = () => reject(new Error('Failed to load image'));
          });
        }
      } else {
        await new Promise<void>((resolve, reject) => {
          (img as any).onload = () => resolve();
          (img as any).onerror = () => reject(new Error('Failed to load image'));
        });
      }

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
          if (base64 && base64.length > 50) {
            return { base64, mimeType: 'image/jpeg' };
          }
        }
      }
    } catch (err) {
      console.warn('HTMLImageElement compression failed, falling back to raw fileToBase64:', err);
    } finally {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          /* ignore */
        }
      }
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
 * Parses and validates Gemini JSON response.
 */
export function parseGeminiJsonResponse(
  rawText: string,
  categories: Array<{ id: string; name: string }>
): ParsedReceipt {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
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

/**
 * Send receipt image to Google Gemini Vision API to extract structured transaction data.
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

  // 1. Try Vercel Serverless Function (/api/gemini) first to completely bypass browser CORS & preflight blocks
  try {
    const proxyRes = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        base64,
        mimeType,
        categoryNames,
      }),
    });

    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data?.success && data?.text) {
        return parseGeminiJsonResponse(data.text, categories);
      }
    } else {
      const errJson = await proxyRes.json().catch(() => ({}));
      if (errJson?.error && proxyRes.status !== 404) {
        throw new Error(errJson.error);
      }
    }
  } catch (err: any) {
    // If backend returned a clear user error (e.g. invalid key), rethrow
    if (
      err.message &&
      !err.message.includes('Failed to fetch') &&
      !err.message.includes('Type error') &&
      !err.message.includes('Load failed') &&
      !err.message.includes('404')
    ) {
      throw err;
    }
  }

  // 2. Direct browser fetch fallback (Pass key in query string and NO custom headers to avoid CORS preflight rejection)
  const systemPrompt = `You are an intelligent family finance assistant for the Namin app.
Your task is to parse this receipt, bill, invoice, or banking transfer confirmation screenshot (in Vietnamese or English).

Extract the transaction details and return ONLY a valid JSON object matching this schema:
{
  "amount": integer total amount paid or received (e.g. 120000, without commas or decimals),
  "note": "merchant name or concise transaction note (e.g. Highlands Coffee, WinMart, Grab, Cà phê)",
  "date": "YYYY-MM-DD" (transaction date if clearly visible, otherwise null),
  "type": "expense" or "income" (default to "expense" unless it is incoming money transfer),
  "suggestedCategory": "choose the closest matching category name from: [${categoryNames}]",
  "items": [
    {
      "name": "item name",
      "quantity": 1,
      "price": 10000,
      "unit": "pack, can, cup, kg, bottle, item"
    }
  ]
}

Important guidelines:
1. "amount" must be the final total paid amount after any discounts.
2. "note" should be short and descriptive, prioritizing merchant/store name.
3. Return ONLY valid raw JSON syntax with no code fences or explanations.`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
          { text: systemPrompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  };

  let activeEndpoint = 'v1beta';
  let modelsToTry = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash-002',
    'gemini-2.0-flash-001',
    'gemini-2.5-pro',
  ];

  for (const ep of ['v1beta', 'v1']) {
    try {
      const listUrl = `https://generativelanguage.googleapis.com/${ep}/models?key=${encodeURIComponent(apiKey)}`;
      const listRes = await fetch(listUrl, { method: 'GET' });

      if (listRes.ok) {
        const listData = await listRes.json();
        if (Array.isArray(listData?.models)) {
          const names = listData.models
            .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
            .map((m: any) => m.name.replace(/^models\//, ''));
          if (names.length > 0) {
            names.sort((a: string, b: string) => {
              const aFlash = a.includes('flash') ? 1 : 0;
              const bFlash = b.includes('flash') ? 1 : 0;
              if (aFlash !== bFlash) return bFlash - aFlash;
              return b.localeCompare(a);
            });
            activeEndpoint = ep;
            modelsToTry = names;
            break;
          }
        }
      }
    } catch {
      // Continue to next endpoint or fallback
    }
  }

  let response: Response | null = null;
  let lastErrorText = '';

  for (const model of modelsToTry) {
    try {
      const cleanModel = model.replace(/^models\//, '');
      const url = `https://generativelanguage.googleapis.com/${activeEndpoint}/models/${cleanModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        break;
      }

      const errorData = await response.json().catch(() => ({}));
      const rawMsg = errorData?.error?.message || `HTTP ${response.status} (${response.statusText})`;
      console.warn(`[Gemini ${cleanModel}] failed:`, rawMsg);

      if (/api_key_invalid|api key not valid|key not found|invalid api key/i.test(rawMsg)) {
        throw new Error('Invalid Google Gemini API Key. Please verify your API Key in Settings.');
      }
      if (/quota|rate limit|resource has been exhausted|exceeded your current quota/i.test(rawMsg)) {
        throw new Error('Gemini API rate limit or quota exceeded. Please try again in a few moments.');
      }
      if (/location is not supported|user location|geoblocked/i.test(rawMsg)) {
        throw new Error('Google Gemini API is not available in your current region. Please try another network or VPN.');
      }

      lastErrorText = rawMsg;
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes('API Key') ||
          err.message.includes('rate limit') ||
          err.message.includes('quota') ||
          err.message.includes('region') ||
          err.message.includes('VPN'))
      ) {
        throw err;
      }
      lastErrorText = err.message || 'Could not connect to Google Gemini Vision API.';
    }
  }

  if (!response || !response.ok) {
    if (/is not found for api version|not found|models\//i.test(lastErrorText)) {
      throw new Error('Gemini models not found for this account. Please create a new key via "Create API key in new project" on Google AI Studio.');
    }
    throw new Error(lastErrorText || 'Could not connect to Google Gemini Vision API.');
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const rawText = candidate?.content?.parts?.[0]?.text;

  if (!rawText) {
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`AI generation incomplete (Reason: ${candidate.finishReason}). Please try a clearer photo.`);
    }
    throw new Error('No response text received from AI.');
  }

  return parseGeminiJsonResponse(rawText, categories);
}
