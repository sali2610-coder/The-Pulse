import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";

// Auth disabled. Stub page mirrors sign-in.

export const metadata = {
  title: "Sally",
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="הרשמה לא נדרשת"
      subtitle="האפליקציה רצה כרגע במצב פתוח."
    >
      <div className="flex flex-col gap-3 text-right text-sm">
        <p className="text-foreground/85">
          הדאשבורד פתוח לכולם מהדף הראשי, ללא חשבון.
        </p>
        <Link
          href="/"
          className="btn-confirm flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold transition-transform active:scale-[0.99]"
        >
          המשך אל הדאשבורד
        </Link>
      </div>
    </AuthShell>
  );
}
