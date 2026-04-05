type LeadContext = {
  fullName: string;
  firstName: string;
  companyName: string;
  companyDomain: string;
  title: string;
  listName: string;
  eventSourceName: string;
  eventNotes: string;
  contactNotes: string;
};

type ProductContext = {
  name: string;
  description: string;
  targetPersona: string;
  problemStatement: string;
  keyBenefits: string[];
  samplePitch: string;
};

type SalespersonContext = {
  name: string;
  title: string;
  preference: string;
};

export function deriveCompanyProfile(email?: string | null, companyName?: string | null) {
  const domain = email?.includes("@") ? email.split("@")[1].toLowerCase() : null;
  const inferredName =
    companyName ||
    domain?.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) ||
    "Unknown Company";

  return {
    name: inferredName,
    domain: domain ?? undefined,
    industry: "B2B software",
    employeeSize: domain?.includes("cloud") ? "201-500" : "51-200",
    geography: "North America",
    summary: `${inferredName} appears to be a growth-stage B2B business that likely cares about post-event pipeline conversion and rep productivity.`,
    likelyNeeds: [
      "Reduce lag between event conversations and first follow-up",
      "Preserve manager oversight while letting reps move quickly",
    ],
  };
}

export function deriveContactProfile(title?: string | null, contactNotes?: string | null) {
  const role = title || "Commercial lead";

  return {
    roleSummary: `${role} focused on turning rough opportunity signals into coordinated follow-up.`,
    responsibilities: [
      "Prioritizes follow-up quality and consistency",
      "Needs workflow visibility without adding admin overhead",
    ],
    buyerAngle: `Frame the conversation around control, speed, and reviewability for ${role.toLowerCase()}.`,
    personalizationHooks: contactNotes
      ? [contactNotes]
      : ["Tie the message back to the event context and any workflow pain they mentioned."],
  };
}

export function buildMessagingBrief(
  lead: LeadContext,
  product: ProductContext,
  salesperson: SalespersonContext,
) {
  const primaryBenefit = product.keyBenefits[0] ?? "Creates cleaner follow-up execution";

  return {
    selectedProductName: product.name,
    valueProposition: `${product.name} helps teams move from event leads to reviewed outreach without losing human control.`,
    targetAngle: `Speak to ${lead.title || product.targetPersona} about workflow confidence after ${lead.eventSourceName}.`,
    relevantBenefits: product.keyBenefits,
    mainOutreachAngle: `${primaryBenefit} after ${lead.eventSourceName}`,
    tone: salesperson.preference || "Warm, concise, and commercially credible",
    painHypothesis: `${lead.companyName} likely loses momentum between event conversations and rep-approved follow-up.`,
    suggestedCta: "Would a short walkthrough be useful next week?",
    note: `${lead.eventNotes} ${lead.contactNotes}`.trim(),
  };
}

export function draftSequence(
  lead: LeadContext,
  product: ProductContext,
  salesperson: SalespersonContext,
  brief: ReturnType<typeof buildMessagingBrief>,
  prompt?: string,
) {
  const promptLine = prompt ? ` Adapted to: ${prompt}.` : "";

  return [
    {
      emailOrder: 1,
      subject: `${lead.firstName}, a faster path from event list to approved outreach`,
      body: `Hi ${lead.firstName},

I wanted to follow up after ${lead.eventSourceName}. Based on what we heard from ${lead.companyName}, it sounds like your team could benefit from moving event leads into review-ready sequences much faster without losing human approval.

${product.name} gives reps researched drafts, preserves manager visibility, and keeps the salesperson in control before anything gets approved.${promptLine}

Would it be useful to compare notes for 20 minutes?

Best,
${salesperson.name}`,
      scheduledSendOffsetHours: 0,
    },
    {
      emailOrder: 2,
      subject: `How teams keep the human review loop without slowing reps down`,
      body: `Hi ${lead.firstName},

One reason teams respond well to this workflow is that it does not ask reps to trust a black box. Reps can edit, regenerate, pause, or reject drafts, and managers only bulk approve sequences that are already review-ready.

That tends to create comfort quickly after events when volume is high.${promptLine}

Happy to share the review flow if useful.

Best,
${salesperson.name}`,
      scheduledSendOffsetHours: 48,
    },
    {
      emailOrder: 3,
      subject: `Worth a quick look for ${lead.companyName}?`,
      body: `Hi ${lead.firstName},

Closing the loop in case improving post-event follow-up is still on your radar. ${brief.valueProposition}

If the idea is relevant, I can show how the workflow uses list notes, role research, and product context to create drafts that still feel rep-owned.${promptLine}

Open to a short working session?

Best,
${salesperson.name}`,
      scheduledSendOffsetHours: 120,
    },
  ];
}
