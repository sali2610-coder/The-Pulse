import { AuthShell } from "@/components/auth/auth-shell";
import { SignInClient } from "@/components/auth/sign-in-client";
import { isAuthEnabled } from "@/lib/auth/config";

// Custom NextAuth sign-in page. NextAuth's `pages.signIn` points here so
// middleware-protected routes redirect users to this page instead of the
// default NextAuth boilerplate. When Google creds are not present this
// renders a passive message; the dashboard itself still works in device-id
// mode.

export const metadata = {
  title: "התחברות · Sally",
};

export default function SignInPage({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string; error?: string };
}) {
  const authEnabled = isAuthEnabled();
  const callbackUrl =
    typeof searchParams?.callbackUrl === "string"
      ? searchParams.callbackUrl
      : "/";
  const error =
    typeof searchParams?.error === "string" ? searchParams.error : undefined;

  return (
    <AuthShell
      title={authEnabled ? "התחברות ל-Sally" : "האפליקציה פתוחה"}
      subtitle={
        authEnabled
          ? "התחבר עם Google כדי לסנכרן בין מכשירים."
          : "כל המידע נשמר מקומית במכשיר הזה."
      }
    >
      <SignInClient
        authEnabled={authEnabled}
        callbackUrl={callbackUrl}
        initialError={error}
      />
    </AuthShell>
  );
}
