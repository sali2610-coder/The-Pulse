import { redirect } from "next/navigation";

// Google OAuth covers both sign-in and sign-up — the first login auto-
// creates the user. Any link still pointing at /sign-up bounces to the
// welcome screen at `/` which renders the actual Google CTA.

export default function SignUpPage() {
  redirect("/");
}
