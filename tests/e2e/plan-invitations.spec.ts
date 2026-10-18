import { test, expect } from "@playwright/test";

test("organizer can invite another member after publishing", async ({
  page,
}) => {
  await page.goto("/");
  const headers = { Origin: "http://127.0.0.1:5173" };
  await page.request.post("/api/local-session", {
    headers,
    data: { member: "local-jamie" },
  });
  await page.request.post("/api/local-session", {
    headers,
    data: { member: "local-sam" },
  });
  await page.getByLabel("Try the app as").selectOption("local-alex");
  await page.getByRole("button", { name: "Open local workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "My availability." }),
  ).toBeVisible();
  const response = await page.request.post("/api/plans", {
    headers,
    data: {
      title: "Extra invitations",
      zone: "UTC",
      visibility: "invite",
      groupId: null,
      invitees: [],
      joinPolicy: "immediate",
      capacity: 2,
      organizerAttends: false,
      time: {
        start: new Date(Date.now() + 86400000).toISOString(),
        end: new Date(Date.now() + 90000000).toISOString(),
      },
      candidates: [],
    },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json();
  expect(
    (
      await page.request.post(`/api/plans/${id}/publish`, {
        headers,
        data: { expectedVersion: 1, acknowledge: true },
      })
    ).status(),
  ).toBe(200);
  await page.goto(`/#plans/${id}`);
  await page.getByLabel("Member to invite").selectOption("local-sam");
  await page
    .getByRole("button", { name: "Add invitation", exact: true })
    .click();
  await expect(
    page.getByText("1 of 20 invitations used.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Invitation added");
  await page.reload();
  await expect(
    page.getByText("1 of 20 invitations used.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Jamie", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("checkbox", { name: "Sam", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "Jamie", exact: true }).check();
  await page
    .getByLabel("I acknowledge Busy or Unknown availability when proceeding.")
    .check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("2 of 20 invitations used.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("2 of 20 invitations used.", { exact: false }),
  ).toBeVisible();
});
