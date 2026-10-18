import { expect, test } from "@playwright/test";

test("worldwide zones persist in profiles and plans without rewriting existing availability", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open local workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "My availability." }),
  ).toBeVisible();
  const start = new Date(Date.now() + 3 * 86400000).toISOString();
  const end = new Date(Date.now() + 3 * 86400000 + 3600000).toISOString();
  const saved = await page.request.post("/api/availability/entries", {
    headers: { Origin: "http://127.0.0.1:5173" },
    data: {
      start,
      end,
      zone: "Asia/Seoul",
      state: "Available",
      label: "Zone stability",
    },
  });
  expect(saved.ok()).toBeTruthy();
  await page.getByRole("link", { name: "People & settings" }).click();
  const zones = await page
    .locator("datalist option")
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
  expect(zones.length).toBeGreaterThan(400);
  for (const zone of [
    "Africa/Nairobi",
    "America/Sao_Paulo",
    "Asia/Kathmandu",
    "Australia/Adelaide",
    "Europe/London",
    "Pacific/Chatham",
    "UTC",
  ])
    expect(zones).toContain(zone);
  await page.getByLabel("IANA time zone").fill("Asia/Kathmandu");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");
  await page.reload();
  await expect(page.getByLabel("IANA time zone")).toHaveValue("Asia/Kathmandu");
  const after = await page.request.get(
    `/api/availability?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
  );
  expect(await after.json()).toMatchObject({
    entries: expect.arrayContaining([
      expect.objectContaining({ start, end, zone: "Asia/Seoul" }),
    ]),
  });
  await page.getByRole("link", { name: "Plans", exact: true }).click();
  await page.getByRole("button", { name: "Create a plan" }).click();
  await page.getByLabel("Plan title").fill("Worldwide planning");
  await expect(page.getByLabel("Plan time zone")).toHaveValue("Asia/Kathmandu");
  await page.getByLabel("Plan time zone").fill("Pacific/Chatham");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Reference zone: Pacific/Chatham")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Reference zone: Pacific/Chatham")).toBeVisible();
  // Keep the shared synthetic profile in its original zone for subsequent runs.
  await page.request.put("/api/profile", {
    headers: { Origin: "http://127.0.0.1:5173" },
    data: { name: "Alex", zone: "Asia/Seoul" },
  });
});
