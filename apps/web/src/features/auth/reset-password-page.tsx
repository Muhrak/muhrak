import { AuthShell } from "./auth-shell";
import type { PortalSide } from "./paths";
import { ChooseNewPasswordForm, RequestResetForm } from "./reset-password-form";

/**
 * /buyer/reset-password and /seller/reset-password. There is no Figma frame
 * for this screen, so it reuses the light auth layout of the login page.
 */
export async function ResetPasswordPage({ side, searchParams }: { side: PortalSide; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  const resetToken = typeof token === "string" && token.length > 0 ? token : undefined;

  return (
    <AuthShell
      side={side}
      panelTitle={resetToken ? "Almost Done" : "Forgot Password?"}
      panelDescription={
        side === "seller"
          ? "Get back to your quote requests, products and orders on Muhrak."
          : "Get back to your quotes, orders and messages on Muhrak."
      }
      title={resetToken ? "Choose New Password" : "Reset Password"}
      description={
        resetToken ? "Pick a new password for your Muhrak account." : "Enter your email and we will send you a link to reset it."
      }
    >
      {resetToken ? <ChooseNewPasswordForm side={side} token={resetToken} /> : <RequestResetForm side={side} />}
    </AuthShell>
  );
}
