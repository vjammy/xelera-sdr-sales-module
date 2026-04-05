import { PrismaClient, RunStatus, SequenceStatus, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Welcome123!", 10);

  const organization = await prisma.organization.upsert({
    where: { slug: "xelera-ai" },
    update: {},
    create: {
      name: "Xelera.ai",
      slug: "xelera-ai",
    },
  });

  const team = await prisma.team.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Event SDR",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Event SDR",
    },
  });

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: "ava.manager@xelera.ai" },
      update: {},
      create: {
        organizationId: organization.id,
        teamId: team.id,
        name: "Ava Manager",
        email: "ava.manager@xelera.ai",
        passwordHash,
        role: UserRole.sales_manager,
        title: "Sales Manager",
        emailPromptPreference: "Clear, concise, and commercial with room for personalization.",
        sampleEmail: "Hi {{first_name}}, we met at {{event_name}} and I wanted to follow up with a quick idea.",
      },
    }),
    prisma.user.upsert({
      where: { email: "leo.rep@xelera.ai" },
      update: {},
      create: {
        organizationId: organization.id,
        teamId: team.id,
        name: "Leo Rep",
        email: "leo.rep@xelera.ai",
        passwordHash,
        role: UserRole.salesperson,
        title: "Senior SDR",
        phone: "+1 646-555-0101",
        emailPromptPreference: "Friendly and direct. Mention the event context early and keep CTA light.",
        sampleEmail: "Hi {{first_name}}, enjoyed meeting your team at {{event_name}}. Sharing one idea that felt relevant.",
      },
    }),
    prisma.user.upsert({
      where: { email: "maya.ops@xelera.ai" },
      update: {},
      create: {
        organizationId: organization.id,
        teamId: team.id,
        name: "Maya Ops",
        email: "maya.ops@xelera.ai",
        passwordHash,
        role: UserRole.admin_operator,
        title: "Revenue Operations",
      },
    }),
  ]);

  const manager = users[0];
  const salesperson = users[1];

  const products = await Promise.all([
    prisma.product.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: "Event Follow-up Copilot",
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        name: "Event Follow-up Copilot",
        description: "AI-assisted event lead follow-up that keeps reps in control while accelerating draft creation.",
        industry: "B2B SaaS",
        productType: "Workflow Software",
        targetPersona: "VP Sales, Sales Ops, RevOps",
        problemStatement: "Teams lose momentum after events because personalized follow-up is slow and inconsistent.",
        keyBenefits: [
          "Turns event notes into review-ready outreach",
          "Preserves human approval before anything moves forward",
          "Makes manager oversight and bulk approval fast",
        ],
        samplePitch: "Xelera helps your team convert event lists into researched, human-reviewed sequences in hours instead of days.",
        pricingNotes: "Pilot pricing available with event-volume packaging.",
      },
    }),
    prisma.product.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: "Pipeline Insight Layer",
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        name: "Pipeline Insight Layer",
        description: "Signal layer for surfacing buying priorities from fragmented prospect research.",
        industry: "B2B SaaS",
        productType: "Revenue Intelligence",
        targetPersona: "RevOps, Sales Enablement",
        problemStatement: "Teams struggle to transform scattered account signals into outreach strategy quickly.",
        keyBenefits: [
          "Maps pain themes to buyer roles",
          "Helps reps tailor angle and proof points",
          "Improves outreach consistency across the team",
        ],
        samplePitch: "A signal layer that turns rough account research into clear outreach direction for reps and managers.",
      },
    }),
  ]);

  const list = await prisma.leadList.upsert({
    where: { id: "demo-list-xelera" },
    update: {},
    create: {
      id: "demo-list-xelera",
      organizationId: organization.id,
      assignedSalespersonId: salesperson.id,
      uploadedById: manager.id,
      name: "SaaStr Annual Follow-up",
      eventSourceName: "SaaStr Annual 2026",
      eventDate: new Date("2026-03-12T00:00:00.000Z"),
      eventCity: "San Mateo",
      eventCountry: "USA",
      notes: "Focus on revenue operations leaders who mentioned post-event follow-up bottlenecks or rep enablement needs.",
      uploadFileName: "saastr-annual-2026.xlsx",
      totalRows: 4,
      acceptedRows: 4,
      rejectedRows: 0,
      status: "partially_approved",
    },
  });

  const companyA = await prisma.company.upsert({
    where: { id: "demo-company-aperture" },
    update: {},
    create: {
      id: "demo-company-aperture",
      organizationId: organization.id,
      name: "Aperture Cloud",
      domain: "aperturecloud.com",
      industry: "SaaS infrastructure",
      employeeSize: "201-500",
      geography: "North America",
      summary: "Aperture Cloud sells developer infrastructure and is scaling field marketing plus event follow-up.",
      likelyNeeds: [
        "Convert event interest into pipeline faster",
        "Give managers visibility into follow-up quality",
      ],
    },
  });

  const contactA = await prisma.contact.upsert({
    where: { id: "demo-contact-cora" },
    update: {},
    create: {
      id: "demo-contact-cora",
      organizationId: organization.id,
      companyId: companyA.id,
      fullName: "Cora Jensen",
      email: "cora@aperturecloud.com",
      phone: "+1 415-555-0102",
      title: "Director of Revenue Operations",
      roleSummary: "Owns outbound process quality, tooling, and manager reporting.",
      responsibilities: ["Sales workflow design", "Team-level process instrumentation"],
      buyerAngle: "Looking for scalable event follow-up and manager control.",
      personalizationHooks: ["Mentioned that event leads currently sit in spreadsheets for too long"],
    },
  });

  const leadA = await prisma.lead.upsert({
    where: { id: "demo-lead-cora" },
    update: {},
    create: {
      id: "demo-lead-cora",
      organizationId: organization.id,
      leadListId: list.id,
      companyId: companyA.id,
      contactId: contactA.id,
      assignedSalespersonId: salesperson.id,
      fullName: contactA.fullName,
      email: contactA.email,
      phone: contactA.phone,
      title: contactA.title,
      contactNotes: "Asked about how quickly managers can review drafted outreach after a large event.",
      status: "review_ready",
      companyResearchStatus: RunStatus.complete,
      contactResearchStatus: RunStatus.complete,
    },
  });

  const draftRun = await prisma.draftRun.upsert({
    where: { id: "demo-draft-run-cora" },
    update: {},
    create: {
      id: "demo-draft-run-cora",
      organizationId: organization.id,
      leadId: leadA.id,
      productId: products[0].id,
      status: RunStatus.complete,
      selectedProductName: products[0].name,
      mainAngle: "Human-reviewed event follow-up at scale",
      tone: "Direct but helpful",
      painHypothesis: "Your team is still doing too much manual cleanup and rewriting after each event.",
      suggestedCta: "Open to a short working session next week?",
      messagingBrief: {
        eventContext: "SaaStr Annual 2026",
        note: "Mention manager visibility and faster turnaround from event to outreach.",
      },
    },
  });

  await prisma.sequence.upsert({
    where: { leadId: leadA.id },
    update: {},
    create: {
      organizationId: organization.id,
      leadId: leadA.id,
      productId: products[0].id,
      draftRunId: draftRun.id,
      status: SequenceStatus.review_ready,
      selectedProductName: products[0].name,
      valueProposition: "Turn event leads into researched, approval-ready sequences in the same day.",
      targetAngle: "Manager-friendly workflow control",
      relevantBenefits: [
        "Preserves rep judgment",
        "Supports bulk approval after trust is built",
        "Surfaces event context inside the review flow",
      ],
      mainOutreachAngle: "Faster post-event execution without losing tone control",
      tone: "Warm, confident, and operational",
      painHypothesis: "Post-event follow-up is slow because context and drafting are fragmented.",
      suggestedCta: "Would a 20-minute workflow review be useful?",
      emails: {
        create: [
          {
            emailOrder: 1,
            subject: "Cora, a better way to move on SaaStr leads quickly",
            body: "Hi Cora,\n\nYou mentioned that event follow-up can stall once the list leaves the booth team. We built Xelera to turn event leads into researched, review-ready email sequences so reps move faster without losing control over tone or approvals.\n\nIf useful, I can show you how managers review batches once the team is comfortable with the drafts.\n\nBest,\nLeo",
            scheduledSendOffsetHours: 0,
          },
          {
            emailOrder: 2,
            subject: "How teams keep the human review step without slowing down",
            body: "Hi Cora,\n\nOne detail teams like is that reps still own the final approval, edits, and regenerate prompts. The system handles the research and draft progression, but the salesperson stays in control.\n\nIf you want, I can share the exact review workflow we use after large events.\n\nBest,\nLeo",
            scheduledSendOffsetHours: 48,
          },
          {
            emailOrder: 3,
            subject: "Worth a quick look after SaaStr?",
            body: "Hi Cora,\n\nCircling back in case the post-event follow-up challenge is still fresh. If your RevOps team wants a faster path from event list to approved outreach, I’d be happy to walk through a short example.\n\nWould next week be reasonable?\n\nBest,\nLeo",
            scheduledSendOffsetHours: 120,
          },
        ],
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
