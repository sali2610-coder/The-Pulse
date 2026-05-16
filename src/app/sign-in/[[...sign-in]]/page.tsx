import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";

// Auth disabled. Stub page — never reached via redirect because middleware
// is now a pass-through. If a user lands here via bookmark/old PWA cache,
// route them back to the dashboard.

export const metadata = {
  title: "Sally",
};

export default function SignInPage() {
  return (
    <AuthShell
      title="התחברות לא נדרשת"
      subtitle="האפליקציה רצה כרגע במצב פתוח."
    >
      <div className="flex flex-col gap-3 text-right text-sm">
        <p className="text-foreground/85">
          כל המידע נשמר מקומית במכשיר. אפשר להמשיך ישר לדאשבורד.
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
