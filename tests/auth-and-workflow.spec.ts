import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Welcome123!");
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("sales manager can log in and see dashboard plus bulk approval controls", async ({ page }) => {
  await login(page, "ava.manager@xelera.ai");

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
