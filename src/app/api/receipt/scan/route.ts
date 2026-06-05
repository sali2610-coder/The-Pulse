// Phase 386 — Receipt scan endpoint.
//
// Accepts multipart/form-data with one or more "image" parts.
// Forwards them to Claude vision and asks for a structured receipt
// extraction. Returns a stable JSON shape the client can prefill the
// Add Expense form with.
//
// Data safety
//   • The route NEVER persists images. Each upload is base64-encoded
//     in-memory, sent to Anthropic, and dropped at the end of the
//     request.
//   • The returned struct contains ONLY parsed text (numbers, store
//     name, date). No image bytes.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGES = 6;
const MAX_BYTES_PER_IMAGE = 5 * 1024 * 1024; // 5 MB
const SUPPORTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

type ReceiptItem = { label: string; price: number | null };

export type ReceiptScanResult = {
  total: number | null;
  merchant: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:mm */
  time: string | null;
  paymentMethod: "cash" | "credit" | null;
  cardLast4: string | null;
  items: ReceiptItem[];
  vat: number | null;
  transactionNumber: string | null;
  confidence: "high" | "medium" | "low";
  note: string | null;
};

const SYSTEM_PROMPT = `אתה עוזר חכם שמחלץ מידע מקבלת קנייה בעברית או באנגלית.
החזר JSON תקני בלבד, ללא טקסט נוסף, לפי הסכמה הבאה:

{
  "total": number|null,
  "merchant": string|null,
  "date": "YYYY-MM-DD"|null,
  "time": "HH:mm"|null,
  "paymentMethod": "cash"|"credit"|null,
  "cardLast4": string|null,
  "items": [{ "label": string, "price": number|null }],
  "vat": number|null,
  "transactionNumber": string|null,
  "confidence": "high"|"medium"|"low",
  "note": string|null
}

כללים:
- total = הסכום הסופי לתשלום (כולל מע"מ). אם יש "סה"כ שולם" העדף אותו.
- merchant = שם החנות בעברית כפי שמופיע בראש הקבלה, ללא ח.פ או כתובת.
- date = תאריך העסקה בפורמט YYYY-MM-DD.
- time = שעת העסקה HH:mm אם מופיעה.
- paymentMethod = "credit" אם הקבלה מציינת אשראי / ויזה / מאסטרקארד / Apple Pay; "cash" אם מזומן; null אחרת.
- cardLast4 = ארבע ספרות אחרונות של כרטיס אם מופיעות.
- items = רשימת פריטים עם שם ומחיר. אם אין יכולת לזהות, החזר [].
- vat = סכום המע"מ אם מצוין.
- transactionNumber = מספר עסקה / קבלה.
- confidence = "high" אם total ו-merchant ברורים, "medium" אם רק חלק, "low" אם הקבלה מטושטשת.
- note = משפט אחד שמתאר את הקנייה לטובת המשתמש. עברית, קצר.
- אם יש כמה תמונות של אותה קבלה (חלקים שונים) — אחד את המידע.

אל תמציא נתונים. אם משהו לא ברור — החזר null וציין confidence נמוך.`;

export async function POST(req: Request): Promise<NextResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "missing_api_key",
        message:
          "סריקת קבלה דורשת ANTHROPIC_API_KEY בהגדרות. הוסף את המפתח בדף הסביבה ונסה שוב.",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_form", message: "צילום הקבלה לא נקלט" },
      { status: 400 },
    );
  }

  const images: { mime: string; b64: string }[] = [];
  const entries = form.getAll("image");
  if (entries.length === 0) {
    return NextResponse.json(
      { error: "no_images", message: "נדרש לפחות צילום אחד" },
      { status: 400 },
    );
  }
  if (entries.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: "too_many_images", message: `עד ${MAX_IMAGES} תמונות` },
      { status: 413 },
    );
  }
  for (const entry of entries) {
    if (!(entry instanceof Blob)) continue;
    const mime = entry.type || "image/jpeg";
    if (!SUPPORTED_MIME.has(mime)) {
      return NextResponse.json(
        { error: "bad_image_type", message: "סוג קובץ לא נתמך" },
        { status: 415 },
      );
    }
    const buf = await entry.arrayBuffer();
    if (buf.byteLength > MAX_BYTES_PER_IMAGE) {
      return NextResponse.json(
        { error: "image_too_large", message: "התמונה גדולה מדי" },
        { status: 413 },
      );
    }
    const b64 = Buffer.from(buf).toString("base64");
    images.push({ mime, b64 });
  }

  const userContent: Array<
    | { type: "text"; text: string }
    | {
        type: "image";
        source: { type: "base64"; media_type: string; data: string };
      }
  > = images.map((img) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: img.mime,
      data: img.b64,
    },
  }));
  userContent.push({
    type: "text",
    text: "אנא חלץ את הפרטים מהקבלה והחזר JSON בלבד.",
  });

  let anthropicResp: Response;
  try {
    anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });
  } catch {
    return NextResponse.json(
      {
        error: "upstream_unreachable",
        message: "לא ניתן להתחבר למנוע סריקה",
      },
      { status: 502 },
    );
  }

  if (!anthropicResp.ok) {
    const text = await anthropicResp.text().catch(() => "");
    return NextResponse.json(
      {
        error: "upstream_error",
        status: anthropicResp.status,
        message: "מנוע הסריקה החזיר שגיאה",
        detail: text.slice(0, 600),
      },
      { status: 502 },
    );
  }

  const raw = (await anthropicResp.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const textOut = (raw.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();

  const parsed = extractJson(textOut);
  if (!parsed) {
    return NextResponse.json(
      {
        error: "parse_failed",
        message: "לא הצלחנו לקרוא את הקבלה — נסה צילום ברור יותר",
      },
      { status: 422 },
    );
  }

  const normalized = normalizeResult(parsed);
  return NextResponse.json(normalized);
}

function extractJson(text: string): unknown {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* try fenced */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* fall through */
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.\-]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length === 0 ? null : t;
}

function normalizeResult(raw: unknown): ReceiptScanResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const itemsRaw = Array.isArray(r.items) ? r.items : [];
  const items: ReceiptItem[] = [];
  for (const it of itemsRaw.slice(0, 30)) {
    if (!it || typeof it !== "object") continue;
    const rec = it as Record<string, unknown>;
    const label = asString(rec.label) ?? "";
    if (!label) continue;
    items.push({ label, price: asNumber(rec.price) });
  }
  const confidenceRaw = asString(r.confidence)?.toLowerCase();
  const confidence: ReceiptScanResult["confidence"] =
    confidenceRaw === "high"
      ? "high"
      : confidenceRaw === "low"
        ? "low"
        : "medium";
  const paymentRaw = asString(r.paymentMethod)?.toLowerCase();
  const paymentMethod: ReceiptScanResult["paymentMethod"] =
    paymentRaw === "cash"
      ? "cash"
      : paymentRaw === "credit" || paymentRaw === "card"
        ? "credit"
        : null;
  return {
    total: asNumber(r.total),
    merchant: asString(r.merchant),
    date: asString(r.date),
    time: asString(r.time),
    paymentMethod,
    cardLast4: asString(r.cardLast4),
    items,
    vat: asNumber(r.vat),
    transactionNumber: asString(r.transactionNumber),
    confidence,
    note: asString(r.note),
  };
}
