import {
  buildMessagingBrief as buildMockMessagingBrief,
  deriveCompanyProfile as deriveMockCompanyProfile,
  deriveContactProfile as deriveMockContactProfile,
  draftSequence as draftMockSequence,
} from "@/lib/mock-ai";

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

type StructuredGenerationResult<T> = {
  provider: string;
  model: string;
  output: T;
  rawOutput: unknown;
};

const DEFAULT_PROVIDER = process.env.AI_PROVIDER ?? "mock";
const DEFAULT_MODEL = process.env.AI_MODEL ?? "gpt-4.1-mini";
const DEFAULT_BASE_URL = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";

function canUseRealAi() {
  return Boolean(process.env.AI_API_KEY) && DEFAULT_PROVIDER !== "mock";
}

async function runOpenAiCompatibleJsonPrompt<T>(args: {
  system: string;
  user: string;
  fallback: T;
}): Promise<StructuredGenerationResult<T>> {
  if (!canUseRealAi()) {
    return {
      provider: "mock",
      model: "mock-seeded",
      output: args.fallback,
      rawOutput: args.fallback,
    };
  }

  try {
    const response = await fetch(`${DEFAULT_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `${args.system}\nReturn only valid JSON. Do not wrap the response in markdown.`,
          },
          {
            role: "user",
            content: args.user,
          },
        ],
      }),
    });

    if (!response.ok) {
      return {
        provider: "mock",
        model: "mock-fallback",
        output: args.fallback,
        rawOutput: {
          status: response.status,
          provider: DEFAULT_PROVIDER,
          fallback: true,
        },
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content) as T;

    return {
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      output: parsed,
      rawOutput: payload,
    };
  } catch (error) {
    return {
      provider: "mock",
      model: "mock-fallback",
      output: args.fallback,
      rawOutput: {
        error: error instanceof Error ? error.message : "Unknown AI error",
        fallback: true,
      },
    };
  }
}

export async function deriveCompanyProfile(input: {
  email?: string | null;
  companyName?: string | null;
  eventSourceName: string;
  contactNotes?: string | null;
}) {
  const fallback = deriveMockCompanyProfile(input.email, input.companyName);

  return runOpenAiCompatibleJsonPrompt<typeof fallback>({
    system:
      "You generate compact B2B company research for outbound sales workflows. Keep outputs factual-sounding, concise, and useful for SDR messaging.",
    user: JSON.stringify(
      {
        task: "Generate company research JSON",
        input,
        schema: {
          name: "string",
          domain: "string | undefined",
          industry: "string",
          employeeSize: "string",
          geography: "string",
          summary: "string",
          likelyNeeds: ["string"],
        },
      },
      null,
      2,
    ),
    fallback,
  });
}

export async function deriveContactProfile(input: {
  title?: string | null;
  contactNotes?: string | null;
  companyName: string;
}) {
  const fallback = deriveMockContactProfile(input.title, input.contactNotes);

  return runOpenAiCompatibleJsonPrompt<typeof fallback>({
    system:
      "You generate concise buyer-role research for outbound sales. Focus on role summary, likely responsibilities, buyer angle, and one or two personalization hooks.",
    user: JSON.stringify(
      {
        task: "Generate contact research JSON",
        input,
        schema: {
          roleSummary: "string",
          responsibilities: ["string"],
          buyerAngle: "string",
          personalizationHooks: ["string"],
        },
      },
      null,
      2,
    ),
    fallback,
  });
}

export async function buildMessagingBrief(args: {
  lead: LeadContext;
  product: ProductContext;
  salesperson: SalespersonContext;
}) {
  const fallback = buildMockMessagingBrief(args.lead, args.product, args.salesperson);

  return runOpenAiCompatibleJsonPrompt<typeof fallback>({
    system:
      "You generate outbound messaging briefs for SDR sequences. Keep the brief commercially credible, manager-reviewable, and specific to the event follow-up context.",
    user: JSON.stringify(
      {
        task: "Generate messaging brief JSON",
        input: args,
        schema: {
          selectedProductName: "string",
          valueProposition: "string",
          targetAngle: "string",
          relevantBenefits: ["string"],
          mainOutreachAngle: "string",
          tone: "string",
          painHypothesis: "string",
          suggestedCta: "string",
          note: "string",
        },
      },
      null,
      2,
    ),
    fallback,
  });
}

export async function draftSequence(args: {
  lead: LeadContext;
  product: ProductContext;
  salesperson: SalespersonContext;
  brief: ReturnType<typeof buildMockMessagingBrief>;
  prompt?: string;
}) {
  const fallback = draftMockSequence(
    args.lead,
    args.product,
    args.salesperson,
    args.brief,
    args.prompt,
  );

  return runOpenAiCompatibleJsonPrompt<typeof fallback>({
    system:
      "You generate a 3-email SDR follow-up sequence as JSON. Each email needs a subject, body, emailOrder, and scheduledSendOffsetHours. Keep it human-reviewed and practical.",
    user: JSON.stringify(
      {
        task: "Generate sequence email JSON",
        input: args,
        schema: [
          {
            emailOrder: "number",
            subject: "string",
            body: "string",
            scheduledSendOffsetHours: "number",
          },
        ],
      },
      null,
      2,
    ),
    fallback,
  });
}
