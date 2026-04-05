import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Welcome123!");
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function switchUser(page: import("@playwright/test").Page, email: string) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Welcome123!");
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
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

test("sales manager can log in and see dashboard plus bulk approval controls", async ({ page }) => {
  await login(page, "ava.manager@xelera.ai");

  await page.goto("/");
  await expect(page.getByText("Core Flow")).toBeVisible();
  await expect(page.getByText("Lead Lists").first()).toBeVisible();

  await page.getByRole("link", { name: "Lead Lists" }).click();
  await expect(page.getByRole("heading", { name: "Lead lists and batch review readiness" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bulk approve selected" }).first()).toBeVisible();

  await page.getByRole("link", { name: "SaaStr Annual Follow-up" }).click();
  await expect(page.getByRole("heading", { name: "SaaStr Annual Follow-up" })).toBeVisible();
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
