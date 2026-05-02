import type { CategoryId } from "@/lib/categories";

export type ExpensePayload = {
  amount: number;
  category: CategoryId;
  note?: string;
  timestamp: string;
  deviceId: string;
};
