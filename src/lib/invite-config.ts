export function getInviteDeliveryConfig() {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  return {
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    fromEmail: process.env.INVITE_FROM_EMAIL || "Xelera <onboarding@resend.dev>",
    appUrl,
    usingFallbackAppUrl: !process.env.NEXT_PUBLIC_APP_URL,
    automaticDeliveryReady: Boolean(process.env.RESEND_API_KEY),
  };
}
