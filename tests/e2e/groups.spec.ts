import { test, expect } from "@playwright/test";

test("group owner can rename and confirm or cancel deletion", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Try the app as").selectOption("local-alex");
  await page.getByRole("button", { name: "Open local workspace" }).click();
  await page.getByRole("link", { name: "People & settings" }).click();
  const name = "Manage group " + Date.now();
  await page.getByLabel("New group name").fill(name);
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  const card = page
    .locator("article.group-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await card.getByLabel("Group name", { exact: true }).fill(name + " renamed");
  await card.getByRole("button", { name: "Rename group" }).click();
  const renamed = page
    .locator("article.group-card")
    .filter({
      has: page.getByRole("heading", { name: name + " renamed", exact: true }),
    });
  await expect(renamed).toBeVisible();
  await page.reload();
  await renamed
    .getByRole("button", { name: "Delete group", exact: true })
    .click();
  await renamed.getByRole("button", { name: "Keep group" }).click();
  await expect(renamed).toBeVisible();
  await renamed
    .getByRole("button", { name: "Delete group", exact: true })
    .click();
  await renamed.getByRole("button", { name: "Confirm delete group" }).click();
  await expect(renamed).toHaveCount(0);
  await page.reload();
  await expect(renamed).toHaveCount(0);
});
