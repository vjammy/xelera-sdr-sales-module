import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
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
