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
  setupTitle?: string;
  setupSteps?: string[];
  verificationTitle?: string;
  verificationSteps?: string[];
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
      actionLabel: hasResendKey && hasAuthFrom ? undefined : "Open auth email setup",
      actionHref: hasResendKey && hasAuthFrom ? undefined : "/admin/setup#auth_email",
      setupTitle: "Configure passwordless auth delivery",
      setupSteps: [
        "Add RESEND_API_KEY in Vercel for the environments you use.",
        "Set AUTH_FROM_EMAIL to the sender address you want for magic-link sign-in.",
        "Redeploy production after updating email provider credentials.",
      ],
      verificationTitle: "Verify auth email delivery",
      verificationSteps: [
        "Open the production login page and use Email me a sign-in link for a test inbox you control.",
        "Confirm the sign-in link email arrives from the expected sender identity.",
        "Use the link to complete a successful sign-in and confirm the user lands on the dashboard.",
      ],
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
      actionLabel: hasResendKey && hasOutboundFrom ? undefined : "Open outbound email setup",
      actionHref: hasResendKey && hasOutboundFrom ? undefined : "/admin/setup#outbound_email",
      setupTitle: "Configure outbound delivery",
      setupSteps: [
        "Add RESEND_API_KEY in Vercel so the outbound worker can send real emails.",
        "Set OUTBOUND_FROM_EMAIL to the verified sender identity for SDR sequences.",
        "Use Send Ops to process the queue once the provider is configured.",
      ],
      verificationTitle: "Verify outbound delivery",
      verificationSteps: [
        "Queue an approved sequence from a test lead in the app.",
        "Run Process outbound queue now from Send Ops or wait for the daily cron window.",
        "Confirm the first email moves to Sent and the provider message flow reaches the target inbox.",
      ],
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
      actionLabel: aiProvider !== "mock" && hasAiKey ? undefined : "Open AI setup",
      actionHref: aiProvider !== "mock" && hasAiKey ? undefined : "/admin/setup#ai_generation",
      setupTitle: "Configure research and drafting provider",
      setupSteps: [
        "Set AI_PROVIDER to the provider you want to use outside mock mode.",
        "Add AI_API_KEY for that provider in Vercel.",
        "Optionally set AI_MODEL and AI_BASE_URL if you need a non-default model or compatible endpoint.",
      ],
      verificationTitle: "Verify AI generation",
      verificationSteps: [
        "Run research and drafting on a fresh lead list after redeploying.",
        "Open a lead detail and confirm the copy is no longer the mock baseline style.",
        "Check that provider-backed research and draft metadata are being recorded in the workflow history.",
      ],
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
      actionLabel: hasCronSecret ? undefined : "Open cron setup",
      actionHref: hasCronSecret ? undefined : "/admin/setup#cron_protection",
      setupTitle: "Configure protected scheduled work",
      setupSteps: [
        "Set CRON_SECRET in Vercel for every environment that should run protected cron routes.",
        "Keep the bearer secret consistent with any manual operational scripts you use.",
        "On Hobby, outbound processing is limited to a daily cron schedule, so use Send Ops for manual runs between scheduled executions.",
      ],
      verificationTitle: "Verify protected cron behavior",
      verificationSteps: [
        "Call the cron route with the configured bearer token and confirm it returns HTTP 200.",
        "Confirm the same route returns HTTP 401 without the secret.",
        "Check recent send or invite activity in the app to make sure the route is affecting real workflow state.",
      ],
    },
  ];
}
