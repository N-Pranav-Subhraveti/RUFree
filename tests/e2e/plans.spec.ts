import { test, expect, type Page } from "@playwright/test";
import { Temporal } from "@js-temporal/polyfill";
test.setTimeout(90000);
async function signIn(page: Page, member = "local-alex") {
  await page.goto("/");
  await page.getByLabel("Try the app as").selectOption(member);
  await page.getByRole("button", { name: "Open local workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "My availability." }),
  ).toBeVisible();
}
async function acknowledge(page: Page) {
  await page
    .getByLabel("I acknowledge Busy or Unknown availability when proceeding.")
    .check();
}

test("invite-only plan: last seat, waitlist offer, edit, reconfirm and cancel", async ({
  page,
  browser,
}) => {
  const jamieContext = await browser.newContext();
  const samContext = await browser.newContext();
  const jamie = await jamieContext.newPage();
  const sam = await samContext.newPage();
  try {
    await signIn(jamie, "local-jamie");
    await signIn(sam, "local-sam");
    await signIn(page);
    await page.getByRole("link", { name: "Plans", exact: true }).click();
    await page.getByRole("button", { name: "Create a plan" }).click();
    const title = "Dinner " + Date.now();
    await page.getByLabel("Plan title").fill(title);
    await page.getByLabel("Total places").fill("1");
    await page.getByLabel("I’m attending").uncheck();
    await page.getByLabel("Jamie", { exact: true }).check();
    await page.getByLabel("Sam", { exact: true }).check();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Publish plan" }).click();
    await expect(
      page.getByRole("button", { name: "Cancel plan" }),
    ).toBeVisible();
    const url = page.url();
    await jamie.goto(url);
    await acknowledge(jamie);
    await jamie.getByRole("button", { name: "Join plan", exact: true }).click();
    await expect(
      jamie.getByText("Your status: Confirmed", { exact: true }),
    ).toBeVisible();
    await sam.goto(url);
    await acknowledge(sam);
    await sam.getByRole("button", { name: "Join waitlist" }).click();
    await expect(
      sam.getByText("Your status: Waitlisted", { exact: true }),
    ).toBeVisible();
    await jamie.getByRole("button", { name: "Leave plan" }).click();
    await sam.reload();
    await acknowledge(sam);
    await sam.getByRole("button", { name: "Accept place" }).click();
    await expect(
      sam.getByText("Your status: Confirmed", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Edit plan", exact: true }).click();
    const date = Temporal.Now.zonedDateTimeISO("Asia/Seoul")
      .toPlainDate()
      .add({ days: 5 })
      .toString();
    await page.getByLabel("Starts", { exact: true }).fill(date + "T18:00");
    await page.getByLabel("Ends", { exact: true }).fill(date + "T20:00");
    await page
      .getByLabel(
        "I acknowledge Busy or Unknown participant availability. Material changes require reconfirmation.",
      )
      .check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Plan saved.", { exact: true })).toBeVisible();
    await sam.reload();
    await expect(
      sam.getByText("Your status: Reconfirmation required", { exact: true }),
    ).toBeVisible();
    await acknowledge(sam);
    await sam.getByRole("button", { name: "Reconfirm", exact: true }).click();
    await expect(
      sam.getByText("Your status: Confirmed", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Cancel plan", exact: true })
      .click();
    await expect(
      page.getByText("Cancelled", { exact: true }).first(),
    ).toBeVisible();
    await sam.reload();
    await expect(
      sam.getByText("Your status: Cancelled", { exact: true }),
    ).toBeVisible();
    await expect(
      sam.getByRole("button", { name: "Join plan", exact: true }),
    ).toHaveCount(0);
    await sam.getByRole("link", { name: "Inbox", exact: true }).click();
    await sam.getByRole("button", { name: "Refresh inbox" }).click();
    await expect(
      sam.getByRole("button", { name: "Refresh inbox" }),
    ).toBeEnabled();
    await sam.getByRole("button", { name: "Refresh inbox" }).click();
    await expect(
      sam.getByRole("link", { name: title, exact: true }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/plan-desktop.png",
      fullPage: true,
    });
  } finally {
    await jamieContext.close();
    await samContext.close();
  }
});

test("candidate votes do not reserve places and confirmed candidates require reconfirmation", async ({
  page,
  browser,
}) => {
  const context = await browser.newContext();
  const jamie = await context.newPage();
  try {
    await signIn(jamie, "local-jamie");
    await signIn(page);
    await page.getByRole("link", { name: "Plans", exact: true }).click();
    await page.getByRole("button", { name: "Create a plan" }).click();
    await page.getByLabel("Plan title").fill("A choice of afternoons");
    await page
      .getByRole("combobox", { name: /^Timing/ })
      .selectOption("candidates");
    await page.getByLabel("Jamie", { exact: true }).check();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await acknowledge(page);
    await page.getByRole("button", { name: "Publish plan" }).click();
    await expect(
      page.getByRole("button", { name: "Cancel plan" }),
    ).toBeVisible();
    await jamie.goto(page.url());
    await jamie
      .getByRole("button", { name: "Available (0)", exact: true })
      .first()
      .click();
    await expect(
      jamie.getByText("1 held / 8 total", { exact: true }),
    ).toBeVisible();
    await jamie.getByRole("button", { name: "Join plan", exact: true }).click();
    await expect(
      jamie.getByText("Your status: Interested", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await acknowledge(page);
    await page
      .getByRole("button", { name: "Confirm this time" })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Reconfirm", exact: true }),
    ).toBeVisible();
    await jamie.reload();
    await expect(
      jamie.getByRole("button", { name: "Reconfirm", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Cancel plan", exact: true })
      .click();
    await expect(
      page.getByText("Cancelled", { exact: true }).first(),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("group invitation acceptance and removal revoke a saved plan link", async ({
  page,
  browser,
}) => {
  const context = await browser.newContext();
  const jamie = await context.newPage();
  try {
    await signIn(jamie, "local-jamie");
    await signIn(page);
    await page.getByRole("link", { name: "People & settings" }).click();
    const name = "Friends " + Date.now();
    await page.getByLabel("New group name").fill(name);
    await page
      .getByRole("button", { name: "Create group", exact: true })
      .click();
    const group = page.locator(".group-card").filter({ hasText: name });
    await group.getByLabel("Invite a member").selectOption("local-jamie");
    await group.getByRole("button", { name: "Create invitation" }).click();
    await jamie.getByRole("link", { name: "People & settings" }).click();
    await jamie.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      jamie.locator(".group-card").filter({ hasText: name }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Plans", exact: true }).click();
    await page.getByRole("button", { name: "Create a plan" }).click();
    await page.getByLabel("Plan title").fill("Only for the group");
    await page.getByLabel("Who can see it?").selectOption("group");
    await page
      .getByRole("combobox", { name: /^Group/ })
      .selectOption({ label: name });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await acknowledge(page);
    await page.getByRole("button", { name: "Publish plan" }).click();
    await expect(
      page.getByRole("button", { name: "Cancel plan" }),
    ).toBeVisible();
    const url = page.url();
    await jamie.goto(url);
    await expect(
      jamie.getByRole("heading", { name: "Only for the group" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "People & settings" }).click();
    await page
      .locator(".group-card")
      .filter({ hasText: name })
      .getByRole("button", { name: "Remove member" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Group updated." }),
    ).toBeVisible();
    await jamie.reload();
    await expect(jamie.getByRole("alert")).toHaveText("Plan not found.");
    await page.goto(url);
    await page.getByRole("button", { name: "Cancel plan" }).click();
  } finally {
    await context.close();
  }
});
