import type { ExpensePayload } from "@/types/expense";

export async function postExpense(payload: ExpensePayload): Promise<void> {
  const endpoint = process.env.NEXT_PUBLIC_EXPENSE_ENDPOINT;
  if (!endpoint) {
    throw new Error("חסר NEXT_PUBLIC_EXPENSE_ENDPOINT — עדכן את .env.local");
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("בעיית רשת — נסה שוב בעוד רגע");
  }

  if (!res.ok) {
    throw new Error(`השרת החזיר שגיאה (${res.status})`);
  }
}
