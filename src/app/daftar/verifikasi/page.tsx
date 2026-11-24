import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { EmailVerification } from "@/components/email-signup";
import { currentAccount } from "@/server/account";
import { registrationEmail } from "@/server/email-signup";
import { loginDestination } from "@/domain/login-destination";
import { signupAvailability, turnstileSiteKey } from "@/server/signup-security";
import { sessionCookies } from "@/server/supabase-http";

export const metadata: Metadata = {
  title: "Konfirmasi email",
  robots: { index: false, follow: false },
};

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; lanjut?: string }>;
}) {
  if (await currentAccount()) redirect("/dashboard");
  const [jar, params, availability] = await Promise.all([
    cookies(),
    searchParams,
    signupAvailability(),
  ]);
  const email =
    registrationEmail(jar.get(sessionCookies.pendingEmail)?.value) ?? "";
  const sentAt = Number(jar.get(sessionCookies.pendingSentAt)?.value ?? 0);
  const initialWait = Number.isFinite(sentAt)
    ? Math.min(
        60,
        Math.max(0, Math.ceil((sentAt + 60_000 - Date.now()) / 1000)),
      )
    : 0;
  const destination =
    loginDestination(params.lanjut) ??
    loginDestination(jar.get(sessionCookies.destination)?.value);
  return (
    <main className="verification-page">
      <Link className="verification-brand" href="/" aria-label="Beranda RAMU">
        <Wordmark />
      </Link>
      <EmailVerification
        email={email}
        initialWait={initialWait}
        ready={availability.ready}
        siteKey={turnstileSiteKey()}
        destination={destination}
        invalidLink={params.status === "tautan"}
      />
    </main>
  );
}
