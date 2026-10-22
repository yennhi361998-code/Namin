export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  const isAllowedOrigin =
    !origin ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.includes('namin') ||
    origin.includes('vercel.app') ||
    origin.includes('firebaseapp.com') ||
    origin.includes('web.app');

  if (!isAllowedOrigin) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const corsOrigin = req.headers.get('origin') || '*';

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { apiKey, base64, mimeType, categoryNames = '' } = body;

    const cleanKey = String(apiKey || '').trim().replace(/^["']|["']$/g, '').trim();
    if (!cleanKey) {
      return new Response(JSON.stringify({ error: 'Gemini API Key is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!base64) {
      return new Response(JSON.stringify({ error: 'Image data is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
                mimeType: mimeType || 'image/jpeg',
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

    // Discover available models for this specific API key
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
        const listUrl = `https://generativelanguage.googleapis.com/${ep}/models`;
        const listRes = await fetch(listUrl, {
          method: 'GET',
          headers: {
            'x-goog-api-key': cleanKey,
          },
        });
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
        // continue
      }
    }

    let lastError = '';
    for (const model of modelsToTry) {
      try {
        const cleanModel = model.replace(/^models\//, '');
        const targetUrl = `https://generativelanguage.googleapis.com/${activeEndpoint}/models/${cleanModel}:generateContent`;
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cleanKey,
          },
          body: JSON.stringify(requestBody),
        });

        if (res.ok) {
          const data = await res.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            return new Response(JSON.stringify({ success: true, text: rawText }), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': corsOrigin,
              },
            });
          }
        }

        const errJson = await res.json().catch(() => ({}));
        const rawMsg = errJson?.error?.message || `HTTP ${res.status}`;
        lastError = rawMsg;
        if (/api_key_invalid|api key not valid|key not found|invalid api key/i.test(rawMsg)) {
          return new Response(
            JSON.stringify({ error: 'Invalid Google Gemini API Key. Please verify your API Key in Settings.' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } catch (err: any) {
        lastError = err.message || 'Connection error';
      }
    }

    return new Response(
      JSON.stringify({ error: lastError || 'Unable to connect to Gemini model.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
