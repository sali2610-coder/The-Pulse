import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { AUTH_ENABLED } from "@/lib/auth-config";
import { AuthShell } from "@/components/auth/auth-shell";

export default function SignInPage() {
  if (!AUTH_ENABLED) {
    return (
      <AuthShell
        title="התחברות זמנית כבויה"
        subtitle="האפליקציה רצה כרגע במצב single-user."
      >
        <div className="flex flex-col gap-3 text-right text-sm">
          <p className="text-foreground/85">
            כל המידע נשמר מקומית במכשיר. כדי לקבל גישה רב־משתמשים, צריך
            להוסיף מפתחות Clerk חיים ולשנות{" "}
            <code className="font-mono text-foreground/70">
              NEXT_PUBLIC_AUTH_ENABLED
            </code>{" "}
            ל־<code className="font-mono text-foreground/70">true</code> ב־Vercel.
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

  return (
    <AuthShell
      title="ברוך שובך"
      subtitle="התחבר כדי לסנכרן את ה־Pulse שלך."
      footer={
        <span>
          אין לך חשבון?{" "}
          <Link
            href="/sign-up"
            className="text-[color:var(--neon)] underline-offset-2 hover:underline"
          >
            הרשמה
          </Link>
        </span>
      }
    >
      <SignIn
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "bg-transparent shadow-none border-none p-0",
            headerTitle: "hidden",
            headerSubtitle: "hidden",
            socialButtonsBlockButton:
              "border-white/10 bg-surface/60 hover:bg-surface/80",
            formButtonPrimary:
              "btn-confirm rounded-2xl text-sm font-semibold normal-case",
            footerActionLink: "text-[color:var(--neon)]",
          },
          variables: {
            colorPrimary: "#00E5FF",
            colorBackground: "transparent",
            colorText: "#F5F5F5",
            colorInputBackground: "rgba(255,255,255,0.04)",
            colorInputText: "#F5F5F5",
            borderRadius: "12px",
          },
        }}
      />
    </AuthShell>
  );
}
