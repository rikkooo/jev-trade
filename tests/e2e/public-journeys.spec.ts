import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("blind stock journey hides the call until reveal", async ({ page }) => {
  await page.goto("/stocks/acme");
  await expect(
    page.getByRole("heading", { name: "ACME", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("UP leads the distribution")).toHaveCount(0);
  await expect(page.getByText("62%")).toHaveCount(0);
  await expect(page.getByText("CODE-OWNED POLICY ACTION")).toHaveCount(0);

  await page.getByRole("button", { name: /pick down/i }).click();
  await expect(page.locator(".pick-lock")).toContainText("DOWN");
  await page.getByRole("button", { name: /reveal Jev/i }).click();

  await expect(
    page.getByRole("heading", { name: /UP leads the distribution/i }),
  ).toBeVisible();
  await expect(page.getByText("62%", { exact: true })).toBeVisible();
  await expect(page.getByText("CODE-OWNED POLICY ACTION")).toBeVisible();
  await expect(page.getByText("JEV JUDGMENT", { exact: true })).toBeVisible();
  await expect(
    page.getByText("DETERMINISTIC MARKET RISK", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("DETERMINISTIC POSITION RISK", { exact: true }),
  ).toBeVisible();
});

test("blind forecast has no directly addressable audit or share page", async ({
  page,
}) => {
  for (const path of [
    "/forecasts/01K5D3JEVACME5SPRINT0001",
    "/forecasts/01K5D3JEVACME5SPRINT0001/share",
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByText("UP leads the distribution")).toHaveCount(0);
    await expect(page.getByText("62%")).toHaveCount(0);
  }
});

test("production artifact sends hardened browser headers", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).not.toContain("'unsafe-eval'");
  expect(headers["strict-transport-security"]).toContain("max-age=31536000");
});

test("reveals without a pick and keeps analytics optional", async ({
  page,
}) => {
  await page.goto("/stocks/acme");
  await page.getByRole("button", { name: /decline analytics/i }).click();
  await expect(page.getByText(/Analytics are off/i)).toBeVisible();
  await page.getByRole("button", { name: /reveal without playing/i }).click();
  await expect(
    page.getByRole("heading", { name: /UP leads the distribution/i }),
  ).toBeVisible();
  const storage = await page.evaluate(() => ({
    consent: localStorage.getItem("jev-trade.analytics.consent.v1"),
    analyticsId: localStorage.getItem("jev-trade.analytics.id.v1"),
    pick: localStorage.getItem("jev-trade.pick.01K5D3JEVACME5SPRINT0001"),
  }));
  expect(storage).toEqual({
    consent: "declined",
    analyticsId: null,
    pick: null,
  });
});

test("resolved audit and zero-sample scorecard preserve evidence limits", async ({
  page,
}) => {
  await page.goto("/forecasts/01K4MESA1SPRINTRES00001");
  await expect(page.getByText("Frozen synthetic record")).toBeVisible();
  await expect(
    page
      .locator(".outcome-panel")
      .getByRole("heading", { name: "FLAT", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/FIXTURE — NOT SCORED/)).toBeVisible();

  await page.goto("/scorecard");
  await expect(
    page.getByRole("heading", { name: /ready for evidence/i }),
  ).toBeVisible();
  await expect(page.getByText("No prospective sample yet")).toBeVisible();
  await expect(
    page
      .locator(".scorecard-kpis article")
      .filter({ hasText: "Eligible forecasts" }),
  ).toContainText("0");
});

test("operator mutation controls fail closed", async ({ page }) => {
  await page.goto("/operator");
  await expect(page.getByText("Mutation controls locked")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Change allowlist" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Replay failed job" }),
  ).toBeDisabled();
});

test("mobile workspace has semantic navigation and no page overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile viewport assertion");
  await page.goto("/stocks/acme");
  await expect(
    page.getByRole("navigation", { name: "Mobile primary" }),
  ).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();
});
