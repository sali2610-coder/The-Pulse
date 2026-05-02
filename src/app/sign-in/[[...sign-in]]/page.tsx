import { SignIn } from "@clerk/nextjs";
import { AUTH_ENABLED } from "@/lib/auth-config";

export default function SignInPage() {
  if (!AUTH_ENABLED) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-light">אימות לא מופעל</h1>
          <p className="text-sm text-muted-foreground">
            כדי להפעיל התחברות, הגדר את משתני הסביבה של Clerk וקבע
            <code className="mx-1">NEXT_PUBLIC_AUTH_ENABLED=true</code>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn />
    </main>
  );
}
