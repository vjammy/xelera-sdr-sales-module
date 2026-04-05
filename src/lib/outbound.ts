import crypto from "node:crypto";
import { Prisma, SequenceEmailSendStatus, SequenceStatus } from "@prisma/client";
import { addHours } from "date-fns";
import { deliverOutboundSequenceEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

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

function getFirstUnsentEmail(sequence: {
  id: string;
  emails: Array<{
    id: string;
    emailOrder: number;
    sendStatus: SequenceEmailSendStatus;
    scheduledSendOffsetHours: number;
  }>;
}) {
  return [...sequence.emails]
    .sort((left, right) => left.emailOrder - right.emailOrder)
    .find((email) => email.sendStatus !== "sent" && email.sendStatus !== "canceled");
}

function getImmediateDueAt() {
  return new Date(Date.now() - 1_000);
}

export async function queueSequenceForSend(args: {
  leadId: string;
  actorId: string;
  organizationId: string;
}) {
  const lead = await prisma.lead.findFirst({
    where: {
      id: args.leadId,
      organizationId: args.organizationId,
    },
    include: {
      sequence: {
        include: {
          emails: {
            orderBy: { emailOrder: "asc" },
          },
        },
      },
    },
  });

  if (!lead?.sequence) {
    throw new Error("Sequence not found.");
  }

  if (lead.sequence.status !== SequenceStatus.approved || lead.status !== "approved") {
    throw new Error("Only approved sequences can be queued for send.");
  }

  const nextEmail = getFirstUnsentEmail(lead.sequence);

  if (!nextEmail) {
    throw new Error("This sequence has already finished sending.");
  }

  const dueAt = getImmediateDueAt();

  await prisma.$transaction([
    prisma.sequenceEmail.updateMany({
      where: {
        sequenceId: lead.sequence.id,
        sendStatus: "draft",
      },
      data: {
        sendStatus: "approved_pending",
      },
    }),
    prisma.sequenceEmail.update({
      where: { id: nextEmail.id },
      data: {
        sendStatus: "queued",
        dueAt,
        queuedAt: new Date(),
        lastDeliveryError: null,
      },
    }),
  ]);

  await writeAuditEvent({
    organizationId: args.organizationId,
    actorId: args.actorId,
    entityType: "sequence",
    entityId: lead.sequence.id,
    action: "send.queued",
    metadata: {
      leadId: lead.id,
      nextEmailId: nextEmail.id,
      nextEmailOrder: nextEmail.emailOrder,
      dueAt: dueAt.toISOString(),
    },
  });
}

export async function retryFailedSequenceEmail(args: {
  sequenceEmailId: string;
  actorId: string;
  organizationId: string;
}) {
  const email = await prisma.sequenceEmail.findFirst({
    where: {
      id: args.sequenceEmailId,
      sequence: {
        organizationId: args.organizationId,
      },
    },
    include: {
      sequence: {
        include: {
          lead: true,
        },
      },
    },
  });

  if (!email) {
    throw new Error("Sequence email not found.");
  }

  if (email.sequence.status !== "approved" || email.sequence.lead.status !== "approved") {
    throw new Error("Only approved sequences can retry failed sends.");
  }

  if (email.sendStatus !== "failed") {
    throw new Error("Only failed sequence emails can be retried.");
  }

  await prisma.sequenceEmail.update({
    where: { id: email.id },
      data: {
        sendStatus: "queued",
        dueAt: getImmediateDueAt(),
        queuedAt: new Date(),
        lastDeliveryError: null,
        sendLockId: null,
      sendLockExpiresAt: null,
    },
  });

  await writeAuditEvent({
    organizationId: args.organizationId,
    actorId: args.actorId,
    entityType: "sequence_email",
    entityId: email.id,
    action: "send.retry_queued",
    metadata: {
      sequenceId: email.sequenceId,
      emailOrder: email.emailOrder,
    },
  });
}

export async function processOutboundEmailQueue(args: {
  actorId?: string;
  limit?: number;
}) {
  const now = new Date();
  const queuedEmails = await prisma.sequenceEmail.findMany({
    where: {
      sendStatus: "queued",
      dueAt: {
        lte: now,
      },
      OR: [
        { sendLockExpiresAt: null },
        { sendLockExpiresAt: { lt: now } },
      ],
      sequence: {
        status: "approved",
        lead: {
          status: "approved",
        },
      },
    },
    include: {
      sequence: {
        include: {
          lead: true,
          emails: {
            orderBy: { emailOrder: "asc" },
          },
        },
      },
    },
    orderBy: [{ dueAt: "asc" }, { emailOrder: "asc" }],
    take: args.limit ?? 20,
  });

  const results: Array<{ id: string; state: "sent" | "failed" | "skipped" }> = [];

  for (const email of queuedEmails) {
    const lockId = crypto.randomUUID();
    const locked = await prisma.sequenceEmail.updateMany({
      where: {
        id: email.id,
        sendStatus: "queued",
        OR: [{ sendLockExpiresAt: null }, { sendLockExpiresAt: { lt: now } }],
      },
      data: {
        sendStatus: "sending",
        sendingStartedAt: new Date(),
        lastAttemptedAt: new Date(),
        sendLockId: lockId,
        sendLockExpiresAt: addHours(new Date(), 1),
      },
    });

    if (!locked.count) {
      continue;
    }

    const freshEmail = await prisma.sequenceEmail.findUnique({
      where: { id: email.id },
      include: {
        sequence: {
          include: {
            lead: true,
            emails: {
              orderBy: { emailOrder: "asc" },
            },
          },
        },
      },
    });

    if (
      !freshEmail ||
      freshEmail.sequence.status !== "approved" ||
      freshEmail.sequence.lead.status !== "approved" ||
      !freshEmail.sequence.lead.email
    ) {
      await prisma.sequenceEmail.update({
        where: { id: email.id },
        data: {
          sendStatus: "canceled",
          canceledAt: new Date(),
          sendLockId: null,
          sendLockExpiresAt: null,
          lastDeliveryError: freshEmail?.sequence.lead.email ? "Sequence is not approved." : "Lead email missing.",
        },
      });
      results.push({ id: email.id, state: "skipped" });
      continue;
    }

    const delivery = await deliverOutboundSequenceEmail({
      fromEmail: process.env.OUTBOUND_FROM_EMAIL || "",
      recipientEmail: freshEmail.sequence.lead.email,
      recipientName: freshEmail.sequence.lead.fullName,
      subject: freshEmail.subject,
      body: freshEmail.body,
    });

    if (delivery.state === "failed") {
      await prisma.sequenceEmail.update({
        where: { id: email.id },
        data: {
          sendStatus: "failed",
          failedAt: new Date(),
          lastDeliveryError: delivery.reason,
          retryCount: { increment: 1 },
          sendLockId: null,
          sendLockExpiresAt: null,
        },
      });

      await writeAuditEvent({
        organizationId: freshEmail.sequence.organizationId,
        actorId: args.actorId,
        entityType: "sequence_email",
        entityId: email.id,
        action: "send.failed",
        metadata: {
          sequenceId: freshEmail.sequenceId,
          emailOrder: freshEmail.emailOrder,
          reason: delivery.reason,
          provider: delivery.provider,
        },
      });

      results.push({ id: email.id, state: "failed" });
      continue;
    }

    await prisma.sequenceEmail.update({
      where: { id: email.id },
      data: {
        sendStatus: "sent",
        sentAt: new Date(),
        providerMessageId: delivery.providerMessageId,
        lastDeliveryError: null,
        sendLockId: null,
        sendLockExpiresAt: null,
      },
    });

    const nextEmail = freshEmail.sequence.emails.find((item) => item.emailOrder === freshEmail.emailOrder + 1);

    if (nextEmail && nextEmail.sendStatus !== "canceled" && nextEmail.sendStatus !== "sent") {
      await prisma.sequenceEmail.update({
        where: { id: nextEmail.id },
        data: {
          sendStatus: "queued",
          dueAt: addHours(new Date(), nextEmail.scheduledSendOffsetHours),
          queuedAt: new Date(),
          lastDeliveryError: null,
        },
      });
    }

    await writeAuditEvent({
      organizationId: freshEmail.sequence.organizationId,
      actorId: args.actorId,
      entityType: "sequence_email",
      entityId: email.id,
      action: "send.sent",
      metadata: {
        sequenceId: freshEmail.sequenceId,
        emailOrder: freshEmail.emailOrder,
        provider: delivery.provider,
        providerMessageId: delivery.providerMessageId,
        queuedNextEmailOrder: nextEmail?.emailOrder ?? null,
      },
    });

    results.push({ id: email.id, state: "sent" });
  }

  return results;
}

export async function cancelFutureSequenceEmails(args: {
  sequenceId: string;
  actorId?: string;
  organizationId: string;
  reason: string;
}) {
  const emails = await prisma.sequenceEmail.findMany({
    where: {
      sequenceId: args.sequenceId,
      sendStatus: {
        in: ["approved_pending", "queued", "failed", "draft", "sending"],
      },
    },
  });

  if (!emails.length) {
    return;
  }

  await prisma.sequenceEmail.updateMany({
    where: {
      id: {
        in: emails.map((email) => email.id),
      },
    },
    data: {
      sendStatus: "canceled",
      canceledAt: new Date(),
      sendLockId: null,
      sendLockExpiresAt: null,
      lastDeliveryError: args.reason,
    },
  });

  await writeAuditEvent({
    organizationId: args.organizationId,
    actorId: args.actorId,
    entityType: "sequence",
    entityId: args.sequenceId,
    action: "send.canceled",
    metadata: {
      canceledEmailCount: emails.length,
      reason: args.reason,
    },
  });
}
