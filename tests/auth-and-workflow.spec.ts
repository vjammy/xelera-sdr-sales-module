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

async function switchUser(page: Page, email: string, password = "Welcome123!") {
  const signOutButton = page.getByRole("button", { name: "Sign out" });
  if (await signOutButton.isVisible().catch(() => false)) {
    await signOutButton.click();
    await expect(page).toHaveURL(/\/login/);
  } else {
    await page.goto("/login");
  }
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 15000 });
}

async function createLeadList(page: import("@playwright/test").Page, uniqueSuffix: string) {
  const listName = `Playwright Event List ${uniqueSuffix}`;
  const csv = [
    "First Name,Last Name,Email,Phone,Title,Company,Notes",
    `Morgan,Reed,morgan.${uniqueSuffix}@signalworks.io,,VP Revenue Operations,Signal Works,Asked about post-event manager visibility`,
    `Jamie,Stone,jamie.${uniqueSuffix}@signalworks.io,,Director of Sales Ops,Signal Works,Interested in bulk review once trust is built`,
    "No,PhoneOrEmail,,,,No Contact,Missing both email and phone should reject",
    `Duplicate,Lead,morgan.${uniqueSuffix}@signalworks.io,,RevOps Manager,Signal Works,Duplicate email should reject`,
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

  await db.userInvite.update({
    where: { id: invite.id },
    data: {
      expiresAt: new Date(Date.now() + 1000 * 60 * 30),
    },
  });
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

  await db.userInvite.update({
    where: { id: invite.id },
    data: {
      createdAt: staleTimestamp,
      lastDeliveryAttemptAt: staleTimestamp,
    },
  });
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
  await expect(page).toHaveURL(/\/login/);
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
  await expect(page).toHaveURL(/\/login/);

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

test("manager dashboard flags pending invites that have gone stale", async ({ page }) => {
  const suffix = Date.now();
  const email = `stale.rep.${suffix}@xelera.ai`;
  const name = `Stale Rep ${suffix}`;

  await login(page, "ava.manager@xelera.ai");
  await page.goto("/admin/users");

  await page.getByPlaceholder("Full name").fill(name);
  await page.getByPlaceholder("Work email").fill(email);
  await page.locator('select[name="role"]').selectOption("salesperson");
  await page.getByPlaceholder("Job title").fill("SDR");
  await page.getByPlaceholder("Phone").fill("+1 646-555-0144");
  await page.getByRole("button", { name: "Create activation invite" }).click();

  await expect(page.locator(`[data-user-email="${email}"]`).first()).toBeVisible({ timeout: 10000 });
  await makeLatestInviteStale(email);
  await page.goto("/");

  const callout = page.locator("[data-stale-invite-callout]");
  await expect(callout).toBeVisible();
  await expect(callout).toContainText("Pending seats have gone untouched for several days");
  await expect(callout).toContainText("Open user onboarding");
  await expect(page.getByRole("link", { name: "Open user onboarding" })).toBeVisible();
});

test("invite hygiene cron endpoint summarizes alerts for managers", async ({ page }) => {
  test.setTimeout(90000);
  const suffix = Date.now();
  const email = `digest.rep.${suffix}@xelera.ai`;
  const name = `Digest Rep ${suffix}`;

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
  await page.getByRole("link", { name: "Back to filtered digest runs" }).click();
  await expect(page).toHaveURL(/\/admin\/digests\?recipient=ava\.manager%40xelera\.ai/);
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

  const digestCountBeforeManualRun = await countInviteDigestEvents();
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
