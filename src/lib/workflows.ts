import { type Prisma, RunStatus, SequenceStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildMessagingBrief,
  deriveCompanyProfile,
  deriveContactProfile,
  draftSequence,
} from "@/lib/mock-ai";

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

  const companyProfile = lead.company
    ? {
        name: lead.company.name,
        domain: lead.company.domain ?? undefined,
        industry: lead.company.industry ?? undefined,
        employeeSize: lead.company.employeeSize ?? undefined,
        geography: lead.company.geography ?? undefined,
        summary: lead.company.summary ?? undefined,
        likelyNeeds: coerceStringArray(lead.company.likelyNeeds),
      }
    : deriveCompanyProfile(lead.email, null);

  const company = lead.company
    ? await prisma.company.update({
        where: { id: lead.company.id },
        data: companyProfile,
      })
    : await prisma.company.create({
        data: {
          organizationId: lead.organizationId,
          ...companyProfile,
          name: companyProfile.name,
        },
      });

  const contactProfile = deriveContactProfile(lead.title, lead.contactNotes);
  const contact = lead.contact
    ? await prisma.contact.update({
        where: { id: lead.contact.id },
        data: {
          companyId: company.id,
          roleSummary: contactProfile.roleSummary,
          responsibilities: contactProfile.responsibilities,
          buyerAngle: contactProfile.buyerAngle,
          personalizationHooks: contactProfile.personalizationHooks,
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
          roleSummary: contactProfile.roleSummary,
          responsibilities: contactProfile.responsibilities,
          buyerAngle: contactProfile.buyerAngle,
          personalizationHooks: contactProfile.personalizationHooks,
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
        summary: companyProfile,
        completedAt: new Date(),
      },
      {
        organizationId: lead.organizationId,
        leadId: lead.id,
        companyId: company.id,
        kind: "contact_enrichment",
        status: RunStatus.complete,
        summary: contactProfile,
        completedAt: new Date(),
      },
    ],
  });

  const brief = buildMessagingBrief(
    {
      fullName: lead.fullName,
      firstName: lead.fullName.split(" ")[0] || "there",
      companyName: company.name,
      companyDomain: company.domain ?? "unknown domain",
      title: lead.title ?? contact.title ?? "buyer",
      listName: lead.leadList.name,
      eventSourceName: lead.leadList.eventSourceName,
      eventNotes: lead.leadList.notes ?? "",
      contactNotes: lead.contactNotes ?? "",
    },
    {
      name: activeProduct.name,
      description: activeProduct.description,
      targetPersona: activeProduct.targetPersona,
      problemStatement: activeProduct.problemStatement,
      keyBenefits: coerceStringArray(activeProduct.keyBenefits),
      samplePitch: activeProduct.samplePitch,
    },
    {
      name: lead.assignedSalesperson.name.split(" ")[0] || lead.assignedSalesperson.name,
      title: lead.assignedSalesperson.title ?? "Salesperson",
      preference: lead.assignedSalesperson.emailPromptPreference ?? "",
    },
  );

  const draftRun = await prisma.draftRun.create({
    data: {
      organizationId: lead.organizationId,
      leadId: lead.id,
      productId: activeProduct.id,
      status: RunStatus.complete,
      selectedProductName: activeProduct.name,
      mainAngle: brief.mainOutreachAngle,
      tone: brief.tone,
      painHypothesis: brief.painHypothesis,
      suggestedCta: brief.suggestedCta,
      messagingBrief: brief,
    },
  });

  const draftedEmails = draftSequence(
    {
      fullName: lead.fullName,
      firstName: lead.fullName.split(" ")[0] || "there",
      companyName: company.name,
      companyDomain: company.domain ?? "unknown domain",
      title: lead.title ?? contact.title ?? "buyer",
      listName: lead.leadList.name,
      eventSourceName: lead.leadList.eventSourceName,
      eventNotes: lead.leadList.notes ?? "",
      contactNotes: lead.contactNotes ?? "",
    },
    {
      name: activeProduct.name,
      description: activeProduct.description,
      targetPersona: activeProduct.targetPersona,
      problemStatement: activeProduct.problemStatement,
      keyBenefits: coerceStringArray(activeProduct.keyBenefits),
      samplePitch: activeProduct.samplePitch,
    },
    {
      name: lead.assignedSalesperson.name.split(" ")[0] || lead.assignedSalesperson.name,
      title: lead.assignedSalesperson.title ?? "Salesperson",
      preference: lead.assignedSalesperson.emailPromptPreference ?? "",
    },
    brief,
  );

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
      valueProposition: brief.valueProposition,
      targetAngle: brief.targetAngle,
      relevantBenefits: brief.relevantBenefits,
      mainOutreachAngle: brief.mainOutreachAngle,
      tone: brief.tone,
      painHypothesis: brief.painHypothesis,
      suggestedCta: brief.suggestedCta,
      emails: {
        create: draftedEmails,
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

  const brief = {
    valueProposition: lead.sequence.valueProposition ?? "",
    relevantBenefits: coerceStringArray(lead.sequence.relevantBenefits),
  };

  const regenerated = draftSequence(
    {
      fullName: lead.fullName,
      firstName: lead.fullName.split(" ")[0] || "there",
      companyName: lead.company.name,
      companyDomain: lead.company.domain ?? "unknown domain",
      title: lead.title ?? lead.contact?.title ?? "buyer",
      listName: lead.leadList.name,
      eventSourceName: lead.leadList.eventSourceName,
      eventNotes: lead.leadList.notes ?? "",
      contactNotes: lead.contactNotes ?? "",
    },
    {
      name: product.name,
      description: product.description,
      targetPersona: product.targetPersona,
      problemStatement: product.problemStatement,
      keyBenefits: coerceStringArray(product.keyBenefits),
      samplePitch: product.samplePitch,
    },
    {
      name: lead.assignedSalesperson.name.split(" ")[0] || lead.assignedSalesperson.name,
      title: lead.assignedSalesperson.title ?? "Salesperson",
      preference: lead.assignedSalesperson.emailPromptPreference ?? "",
    },
    {
      selectedProductName: lead.sequence.selectedProductName ?? product.name,
      valueProposition: brief.valueProposition,
      targetAngle: lead.sequence.targetAngle ?? "",
      relevantBenefits: brief.relevantBenefits,
      mainOutreachAngle: lead.sequence.mainOutreachAngle ?? "",
      tone: lead.sequence.tone ?? "",
      painHypothesis: lead.sequence.painHypothesis ?? "",
      suggestedCta: lead.sequence.suggestedCta ?? "",
      note: lead.contactNotes ?? "",
    },
    args.prompt,
  );

  const toUpdate = args.emailOrder
    ? regenerated.filter((item) => item.emailOrder === args.emailOrder)
    : regenerated;

  await prisma.generationPrompt.create({
    data: {
      organizationId: lead.organizationId,
      leadId: lead.id,
      createdById: args.actorId,
      promptType: args.emailOrder ? "regenerate_one" : "regenerate_all",
      targetEmail: args.emailOrder,
      inputPrompt: args.prompt,
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
    include: { sequence: true, leadList: true },
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
