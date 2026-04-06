import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

async function countInviteDigestEvents() {
  return db.auditEvent.count({
    where: {
      entityType: "invite_hygiene_digest",
    },
  });
}

async function login(page: Page, email: string, password = "Welcome123!") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 15000 });
}

async function retry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (index < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  throw lastError;
}

async function createPendingInviteForTest(args: {
  email: string;
  name: string;
  title?: string;
  phone?: string;
}) {
  const manager = await db.user.findUnique({
    where: { email: "ava.manager@xelera.ai" },
    select: {
      id: true,
      organizationId: true,
      teamId: true,
    },
  });

  if (!manager) {
    throw new Error("Expected seeded manager account for invite setup.");
  }

  const user = await db.user.create({
    data: {
      organizationId: manager.organizationId,
      teamId: manager.teamId,
      name: args.name,
      email: args.email,
      role: "salesperson",
      title: args.title ?? "SDR",
      phone: args.phone ?? "+1 646-555-0190",
    },
  });

  return db.userInvite.create({
    data: {
      organizationId: manager.organizationId,
      userId: user.id,
      invitedById: manager.id,
      token: `test-invite-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: "pending",
      deliveryState: "manual",
      lastDeliveryAttemptAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    },
  });
}

async function createInviteDigestEventForTest(args: {
  action?: "manual" | "failed" | "sent" | "skipped";
  recipients: Array<{
    email: string;
    deliveryState: "manual" | "failed" | "sent" | "skipped";
    alertCount?: number;
    staleCount?: number;
    expiringSoonCount?: number;
    preference?: string;
  }>;
}) {
  const manager = await db.user.findUnique({
    where: { email: "ava.manager@xelera.ai" },
    select: {
      id: true,
      organizationId: true,
    },
  });

  if (!manager) {
    throw new Error("Expected seeded manager account for digest setup.");
  }

  const recipients = args.recipients.map((recipient) => recipient.email);

  return db.auditEvent.create({
    data: {
      organizationId: manager.organizationId,
      actorId: manager.id,
      entityType: "invite_hygiene_digest",
      entityId: `playwright-digest-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      action: args.action ?? "manual",
      metadata: {
        alertCount: args.recipients.reduce((total, recipient) => total + (recipient.alertCount ?? 1), 0),
        staleCount: args.recipients.reduce((total, recipient) => total + (recipient.staleCount ?? 0), 0),
        expiringSoonCount: args.recipients.reduce((total, recipient) => total + (recipient.expiringSoonCount ?? 0), 0),
        recipients,
        recipientDeliveries: args.recipients.map((recipient) => ({
          email: recipient.email,
          deliveryState: recipient.deliveryState,
          alertCount: recipient.alertCount ?? 1,
          staleCount: recipient.staleCount ?? 0,
          expiringSoonCount: recipient.expiringSoonCount ?? 0,
          preference: recipient.preference ?? "all_alerts",
        })),
      },
    },
  });
}

async function clearProviderVerificationEvents(providerKey: "auth_email" | "outbound_email" | "ai_generation" | "cron_protection") {
  const manager = await db.user.findUnique({
    where: { email: "ava.manager@xelera.ai" },
    select: {
      organizationId: true,
    },
  });

  if (!manager) {
    throw new Error("Expected seeded manager account for provider verification setup.");
  }

  await db.auditEvent.deleteMany({
    where: {
      organizationId: manager.organizationId,
      entityType: "provider_setup_verification",
      entityId: providerKey,
    },
  });
}

