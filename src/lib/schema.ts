import { z } from "zod";
import { CATEGORY_IDS } from "./categories";

export const expenseFormSchema = z.object({
  amount: z
    .number({ message: "יש להזין סכום" })
    .positive({ message: "הסכום חייב להיות גדול מאפס" })
    .max(1_000_000, { message: "סכום גבוה מדי" }),
  category: z.enum(CATEGORY_IDS, { message: "יש לבחור קטגוריה" }),
  paymentMethod: z.enum(["cash", "credit"], {
    message: "יש לבחור אמצעי תשלום",
  }),
  installments: z
    .number({ message: "מספר תשלומים לא תקין" })
    .int({ message: "מספר תשלומים חייב להיות שלם" })
    .min(1, { message: "מינימום תשלום אחד" })
    .max(60, { message: "עד 60 תשלומים" }),
  note: z.string().max(200, { message: "הערה ארוכה מדי" }).optional(),
});

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export const recurringRuleFormSchema = z.object({
  label: z
    .string()
    .min(2, { message: "שם קצר מדי" })
    .max(40, { message: "שם ארוך מדי" }),
  category: z.enum(CATEGORY_IDS, { message: "יש לבחור קטגוריה" }),
  estimatedAmount: z
    .number({ message: "יש להזין סכום צפוי" })
    .positive({ message: "הסכום חייב להיות גדול מאפס" })
    .max(1_000_000, { message: "סכום גבוה מדי" }),
  dayOfMonth: z
    .number({ message: "יום בחודש לא תקין" })
    .int()
    .min(1, { message: "1 עד 31" })
    .max(31, { message: "1 עד 31" }),
  keywords: z.string().max(120).optional(),
  /** Installment plan fields — optional. When all three are set, the rule
   *  fires for exactly `installmentTotal` months starting at
   *  `startMonth`/`startYear`. */
  installmentTotal: z
    .number({ message: "מספר תשלומים לא תקין" })
    .int()
    .min(1, { message: "מינימום תשלום אחד" })
    .max(120, { message: "עד 120 תשלומים" })
    .optional(),
  startMonth: z.number().int().min(1).max(12).optional(),
  startYear: z.number().int().min(2000).max(2100).optional(),
});

export type RecurringRuleFormValues = z.infer<typeof recurringRuleFormSchema>;
