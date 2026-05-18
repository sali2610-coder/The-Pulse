import { redirect } from "next/navigation";

// Welcome screen + Google CTA live at `/` now. Anyone landing on /sign-in
// (old bookmark, stale NextAuth redirect target, deep link) is forwarded
// to the canonical location so we don't maintain two near-identical pages.

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const params = new URLSearchParams();
  if (typeof sp.callbackUrl === "string" && sp.callbackUrl.startsWith("/")) {
    params.set("callbackUrl", sp.callbackUrl);
  }
  if (typeof sp.error === "string" && sp.error.length > 0) {
    params.set("error", sp.error);
  }
  const qs = params.toString();
  redirect(qs ? `/?${qs}` : "/");
}
