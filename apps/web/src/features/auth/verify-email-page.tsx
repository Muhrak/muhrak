import { AuthShell } from "./auth-shell";
import type { PortalSide } from "./paths";
import { ConfirmEmailForm, RequestVerificationForm } from "./verify-email";

/**
 * /buyer/verify-email and /seller/verify-email. With ?token= (the link in the
 * email): one click verifies. Without: ask for a new link. No Figma frame;
 * it reuses the light auth layout, like the reset password page.
 */
export async function VerifyEmailPage({ side, searchParams }: { side: PortalSide; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  const verifyToken = typeof token === "string" && token.length > 0 ? token : undefined;

  return (
    <AuthShell
      side={side}
      panelTitle="Almost There"
      panelDescription={
        side === "seller"
          ? "Verify your email to open your Seller Centre and start selling on Muhrak."
          : "Verify your email to start finding parts and getting quotes on Muhrak."
      }
      title={verifyToken ? "Verify Your Email" : "New Verification Link"}
      description={verifyToken ? "One click and your account is active." : "Enter your email and we will send you a new link."}
    >
      {verifyToken ? <ConfirmEmailForm side={side} token={verifyToken} /> : <RequestVerificationForm side={side} />}
    </AuthShell>
  );
}
