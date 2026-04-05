import { Resend } from "resend";

type InviteEmailInput = {
  activationUrl: string;
  expiresAt: Date;
  inviteeEmail: string;
  inviteeName: string;
  invitedByName: string;
  organizationName: string;
  roleLabel: string;
};

type InviteHygieneDigestInput = {
  adminUrl: string;
  alertCount: number;
  expiringSoonCount: number;
  staleCount: number;
  organizationName: string;
  recipientEmail: string;
  recipientName: string;
  alerts: Array<{
    email: string;
    expiresAt: Date;
    kind: "stale" | "expiring_soon";
    name: string;
  }>;
};

export type InviteDeliveryResult =
  | {
      state: "manual";
      reason: string;
    }
  | {
      state: "sent";
      providerMessageId: string | null;
    }
  | {
      state: "failed";
      reason: string;
    };

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new Resend(apiKey);
}

function buildInviteEmail(input: InviteEmailInput) {
  const expiresAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(input.expiresAt);

  return {
    subject: `Activate your ${input.organizationName} seat in Xelera`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; background: #f4f7fb; padding: 32px; color: #0f172a;">
        <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 24px; padding: 32px; border: 1px solid #dbe4f0;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase; color: #0f766e; font-weight: 700;">
            Xelera.ai
          </p>
          <h1 style="margin: 18px 0 12px; font-size: 32px; line-height: 1.15;">
            Finish activating your sales workspace seat
          </h1>
          <p style="margin: 0 0 18px; font-size: 16px; line-height: 1.7; color: #334155;">
            ${input.invitedByName} created a ${input.roleLabel} seat for ${input.inviteeName} in ${input.organizationName}.
            Use the secure link below to set your password and finish onboarding.
          </p>
          <a
            href="${input.activationUrl}"
            style="display: inline-block; padding: 14px 20px; border-radius: 999px; background: #0f172a; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Activate your seat
          </a>
          <p style="margin: 24px 0 8px; font-size: 14px; line-height: 1.7; color: #475569;">
            This link expires on ${expiresAt}.
          </p>
          <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #475569;">
            If the button doesn’t work, copy and paste this URL into your browser:
          </p>
          <p style="margin: 12px 0 0; font-size: 14px; line-height: 1.7; color: #0f172a; word-break: break-word;">
            ${input.activationUrl}
          </p>
        </div>
      </div>
    `,
  };
}

function buildInviteHygieneDigestEmail(input: InviteHygieneDigestInput) {
  const previewAlerts = input.alerts
    .slice(0, 8)
    .map((alert) => {
      const expiresAt = new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(alert.expiresAt);

      return `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${alert.name}</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #334155;">${alert.email}</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #334155;">${alert.kind === "stale" ? "Stale" : "Expiring soon"}</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; color: #334155;">${expiresAt}</td>
        </tr>
      `;
    })
    .join("");

  return {
    subject: `[Xelera] ${input.alertCount} invite${input.alertCount === 1 ? "" : "s"} need follow-up for ${input.organizationName}`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; background: #f4f7fb; padding: 32px; color: #0f172a;">
        <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border-radius: 24px; padding: 32px; border: 1px solid #dbe4f0;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase; color: #0f766e; font-weight: 700;">
            Xelera.ai
          </p>
          <h1 style="margin: 18px 0 12px; font-size: 30px; line-height: 1.15;">
            Invite hygiene summary for ${input.organizationName}
          </h1>
          <p style="margin: 0 0 18px; font-size: 16px; line-height: 1.7; color: #334155;">
            ${input.recipientName}, ${input.alertCount} pending invite${input.alertCount === 1 ? "" : "s"} need attention today.
            ${input.staleCount} stale and ${input.expiringSoonCount} close to expiry.
          </p>
          <a
            href="${input.adminUrl}"
            style="display: inline-block; padding: 14px 20px; border-radius: 999px; background: #0f172a; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Open user onboarding
          </a>
          <table style="width: 100%; margin-top: 24px; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="text-align: left; color: #475569;">
                <th style="padding-bottom: 12px;">User</th>
                <th style="padding-bottom: 12px;">Email</th>
                <th style="padding-bottom: 12px;">Status</th>
                <th style="padding-bottom: 12px;">Expires</th>
              </tr>
            </thead>
            <tbody>
              ${previewAlerts}
            </tbody>
          </table>
        </div>
      </div>
    `,
  };
}

export async function deliverInviteEmail(input: InviteEmailInput): Promise<InviteDeliveryResult> {
  const resend = getResendClient();
  const from = process.env.INVITE_FROM_EMAIL || "Xelera <onboarding@resend.dev>";

  if (!resend) {
    return {
      state: "manual",
      reason: "RESEND_API_KEY is not configured.",
    };
  }

  const email = buildInviteEmail(input);

  try {
    const response = await resend.emails.send({
      from,
      to: input.inviteeEmail,
      subject: email.subject,
      html: email.html,
    });

    if (response.error) {
      return {
        state: "failed",
        reason: response.error.message,
      };
    }

    return {
      state: "sent",
      providerMessageId: response.data?.id ?? null,
    };
  } catch (error) {
    return {
      state: "failed",
      reason: error instanceof Error ? error.message : "Unknown email delivery failure.",
    };
  }
}

export async function deliverInviteHygieneDigestEmail(
  input: InviteHygieneDigestInput,
): Promise<InviteDeliveryResult> {
  const resend = getResendClient();
  const from = process.env.INVITE_FROM_EMAIL || "Xelera <onboarding@resend.dev>";

  if (!resend) {
    return {
      state: "manual",
      reason: "RESEND_API_KEY is not configured.",
    };
  }

  const email = buildInviteHygieneDigestEmail(input);

  try {
    const response = await resend.emails.send({
      from,
      to: input.recipientEmail,
      subject: email.subject,
      html: email.html,
    });

    if (response.error) {
      return {
        state: "failed",
        reason: response.error.message,
      };
    }

    return {
      state: "sent",
      providerMessageId: response.data?.id ?? null,
    };
  } catch (error) {
    return {
      state: "failed",
      reason: error instanceof Error ? error.message : "Unknown email delivery failure.",
    };
  }
}
