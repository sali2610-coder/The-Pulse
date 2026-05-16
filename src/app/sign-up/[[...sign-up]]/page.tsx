import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { AUTH_ENABLED } from "@/lib/auth-config";
import { AuthShell } from "@/components/auth/auth-shell";

export default function SignUpPage() {
  if (!AUTH_ENABLED) {
    return (
      <AuthShell
        title="הרשמה זמנית כבויה"
        subtitle="האפליקציה רצה כרגע במצב single-user."
      >
        <div className="flex flex-col gap-3 text-right text-sm">
          <p className="text-foreground/85">
            אין צורך בהרשמה — הדאשבורד פתוח מהדף הראשי. כשנעבור למצב
            רב־משתמשים נחזיר את החוויה הזו.
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
      title="צור חשבון Sally"
      subtitle="הצטרף בלחיצה אחת. הכל מסונכרן בענן."
      footer={
        <span>
          כבר רשום?{" "}
          <Link
            href="/sign-in"
            className="text-[color:var(--neon)] underline-offset-2 hover:underline"
          >
            התחבר
          </Link>
        </span>
      }
    >
      <SignUp
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
