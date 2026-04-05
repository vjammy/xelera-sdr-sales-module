type ReadinessTone = "success" | "warning" | "neutral";

export type ProviderReadinessItem = {
  key: "auth_email" | "outbound_email" | "ai_generation" | "cron_protection";
  label: string;
  statusLabel: string;
  tone: ReadinessTone;
  detail: string;
  missingEnvNames?: string[];
  actionLabel?: string;
  actionHref?: string;
};

function hasEnv(name: string) {
  const value = process.env[name];
  return Boolean(value && value.trim().length > 0);
}

export function getProviderReadiness(): ProviderReadinessItem[] {
  const hasResendKey = hasEnv("RESEND_API_KEY");
  const hasInviteFrom = hasEnv("INVITE_FROM_EMAIL");
  const hasAuthFrom = hasEnv("AUTH_FROM_EMAIL") || hasInviteFrom;
  const hasOutboundFrom = hasEnv("OUTBOUND_FROM_EMAIL") || hasInviteFrom;
  const aiProvider = process.env.AI_PROVIDER?.trim() || "mock";
  const hasAiKey = hasEnv("AI_API_KEY");
  const hasCronSecret = hasEnv("CRON_SECRET");

  return [
    {
      key: "auth_email",
      label: "Auth sign-in email",
      statusLabel: hasResendKey && hasAuthFrom ? "Configured" : "Manual fallback",
      tone: hasResendKey && hasAuthFrom ? "success" : "warning",
      detail:
        hasResendKey && hasAuthFrom
          ? "Magic-link sign-in can send through the configured email provider."
          : "Magic-link auth will fall back until RESEND_API_KEY is configured in this environment.",
      missingEnvNames:
        hasResendKey && hasAuthFrom
          ? []
          : ["RESEND_API_KEY", ...(hasAuthFrom ? [] : ["AUTH_FROM_EMAIL"])],
      actionLabel: hasResendKey && hasAuthFrom ? undefined : "Add auth email provider env",
      actionHref: hasResendKey && hasAuthFrom ? undefined : "/admin/sends",
    },
    {
      key: "outbound_email",
      label: "Outbound email delivery",
      statusLabel: hasResendKey && hasOutboundFrom ? "Configured" : "Mock provider mode",
      tone: hasResendKey && hasOutboundFrom ? "success" : "warning",
      detail:
        hasResendKey && hasOutboundFrom
          ? "Approved outbound emails can send through the configured delivery provider."
          : "The outbound worker will use safe mock delivery until RESEND_API_KEY is configured.",
      missingEnvNames:
        hasResendKey && hasOutboundFrom
          ? []
          : ["RESEND_API_KEY", ...(hasOutboundFrom ? [] : ["OUTBOUND_FROM_EMAIL"])],
      actionLabel: hasResendKey && hasOutboundFrom ? undefined : "Add outbound email provider env",
      actionHref: hasResendKey && hasOutboundFrom ? undefined : "/admin/sends",
    },
    {
      key: "ai_generation",
      label: "AI research and drafting",
      statusLabel: aiProvider !== "mock" && hasAiKey ? "Configured" : aiProvider === "mock" ? "Mock provider mode" : "Incomplete config",
      tone: aiProvider !== "mock" && hasAiKey ? "success" : "warning",
      detail:
        aiProvider !== "mock" && hasAiKey
          ? `Research and drafting run against the configured ${aiProvider} provider.`
          : aiProvider === "mock"
            ? "Research and drafting are still using mock generation in this environment."
            : `AI provider "${aiProvider}" is selected, but AI_API_KEY is missing so the app will fall back to mock generation.`,
      missingEnvNames: aiProvider !== "mock" && hasAiKey ? [] : aiProvider === "mock" ? ["AI_PROVIDER", "AI_API_KEY"] : ["AI_API_KEY"],
      actionLabel: aiProvider !== "mock" && hasAiKey ? undefined : "Add AI provider env",
      actionHref: aiProvider !== "mock" && hasAiKey ? undefined : "/admin/sends",
    },
    {
      key: "cron_protection",
      label: "Cron protection",
      statusLabel: hasCronSecret ? "Configured" : "Missing secret",
      tone: hasCronSecret ? "success" : "warning",
      detail:
        hasCronSecret
          ? "Protected cron routes can run with bearer-token authorization."
          : "CRON_SECRET is missing, so scheduled routes cannot be safely triggered in this environment.",
      missingEnvNames: hasCronSecret ? [] : ["CRON_SECRET"],
      actionLabel: hasCronSecret ? undefined : "Add cron auth env",
      actionHref: hasCronSecret ? undefined : "/admin/sends",
    },
  ];
}