async function getLatestPendingInvite(email: string) {
  return db.userInvite.findFirst({
    where: {
      status: "pending",
      user: {
        email,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

async function getSequenceEmailStatusesForLead(leadId: string) {
  const lead = await db.lead.findUnique({
    where: {
      id: leadId,
    },
    include: {
      sequence: {
        include: {
          emails: {
            orderBy: {
              emailOrder: "asc",
            },
          },
        },
      },
    },
  });

  return lead?.sequence?.emails.map((email) => email.sendStatus) ?? [];
}

async function switchUser(page: Page, email: string, password = "Welcome123!") {
  const signOutButton = page.getByRole("button", { name: "Sign out" });
  if (await signOutButton.isVisible().catch(() => false)) {
    await signOutButton.click();
    await page.waitForURL(/\/login/, { timeout: 10_000 }).catch(async () => {
      await page.goto("/login");
    });
  } else {
    await page.goto("/login");
  }
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 15000 });
}

async function createLeadList(
  page: import("@playwright/test").Page,
  uniqueSuffix: string,
  options?: {
    rows?: string[];
  },
) {
  const listName = `Playwright Event List ${uniqueSuffix}`;
  const csv = [
    "First Name,Last Name,Email,Phone,Title,Company,Notes",
    ...(options?.rows ?? [
      `Morgan,Reed,morgan.${uniqueSuffix}@signalworks.io,,VP Revenue Operations,Signal Works,Asked about post-event manager visibility`,
      `Jamie,Stone,jamie.${uniqueSuffix}@signalworks.io,,Director of Sales Ops,Signal Works,Interested in bulk review once trust is built`,
      "No,PhoneOrEmail,,,,No Contact,Missing both email and phone should reject",
      `Duplicate,Lead,morgan.${uniqueSuffix}@signalworks.io,,RevOps Manager,Signal Works,Duplicate email should reject`,
    ]),
  ].join("\n");

  await page.goto("/upload");
  await page.getByLabel("List Name").fill(listName);
  await page.getByLabel("Event or Source").fill("Playwright Summit");
  await page.getByLabel("Event Date").fill("2026-04-05");
  await page.getByLabel("Event City").fill("New York");
  await page.getByLabel("Event Country").fill("USA");
  await page
    .getByLabel("List-level Notes")
    .fill("Use this list to verify validation, research, drafting, and manager bulk approval.");
  await page.getByLabel("Assigned Salesperson").selectOption({ label: "Leo Rep" });
  await page.getByLabel("Upload File").setInputFiles({
    name: `playwright-${uniqueSuffix}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Upload and create list" }).click();
  await expect(page.getByRole("heading", { name: listName })).toBeVisible();

  return listName;
}

async function openLeadDetailFromList(page: import("@playwright/test").Page, listName: string, index = 0) {
  await page.goto("/lists");
  await page.getByRole("link", { name: listName }).click();
  await expect(page.getByRole("heading", { name: listName })).toBeVisible();
  await page.getByRole("link", { name: "Open detail" }).nth(index).click();
}

async function expireLatestInviteForEmail(email: string) {
  const invite = await db.userInvite.findFirst({
    where: {
      status: "pending",
      user: {
        email,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!invite) {
    throw new Error(`Expected a pending invite for ${email}.`);
  }

  await db.userInvite.update({
    where: { id: invite.id },
    data: {
      expiresAt: new Date(Date.now() - 60_000),
    },
  });
}

async function makeLatestInviteExpireSoon(email: string) {
  const invite = await db.userInvite.findFirst({
    where: {
      status: "pending",
      user: {
        email,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!invite) {
    throw new Error(`Expected a pending invite for ${email}.`);
  }

  await retry(() =>
    db.userInvite.update({
      where: { id: invite.id },
      data: {
        expiresAt: new Date(Date.now() + 1000 * 60 * 30),
      },
    }),
  );
}

async function makeLatestInviteStale(email: string) {
  const invite = await db.userInvite.findFirst({
    where: {
      status: "pending",
      user: {
        email,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!invite) {
    throw new Error(`Expected a pending invite for ${email}.`);
  }

  const staleTimestamp = new Date(Date.now() - 1000 * 60 * 60 * 24 * 4);

  await retry(() =>
    db.userInvite.update({
      where: { id: invite.id },
      data: {
        createdAt: staleTimestamp,
        lastDeliveryAttemptAt: staleTimestamp,
      },
    }),
  );
}

test("sales manager can log in and see dashboard plus bulk approval controls", async ({ page }) => {
  await login(page, "ava.manager@xelera.ai");

  await page.goto("/");
  await expect(page.getByText("Core Flow")).toBeVisible();
  await expect(page.getByText("Lead Lists").first()).toBeVisible();

  await page.getByRole("link", { name: "Lead Lists" }).click();
  await expect(page.getByRole("heading", { name: "Lead lists and batch review readiness" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bulk approve selected" }).first()).toBeVisible();

  const firstListLink = page.locator('article a[href^="/lists/"]').first();
  await firstListLink.click();
  await expect(page).toHaveURL(/\/lists\/[^/]+$/);
  await expect(page.getByRole("button", { name: "Run research and drafting" })).toBeVisible();
});

test("salesperson can open the review workflow but does not see manager bulk approval", async ({ page }) => {
  await login(page, "leo.rep@xelera.ai");

  await page.getByRole("link", { name: "Lead Lists" }).click();
  await expect(page.getByRole("heading", { name: "Lead lists and batch review readiness" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bulk approve selected" })).toHaveCount(0);

  await page.getByRole("link", { name: "SaaStr Annual Follow-up" }).click();
  await page.getByRole("link", { name: "Open detail" }).first().click();

  await expect(page.getByRole("heading", { name: "Cora Jensen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve full sequence" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate this email" }).first()).toBeVisible();
});

test("manager can upload a fresh list, see validation results, run drafting, and bulk approve", async ({ page }) => {
  await login(page, "ava.manager@xelera.ai");

  const listName = await createLeadList(page, `${Date.now()}`);

  await expect(page.getByText("Duplicate email appears in the same list.")).toBeVisible();
  await expect(page.getByText("Missing both email and phone.")).toBeVisible();

  await page.getByRole("button", { name: "Run research and drafting" }).click();
  await expect(page.getByRole("link", { name: "Open detail" }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Review Ready").first()).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "Bulk approve selected" }).click();
  await expect(page.getByText("Fully Approved").first()).toBeVisible({ timeout: 10000 });

  await page.goto("/lists");
  await page.getByRole("link", { name: listName }).click();
  await expect(page.getByText("Fully Approved").first()).toBeVisible();
});

test("salesperson can manually edit, regenerate, pause, reject, and approve within the review workflow", async ({
  page,
}) => {
  const listName = `Playwright Review Loop ${Date.now()}`;

  await login(page, "ava.manager@xelera.ai");
  await createLeadList(page, listName.replace(/\s+/g, "-"));
  await page.getByRole("button", { name: "Run research and drafting" }).click();
  await expect(page.getByRole("link", { name: "Open detail" }).first()).toBeVisible({ timeout: 15000 });

  await switchUser(page, "leo.rep@xelera.ai");

  await openLeadDetailFromList(page, `Playwright Event List ${listName.replace(/\s+/g, "-")}`, 0);

  const editedSubject = `Edited subject ${Date.now()}`;
  await page.locator('input[name="subject_1"]').fill(editedSubject);
  await page.getByRole("button", { name: "Save manual edits" }).click();
  await expect(page.locator('input[name="subject_1"]')).toHaveValue(editedSubject);

  const regenerateOnePrompt = "Make email 1 softer and more technical for RevOps.";
  await page.locator('input[name="prompt_1"]').fill(regenerateOnePrompt);
  await page.getByRole("button", { name: "Regenerate this email" }).first().click();
  await expect(page.getByText(`regenerate one · ${regenerateOnePrompt}`)).toBeVisible({ timeout: 10000 });

  const regenerateAllPrompt = "Make all 3 emails shorter, sharper, and more operational.";
  await page.locator('textarea[name="prompt"]').fill(regenerateAllPrompt);
  await page.getByRole("button", { name: "Regenerate all" }).click();
  await expect(page.getByText(`regenerate all · ${regenerateAllPrompt}`)).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused").first()).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Rejected").first()).toBeVisible({ timeout: 10000 });

  await openLeadDetailFromList(page, `Playwright Event List ${listName.replace(/\s+/g, "-")}`, 1);
  await page.getByRole("button", { name: "Approve full sequence" }).click();
  await expect(page.getByText("Approved").first()).toBeVisible({ timeout: 10000 });
});

test("manager can onboard a new organization user through invite activation", async ({ page }) => {
  const suffix = Date.now();
  const email = `new.rep.${suffix}@xelera.ai`;
  const name = `Playwright Rep ${suffix}`;
  const password = `InvitePass!${suffix}`;

  await login(page, "ava.manager@xelera.ai");
  await page.goto("/admin/users");

  await page.getByPlaceholder("Full name").fill(name);
  await page.getByPlaceholder("Work email").fill(email);
  await page.locator('select[name="role"]').selectOption("salesperson");
  await page.getByPlaceholder("Job title").fill("SDR");
  await page.getByPlaceholder("Phone").fill("+1 646-555-0199");
  await page.getByRole("button", { name: "Create activation invite" }).click();

  await expect(page.getByText(email)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(name)).toBeVisible();
  const activationLink = page.locator(`a[data-invite-email="${email}"]`).first();
  const userCard = activationLink.locator("xpath=ancestor::article[1]");
  await expect(userCard).toContainText(/Manual share required\.|Email sent/);
  await userCard.getByRole("button", { name: "Retry invite delivery" }).click();
  await expect(userCard).toContainText(/Manual share required\.|Email sent/);
  await expect(activationLink).toBeVisible();

  const activationUrl = await activationLink.getAttribute("href");
  if (!activationUrl) {
    throw new Error("Expected an activation URL for the newly invited user.");
  }

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/, { timeout: 10_000 }).catch(async () => {
    await page.goto("/login");
  });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Open the operating console" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

  await page.goto(activationUrl);
  await expect(page.getByRole("heading", { name: "Finish your workspace activation." })).toBeVisible();
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(password);
  await page.getByRole("button", { name: "Activate and continue" }).click();
  await expect(page.getByText("Your invite is active. Sign in with your new password.")).toBeVisible({
    timeout: 10000,
  });

  await login(page, email, password);
  await expect(page.getByText("Core Flow")).toBeVisible();
  await page.getByRole("link", { name: "Lead Lists" }).click();
  await expect(page.getByRole("button", { name: "Bulk approve selected" })).toHaveCount(0);
});

test("manager can revoke a pending invite and the activation link stops working", async ({ page }) => {
  const suffix = Date.now();
  const email = `revoked.rep.${suffix}@xelera.ai`;
  const name = `Revoked Rep ${suffix}`;

  await login(page, "ava.manager@xelera.ai");
  await page.goto("/admin/users");

  await page.getByPlaceholder("Full name").fill(name);
  await page.getByPlaceholder("Work email").fill(email);
  await page.locator('select[name="role"]').selectOption("salesperson");
  await page.getByPlaceholder("Job title").fill("SDR");
  await page.getByPlaceholder("Phone").fill("+1 646-555-0188");
  await page.getByRole("button", { name: "Create activation invite" }).click();

  const activationLink = page.locator(`a[data-invite-email="${email}"]`).first();
  const activationUrl = await activationLink.getAttribute("href");
  if (!activationUrl) {
    throw new Error("Expected an activation URL for the pending invite.");
  }

  const userCard = activationLink.locator("xpath=ancestor::article[1]");
  await userCard.getByRole("button", { name: "Revoke invite" }).click();
  await expect(page.locator(`a[data-invite-email="${email}"]`)).toHaveCount(0);

  await page.goto(activationUrl);
  await expect(page.getByRole("heading", { name: "This invite is no longer active" })).toBeVisible();
});

test("manager can create a replacement invite after revocation and the new link activates", async ({ page }) => {
  const suffix = Date.now();
  const email = `replacement.rep.${suffix}@xelera.ai`;
  const name = `Replacement Rep ${suffix}`;
  const password = `RotatePass!${suffix}`;

  await login(page, "ava.manager@xelera.ai");
  await page.goto("/admin/users");

  await page.getByPlaceholder("Full name").fill(name);
  await page.getByPlaceholder("Work email").fill(email);
  await page.locator('select[name="role"]').selectOption("salesperson");
  await page.getByPlaceholder("Job title").fill("SDR");
  await page.getByPlaceholder("Phone").fill("+1 646-555-0177");
  await page.getByRole("button", { name: "Create activation invite" }).click();

  const originalLink = page.locator(`a[data-invite-email="${email}"]`).first();
  const originalUrl = await originalLink.getAttribute("href");
  if (!originalUrl) {
    throw new Error("Expected an original activation URL.");
  }

  const userCard = originalLink.locator("xpath=ancestor::article[1]");
  await userCard.getByRole("button", { name: "Revoke invite" }).click();
  const rotatedCard = page.locator(`[data-user-email="${email}"]`).first();
  await expect(rotatedCard).toContainText("No active invite");
  await rotatedCard.getByRole("button", { name: "Create replacement invite" }).click();

  const replacementLink = page.locator(`a[data-invite-email="${email}"]`).first();
  await expect(replacementLink).toBeVisible();
  const replacementUrl = await replacementLink.getAttribute("href");
  if (!replacementUrl || replacementUrl === originalUrl) {
    throw new Error("Expected a fresh replacement activation URL.");
  }

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/, { timeout: 10_000 }).catch(async () => {
    await page.goto("/login");
  });

  await page.goto(replacementUrl);
  await expect(page.getByRole("heading", { name: "Finish your workspace activation." })).toBeVisible();
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(password);
  await page.getByRole("button", { name: "Activate and continue" }).click();
  await expect(page.getByText("Your invite is active. Sign in with your new password.")).toBeVisible({
    timeout: 10000,
  });

  await login(page, email, password);
  await expect(page.getByText("Core Flow")).toBeVisible();
});

test("manager can rotate an expired invite into a fresh activation link", async ({ page }) => {
  const suffix = Date.now();
  const email = `expired.rep.${suffix}@xelera.ai`;
  const name = `Expired Rep ${suffix}`;
  const password = `ExpiredPass!${suffix}`;

  await login(page, "ava.manager@xelera.ai");
  await page.goto("/admin/users");

  await page.getByPlaceholder("Full name").fill(name);
  await page.getByPlaceholder("Work email").fill(email);
  await page.locator('select[name="role"]').selectOption("salesperson");
  await page.getByPlaceholder("Job title").fill("SDR");
  await page.getByPlaceholder("Phone").fill("+1 646-555-0166");
  await page.getByRole("button", { name: "Create activation invite" }).click();

  const originalLink = page.locator(`a[data-invite-email="${email}"]`).first();
  const originalUrl = await originalLink.getAttribute("href");
  if (!originalUrl) {
    throw new Error("Expected an original activation URL.");
  }

  await expireLatestInviteForEmail(email);
  await page.goto("/admin/users");

  const expiredCard = page.locator(`[data-user-email="${email}"]`).first();
  await expect(expiredCard).toContainText("No active invite");
  await expect(expiredCard).toContainText("Last invite expired");

  await expiredCard.getByRole("button", { name: "Create replacement invite" }).click();

  const replacementLink = page.locator(`a[data-invite-email="${email}"]`).first();
  await expect(replacementLink).toBeVisible({ timeout: 10000 });
  const replacementUrl = await replacementLink.getAttribute("href");
  if (!replacementUrl || replacementUrl === originalUrl) {
    throw new Error("Expected a fresh replacement activation URL after expiry.");
  }

  await page.context().clearCookies();
  await page.goto(originalUrl);
  await expect(page.getByRole("heading", { name: "This invite is no longer active" })).toBeVisible();

  await page.goto(replacementUrl);
  await expect(page.getByRole("heading", { name: "Finish your workspace activation." })).toBeVisible();
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(password);
  await page.getByRole("button", { name: "Activate and continue" }).click();
  await expect(page.getByText("Your invite is active. Sign in with your new password.")).toBeVisible({
    timeout: 10000,
  });

  await login(page, email, password);
  await expect(page.getByText("Core Flow")).toBeVisible();
});

test("manager can proactively rotate an invite that is close to expiry", async ({ page }) => {
  const suffix = Date.now();
  const email = `aging.rep.${suffix}@xelera.ai`;
  const name = `Aging Rep ${suffix}`;
  const password = `AgingPass!${suffix}`;

  await login(page, "ava.manager@xelera.ai");
  await page.goto("/admin/users");

  await page.getByPlaceholder("Full name").fill(name);
  await page.getByPlaceholder("Work email").fill(email);
  await page.locator('select[name="role"]').selectOption("salesperson");
  await page.getByPlaceholder("Job title").fill("SDR");
  await page.getByPlaceholder("Phone").fill("+1 646-555-0155");
  await page.getByRole("button", { name: "Create activation invite" }).click();

  const originalLink = page.locator(`a[data-invite-email="${email}"]`).first();
  const originalUrl = await originalLink.getAttribute("href");
  if (!originalUrl) {
    throw new Error("Expected an original activation URL.");
  }

  await makeLatestInviteExpireSoon(email);
  await page.goto("/admin/users");

  const inviteCard = page.locator(`[data-user-email="${email}"]`).first();
  await expect(inviteCard).toContainText("Expiring soon");
  await inviteCard.getByRole("button", { name: "Rotate invite now" }).click();

  const replacementLink = page.locator(`a[data-invite-email="${email}"]`).first();
  await expect(replacementLink).toBeVisible({ timeout: 10000 });
  await expect
    .poll(async () => await replacementLink.getAttribute("href"))
    .not.toBe(originalUrl);
  const replacementUrl = await replacementLink.getAttribute("href");
  if (!replacementUrl) {
    throw new Error("Expected a fresh replacement activation URL before expiry.");
  }

  await page.context().clearCookies();
  await page.goto(originalUrl);
  await expect(page.getByRole("heading", { name: "This invite is no longer active" })).toBeVisible();

  await page.goto(replacementUrl);
  await expect(page.getByRole("heading", { name: "Finish your workspace activation." })).toBeVisible();
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(password);
  await page.getByRole("button", { name: "Activate and continue" }).click();
  await expect(page.getByText("Your invite is active. Sign in with your new password.")).toBeVisible({
    timeout: 10000,
  });

  await login(page, email, password);
  await expect(page.getByText("Core Flow")).toBeVisible();
});

test("manager dashboard surfaces stale and expiring invite hygiene shortcuts", async ({ page }) => {
  test.setTimeout(90000);
  const suffix = Date.now();
  const staleEmail = `stale.rep.${suffix}@xelera.ai`;
  const staleName = `Stale Rep ${suffix}`;
  const expiringEmail = `expiring.rep.${suffix}@xelera.ai`;
  const expiringName = `Expiring Rep ${suffix}`;

  await login(page, "ava.manager@xelera.ai");
  await createPendingInviteForTest({
    email: staleEmail,
    name: staleName,
    phone: "+1 646-555-0144",
  });
  await createPendingInviteForTest({
    email: expiringEmail,
    name: expiringName,
    phone: "+1 646-555-0145",
  });

  await makeLatestInviteStale(staleEmail);
  await makeLatestInviteExpireSoon(expiringEmail);
  await page.goto("/");

  const hygieneSummary = page.locator("[data-dashboard-invite-hygiene-summary]");
  await expect(hygieneSummary).toBeVisible();
  await expect(hygieneSummary).toContainText("Stale Pending Invites");
  await expect(hygieneSummary).toContainText("Expiring Soon Invites");
  await hygieneSummary.getByRole("link", { name: "Open stale seats" }).click();
  await expect(page).toHaveURL(/\/admin\/users\?attention=stale/);
  await expect(page.locator("[data-user-filter-summary]")).toContainText("stale pending invites");
  await expect(page.locator(`[data-user-email="${staleEmail}"]`)).toBeVisible();
  await expect(page.locator(`[data-user-email="${expiringEmail}"]`)).toHaveCount(0);

  await page.goto("/");
  await page.getByRole("button", { name: "Rotate expiring invites now" }).click();
  await expect
    .poll(async () => {
      const pendingInvite = await getLatestPendingInvite(expiringEmail);
      if (!pendingInvite) {
        return "missing";
      }

      return pendingInvite.expiresAt.getTime() - Date.now() > 1000 * 60 * 60 * 48 ? "rotated" : "expiring";
    })
    .toBe("rotated");
  await page.goto("/admin/users?attention=expiring_soon");
  await expect(page.locator("[data-user-filter-summary]")).toContainText("expiring soon invites");
  await expect(page.locator(`[data-user-email="${expiringEmail}"]`)).toHaveCount(0);
  await expect(page.getByText("No onboarding seats match the current filters.")).toBeVisible();

  await page.goto("/");
  const activityStrip = page.locator("[data-dashboard-invite-activity]");
  await expect(activityStrip).toBeVisible();
  await expect(activityStrip).toContainText(/Rotated \d+ expiring invite/);
  await expect(activityStrip).toContainText("Latest onboarding remediation moves");
  await expect(activityStrip).toContainText("Completed");
  await activityStrip.getByRole("link", { name: "Completed" }).first().click();
  await expect(page).toHaveURL(/\/admin\/users\?attention=expiring_soon/);
  await expect(page.locator("[data-user-filter-summary]")).toContainText("expiring soon invites");

  await page.goto("/");
  await hygieneSummary.getByRole("link", { name: "Review expiring seats" }).click();
  await expect(page).toHaveURL(/\/admin\/users\?attention=expiring_soon/);
  await expect(page.locator("[data-user-filter-summary]")).toContainText("expiring soon invites");
  await expect(page.locator(`[data-user-email="${expiringEmail}"]`)).toHaveCount(0);

  await page.goto("/");
  const callout = page.locator("[data-stale-invite-callout]");
  await expect(callout).toBeVisible();
  await expect(callout).toContainText("Pending seats have gone untouched for several days");
  await expect(callout).toContainText("Open user onboarding");
  await expect(callout.getByRole("link", { name: "Open user onboarding" })).toHaveAttribute("href", "/admin/users");
});

test("manager can queue approved sequences and the outbound worker sends the first email", async ({ page }) => {
  test.setTimeout(90000);
  const suffix = `${Date.now()}-send`;

  await login(page, "ava.manager@xelera.ai");
  await createLeadList(page, suffix);

  await page.getByRole("button", { name: "Run research and drafting" }).click();
  await expect(page.getByRole("link", { name: "Open detail" }).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("link", { name: "Open detail" }).first().click();
  await expect(page).toHaveURL(/\/leads\/[^/]+$/);
  const leadId = page.url().split("/leads/")[1]?.split("?")[0];
  if (!leadId) {
    throw new Error("Expected to open a lead detail URL.");
  }
  await page.getByRole("button", { name: "Approve full sequence" }).click();
  await expect(page.getByText("Approved").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: "Queue approved sequence" })).toBeVisible();
  await page.getByRole("button", { name: "Queue approved sequence" }).click();
  await expect(page.getByText("Queued").first()).toBeVisible({ timeout: 10000 });

  await expect
    .poll(async () => {
      const response = await page.request.get("/api/cron/process-outbound-email", {
        headers: {
          authorization: "Bearer xelera-cron-secret-2026",
        },
      });

      if (!response.ok()) {
        return ["request_failed"];
      }

      return getSequenceEmailStatusesForLead(leadId);
    })
    .toEqual(["sent", "queued", "approved_pending"]);
  await page.reload();
  await expect(page.getByText("Sent").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Queued").first()).toBeVisible({ timeout: 10000 });
});

test("manager can retry a failed outbound email from send operations", async ({ page }) => {
  test.setTimeout(90000);
  const suffix = `${Date.now()}-force-fail`;

  await login(page, "ava.manager@xelera.ai");
  const listName = await createLeadList(page, suffix, {
    rows: [
      `Casey,Failure,casey.force-fail.${suffix}@signalworks.io,,VP Revenue Operations,Signal Works,Use this lead to verify failed outbound retries.`,
      "No,PhoneOrEmail,,,,No Contact,Missing both email and phone should reject",
    ],
  });

  await page.getByRole("button", { name: "Run research and drafting" }).click();
  await expect(page.getByRole("link", { name: "Open detail" }).first()).toBeVisible({ timeout: 15000 });

  await openLeadDetailFromList(page, listName, 0);
  await page.getByRole("button", { name: "Approve full sequence" }).click();
  await expect(page.getByText("Approved").first()).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Queue approved sequence" }).click();
  await expect(page.getByText("Queued").first()).toBeVisible({ timeout: 10000 });

  const firstRun = await page.request.get("/api/cron/process-outbound-email", {
    headers: {
      authorization: "Bearer xelera-cron-secret-2026",
    },
  });

  expect(firstRun.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByText("Failed").first()).toBeVisible({ timeout: 10000 });

  await page.goto("/admin/sends");
  await expect(page.getByText("Casey Failure").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry failed email" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Retry failed email" }).first().click();
  await expect(page.getByText("Queued").first()).toBeVisible({ timeout: 10000 });

  const secondRun = await page.request.get("/api/cron/process-outbound-email", {
    headers: {
      authorization: "Bearer xelera-cron-secret-2026",
    },
  });

  expect(secondRun.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByText("Failed").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Simulated outbound delivery failure.").first()).toBeVisible();
});

test("manager can see provider readiness from send operations", async ({ page }) => {
  await clearProviderVerificationEvents("cron_protection");
  await login(page, "ava.manager@xelera.ai");

  await page.goto("/admin/sends");
  const readiness = page.locator("[data-send-ops-provider-readiness]");
  await expect(readiness).toBeVisible();
  await expect(readiness).toContainText("Auth sign-in email");
  await expect(readiness).toContainText("Outbound email delivery");
  await expect(readiness).toContainText("AI research and drafting");
  await expect(readiness).toContainText("Cron protection");
  await expect(readiness).toContainText("Manual fallback");
  await expect(readiness).toContainText("Mock provider mode");
  await expect(readiness).toContainText("Configured");
  await expect(readiness).toContainText("RESEND_API_KEY");
  await expect(readiness).toContainText("AI_PROVIDER");
  await expect(readiness).toContainText("AI_API_KEY");
  await expect(readiness).toContainText("Needs verification");
  await readiness.getByRole("link", { name: "Open auth email setup" }).click();
  await expect(page).toHaveURL(/\/admin\/setup#auth_email/);
  const setupChecklist = page.locator("[data-admin-setup-checklist]");
  await expect(setupChecklist).toBeVisible();
  await expect(setupChecklist).toContainText("Configure passwordless auth delivery");
  await expect(setupChecklist).toContainText("RESEND_API_KEY");
  await expect(setupChecklist).toContainText("AUTH_FROM_EMAIL");
  await expect(setupChecklist).toContainText("Configure outbound delivery");
  await expect(setupChecklist).toContainText("Configure research and drafting provider");
  await expect(setupChecklist).toContainText("On Hobby, outbound processing is limited to a daily cron schedule");
  await expect(setupChecklist).toContainText("Verify auth email delivery");
  await expect(setupChecklist).toContainText("Verify outbound delivery");
  await expect(setupChecklist).toContainText("Verify AI generation");
  await expect(setupChecklist).toContainText("Verify protected cron behavior");
  await expect(setupChecklist).toContainText("Call the cron route with the configured bearer token");
  const cronVerificationState = page.locator('[data-provider-verification-state="cron_protection"]');
  await expect(cronVerificationState).toContainText("Needs verification");
  await cronVerificationState.getByRole("button", { name: "Mark verified" }).click();
  await expect(cronVerificationState).toContainText("Verified");
  await expect(cronVerificationState).toContainText("Marked verified by Ava Manager");
  await expect(cronVerificationState.getByRole("button", { name: "Reopen verification" })).toBeVisible();

  await page.goto("/");
  const dashboardReadiness = page.locator("[data-dashboard-provider-readiness]");
  await expect(dashboardReadiness).toBeVisible();
  await expect(dashboardReadiness).toContainText("Pilot infrastructure status");
  await expect(dashboardReadiness).toContainText("Mock provider mode");
  await expect(dashboardReadiness).toContainText("RESEND_API_KEY");
  await expect(dashboardReadiness).toContainText("Verified");
  await expect(dashboardReadiness).toContainText("Marked verified by Ava Manager");
  await dashboardReadiness.getByRole("link", { name: "Open AI setup" }).click();
  await expect(page).toHaveURL(/\/admin\/setup#ai_generation/);
  await page.goto("/admin/setup#cron_protection");
  await cronVerificationState.getByRole("button", { name: "Reopen verification" }).click();
  await expect(cronVerificationState).toContainText("Needs recheck");
  await expect(cronVerificationState).toContainText("Verification was reopened by Ava Manager");
  const verificationHistoryPreview = page.locator("[data-provider-verification-history-preview]");
  await expect(verificationHistoryPreview).toContainText("Cron protection");
  await expect(verificationHistoryPreview).toContainText("Reopened");
  await verificationHistoryPreview.getByRole("link", { name: "Cron protection" }).first().click();
  await expect(page).toHaveURL(/\/admin\/setup\/history\?provider=cron_protection&time=7d/);
  await page.goto("/admin/setup#cron_protection");
  await expect(page.locator("[data-setup-reopened-week-link]")).toContainText(/Reopened this week \(\d+\)/);
  await page.locator("[data-setup-reopened-week-link]").click();
  await expect(page).toHaveURL(/\/admin\/setup\/history\?action=reopened&time=7d/);
  await page.goto("/admin/setup#cron_protection");
  await expect(page.locator("[data-setup-my-reopened-week-link]")).toContainText(/My reopened this week \(\d+\)/);
  await page.locator("[data-setup-my-reopened-week-link]").click();
  await expect(page).toHaveURL(/\/admin\/setup\/history\?action=reopened&actor=ava\.manager%40xelera\.ai&time=7d/);
  await page.goto("/admin/setup#cron_protection");
  await expect(page.locator("[data-setup-recent-history-link]")).toContainText(/View recent history \(7d\) \(\d+\)/);
  await page.locator("[data-setup-recent-history-link]").click();
  await expect(page).toHaveURL("/admin/setup/history?time=7d");
  await expect(page.locator("[data-setup-history-page-summary]")).toContainText("Page 1");
  const verificationHistory = page.locator("[data-provider-verification-history]");
  await expect(verificationHistory).toContainText("Cron protection");
  await expect(verificationHistory).toContainText("Verified");
  await expect(verificationHistory).toContainText("Reopened");
  await expect(verificationHistory).toContainText("Ava Manager");
  const setupHistoryPresets = page.locator("[data-setup-history-presets]");
  await expect(setupHistoryPresets).toBeVisible();
  await expect(setupHistoryPresets.locator("[data-setup-history-preset-count]").first()).toBeVisible();
  await setupHistoryPresets.getByRole("link", { name: /^Reopened this week/ }).click();
  await expect(page).toHaveURL(/\/admin\/setup\/history\?action=reopened&time=7d/);
  await expect(page.locator("[data-provider-history-filter-summary]")).toContainText("reopened actions");
  await expect(page.locator("[data-provider-history-filter-summary]")).toContainText("last 7 days");
  await setupHistoryPresets.getByRole("link", { name: /^My reopened this week/ }).click();
  await expect(page).toHaveURL(
    /\/admin\/setup\/history\?action=reopened&actor=ava\.manager%40xelera\.ai&time=7d/,
  );
  await expect(page.locator("[data-provider-history-filter-summary]")).toContainText("Ava Manager");
  await setupHistoryPresets.getByRole("link", { name: "Reopened events" }).click();
  await expect(page).toHaveURL(/\/admin\/setup\/history\?action=reopened/);
  await expect(page.locator("[data-provider-history-filter-summary]")).toContainText("reopened actions");
  const historyFilters = page.locator("[data-provider-history-filters]");
  await expect(historyFilters).toBeVisible();
  await historyFilters.getByRole("link", { name: "Cron protection" }).click();
  await expect(page).toHaveURL(/\/admin\/setup\/history\?provider=cron_protection/);
  await expect(page.locator("[data-provider-history-filter-summary]")).toContainText("Cron protection");
  const verificationEvents = page.locator("[data-provider-verification-events]");
  await expect(verificationEvents).toContainText("Cron protection");
  await expect(verificationEvents).not.toContainText("Auth sign-in email");
  const actionSummary = page.locator("[data-provider-history-action-summary]");
  await expect(actionSummary).toBeVisible();
  await expect(actionSummary).toContainText("Verified");
  await expect(actionSummary).toContainText("Reopened");
  const actionFilters = page.locator("[data-provider-history-action-filters]");
  await expect(actionFilters).toBeVisible();
  await actionSummary.getByRole("link", { name: /Reopened/i }).click();
  await expect(page).toHaveURL(/\/admin\/setup\/history\?provider=cron_protection&action=reopened/);
  await actionFilters.getByRole("link", { name: "Reopened" }).click();
  await expect(page).toHaveURL(/\/admin\/setup\/history\?provider=cron_protection&action=reopened/);
  await expect(page.locator("[data-provider-history-filter-summary]")).toContainText("reopened actions");
  await expect(verificationEvents).toContainText("Reopened");
  await expect(verificationEvents).not.toContainText("Verified");
  const actorFilters = page.locator("[data-provider-history-actor-filters]");
  await expect(actorFilters).toBeVisible();
  await actorFilters.getByRole("link", { name: /Ava Manager/ }).first().click();
  await expect(page).toHaveURL(
    /\/admin\/setup\/history\?provider=cron_protection&action=reopened&actor=ava\.manager%40xelera\.ai/,
  );
  await expect(page.locator("[data-provider-history-filter-summary]")).toContainText("Ava Manager");
  await expect(verificationEvents).toContainText("Ava Manager");
  const timeFilters = page.locator("[data-provider-history-time-filters]");
  await expect(timeFilters).toBeVisible();
  await timeFilters.getByRole("link", { name: "Last 24 hours" }).click();
  await expect(page).toHaveURL(
    /\/admin\/setup\/history\?provider=cron_protection&action=reopened&actor=ava\.manager%40xelera\.ai&time=24h/,
  );
  await expect(page.locator("[data-provider-history-filter-summary]")).toContainText("last 24 hours");
  const sortFilters = page.locator("[data-provider-history-sort-filters]");
  await expect(sortFilters).toBeVisible();
  await sortFilters.getByRole("link", { name: "Oldest first" }).click();
  await expect(page).toHaveURL(
    /\/admin\/setup\/history\?provider=cron_protection&action=reopened&actor=ava\.manager%40xelera\.ai&time=24h&sort=oldest/,
  );
  await expect(page.locator("[data-provider-history-filter-summary]")).toContainText("oldest first");
  const pageSizeFilters = page.locator("[data-provider-history-page-size-filters]");
  await expect(pageSizeFilters).toBeVisible();
  await pageSizeFilters.getByRole("link", { name: "20 per page" }).click();
  await expect(page).toHaveURL(
    /\/admin\/setup\/history\?provider=cron_protection&action=reopened&actor=ava\.manager%40xelera\.ai&time=24h&sort=oldest&pageSize=20/,
  );
  const searchForm = page.locator("[data-provider-history-search]");
  await expect(searchForm).toBeVisible();
  await page.getByPlaceholder("Search actor, provider, or action").fill("Ava");
  await searchForm.getByRole("button", { name: "Apply search" }).click();
  await expect(page).toHaveURL(
    /\/admin\/setup\/history\?provider=cron_protection&action=reopened&actor=ava\.manager%40xelera\.ai&time=24h&sort=oldest&pageSize=20&q=Ava/,
  );
  const activeFilters = page.locator("[data-setup-history-active-filters]");
  await expect(activeFilters).toBeVisible();
  await expect(activeFilters).toContainText("Actor:");
  await expect(activeFilters).toContainText("Search:");
  await expect(page.locator("[data-setup-history-clear-all]")).toBeVisible();
  await activeFilters.getByRole("link", { name: "Remove actor filter" }).click();
  await expect(page).toHaveURL(
    /\/admin\/setup\/history\?provider=cron_protection&action=reopened&time=24h&sort=oldest&pageSize=20&q=Ava/,
  );
  await expect(actorFilters).toBeVisible();
  await actorFilters.getByRole("link", { name: /Ava Manager/ }).first().click();
  await expect(page).toHaveURL(
    /\/admin\/setup\/history\?provider=cron_protection&action=reopened&actor=ava\.manager%40xelera\.ai&time=24h&sort=oldest&pageSize=20&q=Ava/,
  );
  await expect(actionSummary.getByRole("link", { name: /Verified/i })).toContainText("1");
  await expect(actionSummary.getByRole("link", { name: /Reopened/i })).toContainText("1");
  const setupHistoryExportHref = await page.locator("[data-export-setup-history]").getAttribute("href");
  expect(setupHistoryExportHref).toMatch(
    /\/admin\/setup\/history\/export\?provider=cron_protection&action=reopened&actor=ava\.manager%40xelera\.ai&time=24h&sort=oldest&pageSize=20&q=Ava/,
  );
  const setupHistoryFilteredExportHref = await page
    .locator("[data-export-setup-history-filtered]")
    .getAttribute("href");
  expect(setupHistoryFilteredExportHref).toMatch(
    /\/admin\/setup\/history\/export\?provider=cron_protection&action=reopened&actor=ava\.manager%40xelera\.ai&time=24h&sort=oldest&pageSize=20&q=Ava&scope=all/,
  );
  await expect(page.locator("[data-setup-history-share-view]")).toBeVisible();
  await expect(page.locator("[data-setup-history-share-url]")).toHaveValue(
    /\/admin\/setup\/history\?provider=cron_protection&action=reopened&actor=ava\.manager%40xelera\.ai&time=24h&sort=oldest&pageSize=20&q=Ava/,
  );
  const noMatchQuery = `no-match-${Date.now()}`;
  await page.getByPlaceholder("Search actor, provider, or action").fill(noMatchQuery);
  await searchForm.getByRole("button", { name: "Apply search" }).click();
  await expect(page.locator("[data-provider-verification-events]")).toContainText(
    "No provider verification events match the current filters.",
  );
  const emptyActions = page.locator("[data-setup-history-empty-actions]");
  await expect(emptyActions).toBeVisible();
  await emptyActions.getByRole("link", { name: "Reopened this week" }).click();
  await expect(page).toHaveURL(/\/admin\/setup\/history\?action=reopened&time=7d/);
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL("/admin/setup/history");
  const setupHistoryExportResponse = await page.request.get(setupHistoryExportHref ?? "");
  expect(setupHistoryExportResponse.ok()).toBeTruthy();
  expect(setupHistoryExportResponse.headers()["content-type"]).toContain("text/csv");
  const setupHistoryExportBody = await setupHistoryExportResponse.text();
  expect(setupHistoryExportBody).toContain("event_id,provider_key,provider_label,action,actor_name,actor_email,created_at");
  expect(setupHistoryExportBody).toContain("cron_protection");
  expect(setupHistoryExportBody).toContain("reopened");
  expect(setupHistoryExportBody).toContain("ava.manager@xelera.ai");
  const setupHistoryFilteredExportResponse = await page.request.get(setupHistoryFilteredExportHref ?? "");
  expect(setupHistoryFilteredExportResponse.ok()).toBeTruthy();
  expect(setupHistoryFilteredExportResponse.headers()["content-type"]).toContain("text/csv");
});

test("invite hygiene cron endpoint summarizes alerts for managers", async ({ page }) => {
  test.setTimeout(90000);
  const suffix = Date.now();
  const email = `digest.rep.${suffix}@xelera.ai`;
  const name = `Digest Rep ${suffix}`;
  const failedPriorityEmail = `priority.failed.${suffix}@xelera.ai`;
  const manualPriorityEmail = `priority.manual.${suffix}@xelera.ai`;

  await login(page, "ava.manager@xelera.ai");
  await page.goto("/admin/users");

  await page.getByPlaceholder("Full name").fill(name);
  await page.getByPlaceholder("Work email").fill(email);
  await page.locator('select[name="role"]').selectOption("salesperson");
  await page.getByPlaceholder("Job title").fill("SDR");
  await page.getByPlaceholder("Phone").fill("+1 646-555-0133");
  await page.getByRole("button", { name: "Create activation invite" }).click();

  await expect(page.locator(`[data-user-email="${email}"]`).first()).toBeVisible({ timeout: 10000 });
  await makeLatestInviteStale(email);

  const response = await page.request.get("/api/cron/invite-hygiene", {
    headers: {
      authorization: "Bearer xelera-cron-secret-2026",
    },
  });

  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    organizationsProcessed: number;
    results: Array<{
      organizationName: string;
      alertCount: number;
      staleCount: number;
      expiringSoonCount: number;
      recipients: string[];
      deliveryState: string;
    }>;
  };

  expect(payload.organizationsProcessed).toBeGreaterThan(0);
  expect(
    payload.results.some(
      (result) =>
        result.alertCount > 0 &&
        result.staleCount > 0 &&
        result.recipients.includes("ava.manager@xelera.ai"),
    ),
  ).toBeTruthy();

  await page.goto("/settings/profile");
  const history = page.locator("[data-invite-digest-history]");
  await expect(history).toBeVisible();
  await expect(history).toContainText(/Manual fallback|Emailed successfully|Delivery failed/);

  await page.goto("/admin/digests");
  const opsHistory = page.locator("[data-digest-ops-history]");
  await expect(opsHistory).toBeVisible();
  await expect(opsHistory).toContainText("ava.manager@xelera.ai");
  await expect(opsHistory).toContainText(/manual|sent|failed|skipped/i);
  await opsHistory.getByRole("link", { name: "ava.manager@xelera.ai" }).first().click();
  await expect(page).toHaveURL(/\/admin\/digests\/recipient\?email=ava\.manager%40xelera\.ai/);
  await expect(page.getByRole("heading", { name: /Recent invite hygiene deliveries for this recipient/i })).toBeVisible();
  await expect(page.getByText("ava.manager@xelera.ai")).toBeVisible();
  await expect(page.locator("[data-recipient-digest-summary]")).toBeVisible();
  await expect(page.locator("[data-recipient-attention-banner]")).toContainText("Needs repeated attention");
  await page.getByRole("button", { name: "Mark issue reviewed" }).click();
  await expect(page.locator("[data-recipient-reviewed-banner]")).toContainText("Reviewed after repeated issues");
  await expect(page.getByRole("button", { name: "Reopen issue" })).toBeVisible();
  await page.goto("/");
  const reviewedRecipientActivity = page.locator("[data-dashboard-invite-activity]");
  await expect(reviewedRecipientActivity).toContainText(
    /Affected recipients: .*ava\.manager@xelera\.ai.* - Reviewed: ava\.manager@xelera\.ai/,
  );
  await expect(reviewedRecipientActivity).toContainText(/Reviewed: ava\.manager@xelera\.ai \(\d+x (fallback|failed)/);
  await reviewedRecipientActivity
    .getByRole("link", { name: /Reviewed: ava\.manager@xelera\.ai \(\d+x (fallback|failed)/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/digests\/recipient\?email=ava\.manager%40xelera\.ai/);
  await expect(page.locator("[data-recipient-reviewed-banner]")).toContainText("Reviewed after repeated issues");
  await page.getByRole("link", { name: "Back to filtered digest runs" }).click();
  await expect(page).toHaveURL(/\/admin\/digests\?recipient=ava\.manager%40xelera\.ai/);
  await page.goto("/");
  await reviewedRecipientActivity.getByRole("link", { name: "Open retry slice" }).first().click();
  await expect(page).toHaveURL(/\/admin\/digests\?state=manual/);
  await expect(page.locator("[data-digest-ops-history]")).toContainText("Reviewed issue");
  await expect(page.locator("[data-digest-issue-summary]")).toContainText("Reviewed Recipient Issues");
  await page.getByRole("link", { name: /Reviewed Recipient Issues/i }).click();
  await expect(page).toHaveURL(/issue=reviewed/);
  await expect(page.locator("[data-digest-filter-summary]")).toContainText("reviewed issues");
  await page.goto("/admin/digests/recipient?email=ava.manager%40xelera.ai");
  await page.getByRole("button", { name: "Reopen issue" }).click();
  await expect(page.locator("[data-recipient-attention-banner]")).toContainText("Needs repeated attention");
  await expect(page.locator("[data-recipient-digest-history]")).toContainText(
    /Manual fallback|Emailed successfully|Delivery failed|Skipped/,
  );
  const digestCountBeforeRecipientRerun = await countInviteDigestEvents();
  await page.getByRole("button", { name: "Rerun digest for this recipient" }).click();
  await expect
    .poll(async () => await countInviteDigestEvents())
    .toBeGreaterThan(digestCountBeforeRecipientRerun);
  await page.getByRole("link", { name: "Open onboarding seat" }).click();
  await expect(page).toHaveURL(/\/admin\/users\?email=ava\.manager%40xelera\.ai/);
  await expect(page.locator("[data-user-filter-summary]")).toContainText("ava.manager@xelera.ai");
  await expect(page.locator('[data-user-email="ava.manager@xelera.ai"]')).toBeVisible();
  await page.goto("/admin/digests/recipient?email=ava.manager%40xelera.ai");
  await page.getByRole("link", { name: "Back to filtered digest runs" }).click();
  await expect(page).toHaveURL(/\/admin\/digests\?recipient=ava\.manager%40xelera\.ai/);
  await expect(page.locator("[data-digest-ops-history]")).toContainText("Unresolved repeated issue");
  await page.getByRole("link", { name: /Unresolved Recipient Issues/i }).click();
  await expect(page).toHaveURL(/issue=active_issue/);
  await expect(page.locator("[data-digest-filter-summary]")).toContainText("unresolved issues");
  await page.goto("/");
  const dashboardIssueSummary = page.locator("[data-dashboard-digest-issue-summary]");
  await expect(dashboardIssueSummary).toBeVisible();
  await expect(dashboardIssueSummary).toContainText("Unresolved Recipient Issues");
  await expect(dashboardIssueSummary).toContainText("Reviewed Recipient Issues");
  await dashboardIssueSummary.getByRole("link", { name: /Unresolved Recipient Issues/i }).click();
  await expect(page).toHaveURL(/\/admin\/digests\?issue=active_issue/);
  await page.goto("/");
  const recipientActivity = page.locator("[data-dashboard-invite-activity]");
  await expect(recipientActivity).toContainText(/Manual follow-up required|Completed|No action needed/);
  await expect(recipientActivity).toContainText(
    /Affected recipient: ava\.manager@xelera\.ai - (Manual fallback|Delivery failed) - Needs review/,
  );
  await expect(recipientActivity).toContainText(/Needs review: ava\.manager@xelera\.ai \(\d+x (fallback|failed)/);
  await recipientActivity
    .getByRole("link", { name: /Needs review: ava\.manager@xelera\.ai \(\d+x (fallback|failed)/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/digests\/recipient\?email=ava\.manager%40xelera\.ai/);
  await expect(page.locator("[data-recipient-attention-banner]")).toContainText("Needs repeated attention");
  await page.goto("/");
  await recipientActivity.getByRole("link", { name: "Open affected recipient" }).first().click();
  await expect(page).toHaveURL(/\/admin\/digests\/recipient\?email=ava\.manager%40xelera\.ai/);
  await expect(page.locator("[data-recipient-digest-history]")).toContainText(
    /Manual fallback|Emailed successfully|Delivery failed|Skipped/,
  );
  await createPendingInviteForTest({
    email: failedPriorityEmail,
    name: `Priority Failed ${suffix}`,
    phone: "+1 646-555-0101",
  });
  await createPendingInviteForTest({
    email: manualPriorityEmail,
    name: `Priority Manual ${suffix}`,
    phone: "+1 646-555-0102",
  });
  await createInviteDigestEventForTest({
    action: "failed",
    recipients: [
      {
        email: failedPriorityEmail,
        deliveryState: "failed",
        alertCount: 2,
      },
      {
        email: manualPriorityEmail,
        deliveryState: "manual",
        alertCount: 1,
      },
    ],
  });
  await createInviteDigestEventForTest({
    action: "failed",
    recipients: [
      {
        email: failedPriorityEmail,
        deliveryState: "failed",
        alertCount: 2,
      },
      {
        email: manualPriorityEmail,
        deliveryState: "manual",
        alertCount: 1,
      },
    ],
  });
  await page.goto("/");
  const priorityActivityCard = page
    .locator("[data-dashboard-invite-activity] article")
    .filter({ hasText: failedPriorityEmail })
    .first();
  await expect(priorityActivityCard).toContainText(
    new RegExp(`Affected recipients: ${failedPriorityEmail}, ${manualPriorityEmail}`),
  );
  await expect(priorityActivityCard).toContainText("Highest severity: Delivery failed (1 recipient)");
  await priorityActivityCard.getByRole("link", { name: "Highest severity: Delivery failed (1 recipient)" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/digests\\?state=failed&recipient=${encodeURIComponent(failedPriorityEmail)}`));
  await expect(page.locator("[data-digest-filter-summary]")).toContainText("failed");
  await expect(page.locator("[data-digest-filter-summary]")).toContainText(failedPriorityEmail);
  await expect(page.locator("[data-digest-ops-history]")).toContainText(failedPriorityEmail);
  await page.goto("/");
  await expect(priorityActivityCard.getByRole("link", { name: new RegExp(`Needs review: ${failedPriorityEmail}`) })).toBeVisible();
  await expect(priorityActivityCard.getByRole("link", { name: new RegExp(`Needs review: ${manualPriorityEmail}`) })).toBeVisible();
  await expect(priorityActivityCard.getByRole("link", { name: /Needs review:/ }).nth(0)).toContainText(failedPriorityEmail);
  await expect(priorityActivityCard.getByRole("link", { name: /Needs review:/ }).nth(1)).toContainText(manualPriorityEmail);

  const digestCountBeforeManualRun = await countInviteDigestEvents();
  await page.goto("/admin/digests?issue=active_issue");
  await page.getByRole("button", { name: "Run digest now" }).click();
  await expect
    .poll(async () => await countInviteDigestEvents())
    .toBeGreaterThan(digestCountBeforeManualRun);

  const digestCountBeforeTargetedRetry = await countInviteDigestEvents();
  await page.getByRole("button", { name: "Retry manual and failed recipients" }).first().click();
  await expect
    .poll(async () => await countInviteDigestEvents())
    .toBeGreaterThan(digestCountBeforeTargetedRetry);
  await expect(opsHistory).toContainText("Retry attempted");
  await expect(opsHistory).toContainText(/Still needs attention|Recovered on retry|Skipped on retry/);

  await page.goto("/admin/digests?state=retry&recipient=ava.manager@xelera.ai");
  await expect(page.locator("[data-digest-filter-summary]")).toContainText("targeted retries");
  const filteredHistory = page.locator("[data-digest-ops-history]");
  await expect(filteredHistory).toContainText("Retry attempted");
  await expect(filteredHistory).toContainText("ava.manager@xelera.ai");
  await expect(filteredHistory).not.toContainText("Digest emailed");
  await expect(page.locator("[data-share-view-panel]")).toBeVisible();
  await expect(page.locator("[data-share-view-url]")).toHaveValue(
    /\/admin\/digests\?state=retry&recipient=ava\.manager%40xelera\.ai$/,
  );
  const exportHref = await page.locator("[data-export-digest-view]").getAttribute("href");
  expect(exportHref).toMatch(/\/admin\/digests\/export\?state=retry&recipient=ava\.manager%40xelera\.ai/);
  const exportResponse = await page.request.get(exportHref ?? "");
  expect(exportResponse.ok()).toBeTruthy();
  expect(exportResponse.headers()["content-type"]).toContain("text/csv");
  const exportBody = await exportResponse.text();
  expect(exportBody).toContain("run_id,run_created_at,run_action");
  expect(exportBody).toContain("ava.manager@xelera.ai");
  expect(exportBody).toContain("retry");

  for (let index = 0; index < 4; index += 1) {
    const digestCountBeforeExtraRun = await countInviteDigestEvents();
    await page.goto("/admin/digests");
    await page.getByRole("button", { name: "Run digest now" }).click();
    await expect
      .poll(async () => await countInviteDigestEvents())
      .toBeGreaterThan(digestCountBeforeExtraRun);
  }

  await page.goto("/admin/digests?page=2");
  await expect(page.locator("[data-digest-page-summary]")).toContainText("Page 2");
  await expect(page.locator("[data-digest-pagination]")).toBeVisible();
  await expect(page.getByRole("link", { name: "Newer runs" })).toBeVisible();

  await page.goto("/");
  const dashboardActivity = page.locator("[data-dashboard-invite-activity]");
  await expect(dashboardActivity).toBeVisible();
  await expect(dashboardActivity).toContainText(/Manual follow-up required|No action needed|Completed/);
  await dashboardActivity.getByRole("link", { name: "Open retry slice" }).first().click();
  await expect(page).toHaveURL(/\/admin\/digests\?state=manual/);
  await expect(page.locator("[data-digest-filter-summary]")).toContainText("manual");

  await page.goto("/admin/digests");
  const presets = page.locator("[data-digest-presets]");
  await expect(presets).toBeVisible();
  await page.getByRole("link", { name: "Targeted retries" }).click();
  await expect(page).toHaveURL(/state=retry/);
  await expect(page.locator("[data-digest-filter-summary]")).toContainText("targeted retries");
  await expect(page.locator("[data-digest-ops-history]")).toContainText("Retry attempted");
  await expect(page.locator("[data-share-view-url]")).toHaveValue(/\/admin\/digests\?state=retry$/);
});

test("manager can limit invite digests to stale alerts only", async ({ page }) => {
  const staleSuffix = `${Date.now()}-stale`;
  const expiringSuffix = `${Date.now()}-expiring`;
  const staleEmail = `digest.stale.${staleSuffix}@xelera.ai`;
  const expiringEmail = `digest.expiring.${expiringSuffix}@xelera.ai`;

  await login(page, "ava.manager@xelera.ai");
  await page.goto("/settings/profile");
  await page.locator('select[name="inviteDigestPreference"]').selectOption("stale_only");
  await page.getByRole("button", { name: "Save profile settings" }).click();
  await expect(page.locator('select[name="inviteDigestPreference"]')).toHaveValue("stale_only");

  await page.goto("/admin/users");

  await page.getByPlaceholder("Full name").fill(`Digest Stale ${staleSuffix}`);
  await page.getByPlaceholder("Work email").fill(staleEmail);
  await page.locator('select[name="role"]').selectOption("salesperson");
  await page.getByPlaceholder("Job title").fill("SDR");
  await page.getByPlaceholder("Phone").fill("+1 646-555-0122");
  await page.getByRole("button", { name: "Create activation invite" }).click();
  await expect(page.locator(`[data-user-email="${staleEmail}"]`).first()).toBeVisible({ timeout: 10000 });

  await page.getByPlaceholder("Full name").fill(`Digest Expiring ${expiringSuffix}`);
  await page.getByPlaceholder("Work email").fill(expiringEmail);
  await page.locator('select[name="role"]').selectOption("salesperson");
  await page.getByPlaceholder("Job title").fill("SDR");
  await page.getByPlaceholder("Phone").fill("+1 646-555-0111");
  await page.getByRole("button", { name: "Create activation invite" }).click();
  await expect(page.locator(`[data-user-email="${expiringEmail}"]`).first()).toBeVisible({ timeout: 10000 });

  await makeLatestInviteStale(staleEmail);
  await makeLatestInviteExpireSoon(expiringEmail);

  const response = await page.request.get("/api/cron/invite-hygiene", {
    headers: {
      authorization: "Bearer xelera-cron-secret-2026",
    },
  });

  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    results: Array<{
      recipientDeliveries: Array<{
        email: string;
        deliveryState: string;
        alertCount: number;
        staleCount: number;
        expiringSoonCount: number;
        preference: string;
      }>;
    }>;
  };

  const managerDelivery = payload.results
    .flatMap((result) => result.recipientDeliveries)
    .find((delivery) => delivery.email === "ava.manager@xelera.ai");

  expect(managerDelivery).toBeDefined();
  expect(managerDelivery?.preference).toBe("stale_only");
  expect(managerDelivery?.staleCount).toBeGreaterThan(0);
  expect(managerDelivery?.expiringSoonCount).toBe(0);
  expect(managerDelivery?.alertCount).toBe(managerDelivery?.staleCount);

  await page.goto("/settings/profile");
  await page.locator('select[name="inviteDigestPreference"]').selectOption("all_alerts");
  await page.getByRole("button", { name: "Save profile settings" }).click();
  await expect(page.locator('select[name="inviteDigestPreference"]')).toHaveValue("all_alerts");
});
