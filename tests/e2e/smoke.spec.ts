import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Temporal } from "@js-temporal/polyfill";
const tomorrow = Temporal.Now.zonedDateTimeISO("Asia/Seoul")
  .toPlainDate()
  .add({ days: 1 })
  .toString();

test("signed out page, private policy and health", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Good things/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open local workspace" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your time stays yours." }),
  ).toBeVisible();
});

test("manual entry, persistence, editing, recurring rule, matching and deletion", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open local workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "My availability." }),
  ).toBeVisible();
  const label = `Evening ${Date.now()}`;
  await page
    .getByRole("button", { name: "Add availability", exact: false })
    .click();
  await page.getByLabel("Private label").fill(label);
  await page.getByLabel("Start date", { exact: true }).fill(tomorrow);
  await page.getByLabel("End date", { exact: true }).fill(tomorrow);
  await page
    .getByRole("button", { name: "Save availability", exact: true })
    .click();
  await expect(page.getByText(label, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(label, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: `Edit ${label}`, exact: true })
    .click();
  await page.getByLabel("End time", { exact: true }).fill("22:00");
  await page
    .getByRole("button", { name: "Save availability", exact: true })
    .click();
  await page.getByRole("button", { name: "Set a routine" }).click();
  await page
    .getByRole("button", { name: "Save availability", exact: true })
    .click();
  await expect(page.getByText("1 weekly rule", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await expect(page.locator(".month-tile")).toHaveCount(12);
  await page.locator(".month-tile").first().click();
  await expect(
    page.getByRole("button", { name: "Month", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Find a time" }).click();
  await page.getByRole("button", { name: "Find a time" }).click();
  await expect(page.locator(".match-card").first()).toBeVisible();
  await expect(page.locator(".match-card").first()).toContainText(
    "Everyone available",
  );
  await page.getByRole("button", { name: "Recheck time" }).first().click();
  await expect(page.getByRole("status")).toContainText("Rechecked: everyone");
  await page
    .getByRole("link", { name: "Make a plan", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Plan title")).toBeVisible();
  await expect(page.getByLabel("Starts", { exact: true })).not.toHaveValue("");
  await page.getByLabel("Plan title").fill("From a matching suggestion");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "From a matching suggestion",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "My availability" }).click();
  await page
    .getByRole("button", { name: `Delete ${label}`, exact: true })
    .click();
  await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  await page
    .locator(".bottom-grid")
    .getByRole("button", { name: "Delete", exact: true })
    .last()
    .click();
  await expect(page.getByText("0 weekly rules", { exact: true })).toBeVisible();
});

test("keyboard sign-in, mobile layout and accessibility for enabled screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open local workspace" }),
  ).toBeVisible();
  const audit = async () => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const failures = results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    }));
    expect(failures).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  };
  await audit();
  await page.getByRole("button", { name: "Open local workspace" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "My availability." }),
  ).toBeVisible();
  await expect(page.locator(".day-column")).toHaveCount(7);
  await audit();
  await page
    .getByRole("button", { name: "Add availability", exact: false })
    .click();
  await audit();
  await page.getByRole("link", { name: "Find a time" }).click();
  await audit();
  await page.getByRole("link", { name: "Plans", exact: true }).click();
  await audit();
  await page.getByRole("button", { name: "Create a plan" }).click();
  await audit();
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await audit();
  await page.getByRole("link", { name: "People & settings" }).click();
  await audit();
  await page.screenshot({
    path: "test-results/settings-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "My availability" }).click();
  await expect(page.locator(".day-column")).toHaveCount(7);
  await page.screenshot({
    path: "test-results/availability-desktop.png",
    fullPage: true,
  });
  await audit();
});

test("sharing settings update the eligible people list and revoke access", async ({
  page,
  browser,
}) => {
  const jamieContext = await browser.newContext();
  const jamie = await jamieContext.newPage();
  try {
    await jamie.goto("/");
    await jamie.getByLabel("Try the app as").selectOption("local-jamie");
    await jamie.getByRole("button", { name: "Open local workspace" }).click();
    await expect(
      jamie.getByRole("heading", { name: "My availability." }),
    ).toBeVisible();
    await page.goto("/");
    await page.getByRole("button", { name: "Open local workspace" }).click();
    await page.getByRole("link", { name: "People & settings" }).click();
    const sharingRow = page
      .locator(".bottom-grid .person-row")
      .filter({ hasText: "Jamie" });
    await sharingRow
      .getByRole("button", { name: "Share", exact: true })
      .click();
    await expect(
      sharingRow.getByRole("button", { name: "Revoke", exact: true }),
    ).toBeVisible();
    await jamie.getByRole("link", { name: "Find a time" }).click();
    await expect(
      jamie.getByRole("checkbox", { name: "A Alex", exact: true }),
    ).toBeVisible();
    await sharingRow
      .getByRole("button", { name: "Revoke", exact: true })
      .click();
    await expect(
      sharingRow.getByRole("button", { name: "Share", exact: true }),
    ).toBeVisible();
    await jamie.reload();
    await expect(jamie.getByRole("checkbox", { name: /Jamie/ })).toBeVisible();
    await expect(
      jamie.getByRole("checkbox", { name: "A Alex", exact: true }),
    ).toHaveCount(0);
  } finally {
    await jamieContext.close();
  }
});

test("cancelling a twelve-month search ignores a late availability response", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open local workspace" }).click();
  await page.getByRole("link", { name: "Find a time" }).click();
  await expect(page.getByRole("checkbox", { name: /Alex/ })).toBeVisible();
  await page
    .getByLabel("Until (exclusive)")
    .fill(
      Temporal.Now.zonedDateTimeISO("Asia/Seoul")
        .toPlainDate()
        .add({ months: 12 })
        .toString(),
    );
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/availability?*", async (route) => {
    await held;
    await route.continue();
  });
  await page.getByRole("button", { name: "Find a time" }).click();
  await page.getByRole("button", { name: "Cancel search" }).click();
  const arrived = page.waitForResponse((response) =>
    response.url().includes("/api/availability?"),
  );
  release();
  await arrived;
  await expect(page.getByRole("status")).toHaveText("Search cancelled.");
  await expect(page.locator(".match-card")).toHaveCount(0);
});
