// Phase 386 — client helper for /api/receipt/scan.

export type ReceiptItem = { label: string; price: number | null };

export type ReceiptScanResult = {
  total: number | null;
  merchant: string | null;
  date: string | null;
  time: string | null;
  paymentMethod: "cash" | "credit" | null;
  cardLast4: string | null;
  items: ReceiptItem[];
  vat: number | null;
  transactionNumber: string | null;
  confidence: "high" | "medium" | "low";
  note: string | null;
};

export type ScanError = {
  ok: false;
  message: string;
  code?: string;
};

export type ScanSuccess = {
  ok: true;
  data: ReceiptScanResult;
};

export async function scanReceiptImages(
  images: File[],
): Promise<ScanSuccess | ScanError> {
  if (images.length === 0) {
    return { ok: false, message: "נדרש לפחות צילום אחד" };
  }
  const form = new FormData();
  for (const img of images) form.append("image", img);
  let resp: Response;
  try {
    resp = await fetch("/api/receipt/scan", {
      method: "POST",
      body: form,
    });
  } catch {
    return { ok: false, message: "אין חיבור לרשת" };
  }
  if (!resp.ok) {
    let msg = "סריקה נכשלה";
    let code: string | undefined;
    try {
      const body = (await resp.json()) as {
        message?: string;
        error?: string;
      };
      if (body.message) msg = body.message;
      if (body.error) code = body.error;
    } catch {
      /* swallow */
    }
    return { ok: false, message: msg, code };
  }
  const data = (await resp.json()) as ReceiptScanResult;
  return { ok: true, data };
}
