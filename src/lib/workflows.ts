import { type Prisma, RunStatus, SequenceStatus, UserRole } from "@prisma/client";
import {
  buildMessagingBrief,
  deriveCompanyProfile,
  deriveContactProfile,
  draftSequence,
} from "@/lib/ai-provider";
import { cancelFutureSequenceEmails } from "@/lib/outbound";
import { prisma } from "@/lib/prisma";

function coerceStringArray(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item));
}

async function writeAuditEvent(args: {
  organizationId: string;
  actorId?: string;
  entityType: string;
  entityId: string;
  action: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditEvent.create({ data: args });
}

function buildLeadContext(args: {
  lead: {
    fullName: string;
    title?: string | null;
    contactNotes?: string | null;
    leadList: {
      name: string;
      eventSourceName: string;
      notes?: string | null;
    };
  };
  companyName: string;
  companyDomain?: string | null;
  fallbackTitle?: string | null;
}) {
  return {
    fullName: args.lead.fullName,
    firstName: args.lead.fullName.split(" ")[0] || "there",
    companyName: args.companyName,
    companyDomain: args.companyDomain ?? "unknown domain",
    title: args.lead.title ?? args.fallbackTitle ?? "buyer",
    listName: args.lead.leadList.name,
    eventSourceName: args.lead.leadList.eventSourceName,
    eventNotes: args.lead.leadList.notes ?? "",
    contactNotes: args.lead.contactNotes ?? "",
  };
}

function buildProductContext(product: {
  name: string;
  description: string;
  targetPersona: string;
  problemStatement: string;
  keyBenefits: Prisma.JsonValue;
  samplePitch: string;
}) {
  return {
    name: product.name,
    description: product.description,
    targetPersona: product.targetPersona,
    problemStatement: product.problemStatement,
    keyBenefits: coerceStringArray(product.keyBenefits),
    samplePitch: product.samplePitch,
  };
}

function buildSalespersonContext(user: {
  name: string;
  title?: string | null;
  emailPromptPreference?: string | null;
}) {
  return {
    name: user.name.split(" ")[0] || user.name,
    title: user.title ?? "Salesperson",
    preference: user.emailPromptPreference ?? "",
  };
}

export async function processLeadWorkflow(leadId: string, actorId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      leadList: true,
      assignedSalesperson: true,
      company: true,
      contact: true,
    },
  });

  if (!lead || !lead.assignedSalesperson) {
    throw new Error("Lead or assigned salesperson was not found.");
  }

  const activeProduct = await prisma.product.findFirst({
    where: { organizationId: lead.organizationId, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (!activeProduct) {
    throw new Error("At least one active product is required before drafting.");
  }

  const companyResearch = lead.company
    ? {
        provider: "seeded",
        model: "seeded",
        output: {
          name: lead.company.name,
          domain: lead.company.domain ?? undefined,
          industry: lead.company.industry ?? undefined,
          employeeSize: lead.company.employeeSize ?? undefined,
          geography: lead.company.geography ?? undefined,
          summary: lead.company.summary ?? undefined,
          likelyNeeds: coerceStringArray(lead.company.likelyNeeds),
        },
        rawOutput: null,
      }
    : await deriveCompanyProfile({
        email: lead.email,
        companyName: null,
        eventSourceName: lead.leadList.eventSourceName,
        contactNotes: lead.contactNotes,
      });

  const company = lead.company
    ? await prisma.company.update({
        where: { id: lead.company.id },
        data: companyResearch.output,
      })
    : await prisma.company.create({
        data: {
          organizationId: lead.organizationId,
          ...companyResearch.output,
          name: companyResearch.output.name,
        },
      });

  const contactResearch = await deriveContactProfile({
    title: lead.title,
    contactNotes: lead.contactNotes,
    companyName: company.name,
  });

  const contact = lead.contact
    ? await prisma.contact.update({
        where: { id: lead.contact.id },
        data: {
          companyId: company.id,
          roleSummary: contactResearch.output.roleSummary,
          responsibilities: contactResearch.output.responsibilities,
          buyerAngle: contactResearch.output.buyerAngle,
          personalizationHooks: contactResearch.output.personalizationHooks,
        },
      })
    : await prisma.contact.create({
        data: {
          organizationId: lead.organizationId,
          companyId: company.id,
          fullName: lead.fullName,
          email: lead.email,
          phone: lead.phone,
          title: lead.title,
          roleSummary: contactResearch.output.roleSummary,
          responsibilities: contactResearch.output.responsibilities,
          buyerAngle: contactResearch.output.buyerAngle,
          personalizationHooks: contactResearch.output.personalizationHooks,
        },
      });

  await prisma.researchRun.createMany({
    data: [
      {
        organizationId: lead.organizationId,
        leadId: lead.id,
        companyId: company.id,
        kind: "company_enrichment",
        status: RunStatus.complete,
        provider: companyResearch.provider,
        model: companyResearch.model,
        summary: companyResearch.output,
        rawOutput: companyResearch.rawOutput as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
      {
        organizationId: lead.organizationId,
        leadId: lead.id,
        companyId: company.id,
        kind: "contact_enrichment",
        status: RunStatus.complete,
        provider: contactResearch.provider,
        model: contactResearch.model,
        summary: contactResearch.output,
        rawOutput: contactResearch.rawOutput as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    ],
  });

  const leadContext = buildLeadContext({
    lead,
    companyName: company.name,
    companyDomain: company.domain,
    fallbackTitle: contact.title,
  });
  const productContext = buildProductContext(activeProduct);
  const salespersonContext = buildSalespersonContext(lead.assignedSalesperson);

  const briefGeneration = await buildMessagingBrief({
    lead: leadContext,
    product: productContext,
    salesperson: salespersonContext,
  });

  const draftRun = await prisma.draftRun.create({
    data: {
      organizationId: lead.organizationId,
      leadId: lead.id,
      productId: activeProduct.id,
      status: RunStatus.complete,
      provider: briefGeneration.provider,
      model: briefGeneration.model,
      selectedProductName: activeProduct.name,
      mainAngle: briefGeneration.output.mainOutreachAngle,
      tone: briefGeneration.output.tone,
      painHypothesis: briefGeneration.output.painHypothesis,
      suggestedCta: briefGeneration.output.suggestedCta,
      messagingBrief: briefGeneration.output,
      rawOutput: briefGeneration.rawOutput as Prisma.InputJsonValue,
    },
  });

  const draftedSequence = await draftSequence({
    lead: leadContext,
    product: productContext,
    salesperson: salespersonContext,
    brief: briefGeneration.output,
  });

  await prisma.sequence.deleteMany({
    where: { leadId: lead.id },
  });

  const sequence = await prisma.sequence.create({
    data: {
      organizationId: lead.organizationId,
      leadId: lead.id,
      productId: activeProduct.id,
      draftRunId: draftRun.id,
      status: SequenceStatus.review_ready,
      selectedProductName: activeProduct.name,
      valueProposition: briefGeneration.output.valueProposition,
      targetAngle: briefGeneration.output.targetAngle,
      relevantBenefits: briefGeneration.output.relevantBenefits,
      mainOutreachAngle: briefGeneration.output.mainOutreachAngle,
      tone: briefGeneration.output.tone,
      painHypothesis: briefGeneration.output.painHypothesis,
      suggestedCta: briefGeneration.output.suggestedCta,
      emails: {
        create: draftedSequence.output,
      },
    },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      companyId: company.id,
      contactId: contact.id,
      status: "review_ready",
      companyResearchStatus: RunStatus.complete,
      contactResearchStatus: RunStatus.complete,
    },
  });

  await prisma.reviewAction.create({
    data: {
      organizationId: lead.organizationId,
      leadId: lead.id,
      sequenceId: sequence.id,
      actorId,
      actionType: "regenerate_all",
      note: "Initial research and draft generation completed.",
      afterState: {
        sequenceStatus: SequenceStatus.review_ready,
      },
    },
  });

  await writeAuditEvent({
    organizationId: lead.organizationId,
    actorId,
    entityType: "lead",
    entityId: lead.id,
    action: "workflow.processed",
    metadata: {
      sequenceId: sequence.id,
      draftRunId: draftRun.id,
      researchProvider: companyResearch.provider,
      draftProvider: draftedSequence.provider,
    },
  });
}

export async function processLeadList(listId: string, actorId: string) {
  const list = await prisma.leadList.findUnique({
    where: { id: listId },
    include: {
      leads: true,
    },
  });

  if (!list) {
    throw new Error("Lead list not found.");
  }

  await prisma.leadList.update({
    where: { id: listId },
    data: { status: "research_in_progress" },
  });

  for (const lead of list.leads) {
    await processLeadWorkflow(lead.id, actorId);
  }

  const approvals = await prisma.lead.count({
    where: {
      leadListId: listId,
      status: "approved",
    },
  });

  await prisma.leadList.update({
    where: { id: listId },
    data: {
      status: approvals > 0 ? "partially_approved" : "drafts_ready",
    },
  });
}

export async function updateSequenceContent(args: {
  leadId: string;
  actorId: string;
  emails: Array<{ order: number; subject: string; body: string }>;
}) {
  const lead = await prisma.lead.findUnique({
    where: { id: args.leadId },
    include: {
      sequence: {
        include: { emails: true },
      },
    },
  });

  if (!lead?.sequence) {
    throw new Error("Sequence not found.");
  }

  const beforeState = lead.sequence.emails.map((email) => ({
    order: email.emailOrder,
    subject: email.subject,
    body: email.body,
  }));

  for (const email of args.emails) {
    await prisma.sequenceEmail.update({
      where: {
        sequenceId_emailOrder: {
          sequenceId: lead.sequence.id,
          emailOrder: email.order,
        },
      },
      data: {
        subject: email.subject,
        body: email.body,
        editStatus: "edited",
      },
    });
  }

  await prisma.reviewAction.create({
    data: {
      organizationId: lead.organizationId,
      leadId: lead.id,
      sequenceId: lead.sequence.id,
      actorId: args.actorId,
      actionType: "manual_edit",
      beforeState,
      afterState: args.emails,
    },
  });
}

export async function regenerateSequence(args: {
  leadId: string;
  actorId: string;
  prompt: string;
  emailOrder?: number;
}) {
  const lead = await prisma.lead.findUnique({
    where: { id: args.leadId },
    include: {
      leadList: true,
      company: true,
      contact: true,
      assignedSalesperson: true,
      sequence: {
        include: { emails: true },
      },
    },
  });

  if (!lead?.sequence || !lead.assignedSalesperson || !lead.company) {
    throw new Error("Lead is not ready for regeneration.");
  }

  const product = await prisma.product.findFirst({
    where: {
      organizationId: lead.organizationId,
      name: lead.sequence.selectedProductName ?? undefined,
    },
  });

  if (!product) {
    throw new Error("Product context missing.");
  }

  const regeneratedSequence = await draftSequence({
    lead: buildLeadContext({
      lead,
      companyName: lead.company.name,
      companyDomain: lead.company.domain,
      fallbackTitle: lead.contact?.title,
    }),
    product: buildProductContext(product),
    salesperson: buildSalespersonContext(lead.assignedSalesperson),
    brief: {
      selectedProductName: lead.sequence.selectedProductName ?? product.name,
      valueProposition: lead.sequence.valueProposition ?? "",
      targetAngle: lead.sequence.targetAngle ?? "",
      relevantBenefits: coerceStringArray(lead.sequence.relevantBenefits),
      mainOutreachAngle: lead.sequence.mainOutreachAngle ?? "",
      tone: lead.sequence.tone ?? "",
      painHypothesis: lead.sequence.painHypothesis ?? "",
      suggestedCta: lead.sequence.suggestedCta ?? "",
      note: lead.contactNotes ?? "",
    },
    prompt: args.prompt,
  });

  const toUpdate = args.emailOrder
    ? regeneratedSequence.output.filter((item) => item.emailOrder === args.emailOrder)
    : regeneratedSequence.output;

  await prisma.generationPrompt.create({
    data: {
      organizationId: lead.organizationId,
      leadId: lead.id,
      createdById: args.actorId,
      promptType: args.emailOrder ? "regenerate_one" : "regenerate_all",
      provider: regeneratedSequence.provider,
      model: regeneratedSequence.model,
      targetEmail: args.emailOrder,
      inputPrompt: args.prompt,
      outputText: JSON.stringify(toUpdate),
      metadata: regeneratedSequence.rawOutput as Prisma.InputJsonValue,
    },
  });

  for (const email of toUpdate) {
    await prisma.sequenceEmail.update({
      where: {
        sequenceId_emailOrder: {
          sequenceId: lead.sequence.id,
          emailOrder: email.emailOrder,
        },
      },
      data: {
        subject: email.subject,
        body: email.body,
        editStatus: "regenerated",
      },
    });
  }

  await prisma.reviewAction.create({
    data: {
      organizationId: lead.organizationId,
      leadId: lead.id,
      sequenceId: lead.sequence.id,
      actorId: args.actorId,
      actionType: args.emailOrder ? "regenerate_one" : "regenerate_all",
      prompt: args.prompt,
      targetEmail: args.emailOrder,
      afterState: toUpdate as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function setSequenceStatus(args: {
  leadId: string;
  actorId: string;
  status: SequenceStatus;
  note?: string;
}) {
  const lead = await prisma.lead.findUnique({
    where: { id: args.leadId },
    include: {
      sequence: {
        include: {
          emails: true,
        },
      },
      leadList: true,
    },
  });

  if (!lead?.sequence) {
    throw new Error("Sequence not found.");
  }

  const leadStatusMap: Record<SequenceStatus, "review_ready" | "paused" | "rejected" | "approved" | "draft_pending"> = {
    draft: "draft_pending",
    review_ready: "review_ready",
    approved: "approved",
    paused: "paused",
    rejected: "rejected",
  };

  await prisma.sequence.update({
    where: { id: lead.sequence.id },
    data: {
      status: args.status,
      approvedAt: args.status === "approved" ? new Date() : null,
      approvedById: args.status === "approved" ? args.actorId : null,
    },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: leadStatusMap[args.status],
    },
  });

  if (args.status === "approved") {
    await prisma.sequenceEmail.updateMany({
      where: {
        sequenceId: lead.sequence.id,
        sendStatus: "draft",
      },
      data: {
        sendStatus: "approved_pending",
        canceledAt: null,
        lastDeliveryError: null,
      },
    });
  }

  if (args.status === "paused" || args.status === "rejected") {
    await cancelFutureSequenceEmails({
      sequenceId: lead.sequence.id,
      actorId: args.actorId,
      organizationId: lead.organizationId,
      reason: args.status === "paused" ? "Sequence paused by reviewer." : "Sequence rejected by reviewer.",
    });
  }

  const totalLeads = await prisma.lead.count({
    where: { leadListId: lead.leadListId },
  });
  const approvedLeads = await prisma.lead.count({
    where: { leadListId: lead.leadListId, status: "approved" },
  });

  await prisma.leadList.update({
    where: { id: lead.leadListId },
    data: {
      status:
        approvedLeads === 0
          ? "drafts_ready"
          : approvedLeads < totalLeads
            ? "partially_approved"
            : "fully_approved",
    },
  });

  const actionTypeMap: Record<SequenceStatus, "approve" | "pause" | "reject" | "manual_edit"> = {
    draft: "manual_edit",
    review_ready: "manual_edit",
    approved: "approve",
    paused: "pause",
    rejected: "reject",
  };

  await prisma.reviewAction.create({
    data: {
      organizationId: lead.organizationId,
      leadId: lead.id,
      sequenceId: lead.sequence.id,
      actorId: args.actorId,
      actionType: actionTypeMap[args.status],
      note: args.note,
      afterState: {
        status: args.status,
      },
    },
  });
}

export async function bulkApproveLeads(args: {
  leadIds: string[];
  actorId: string;
  actorRole: UserRole;
  organizationId: string;
}) {
  if (args.actorRole !== "sales_manager") {
    throw new Error("Only sales managers can bulk approve in this release.");
  }

  const leads = await prisma.lead.findMany({
    where: {
      id: { in: args.leadIds },
      organizationId: args.organizationId,
    },
    include: {
      sequence: true,
    },
  });

  const skipped: Array<{ leadId: string; reason: string }> = [];
  let approvedCount = 0;

  for (const lead of leads) {
    if (!lead.sequence) {
      skipped.push({ leadId: lead.id, reason: "Sequence missing." });
      continue;
    }

    if (lead.status !== "review_ready" || lead.sequence.status !== "review_ready") {
      skipped.push({ leadId: lead.id, reason: "Lead is not review-ready." });
      continue;
    }

    await setSequenceStatus({
      leadId: lead.id,
      actorId: args.actorId,
      status: "approved",
      note: "Approved in manager bulk action.",
    });
    approvedCount += 1;
  }

  await prisma.bulkApprovalBatch.create({
    data: {
      organizationId: args.organizationId,
      actorId: args.actorId,
      leadIds: args.leadIds,
      approvedCount,
      skippedCount: skipped.length,
      skippedReasons: skipped,
    },
  });

  return {
    approvedCount,
    skipped,
  };
}
