import { test, expect } from "@playwright/test";
test.use({ serviceWorkers: "allow" });
test.skip(
  ({ browserName }) =>
    browserName === "webkit" &&
    process.platform === "win32" &&
    !process.env.FORCE_WEBKIT_OFFLINE,
  "Windows WebKit repeatedly aborts offline navigation with an internal error; see TEST_RESULTS. Set FORCE_WEBKIT_OFFLINE=1 to reproduce. This release gate remains open.",
);
test("C10 public app shell can reopen offline without exposing private page data", async ({
  page,
  context,
}) => {
  await page.goto("/capture");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(
    page.getByText("First-time offline use needs online account setup."),
  ).toBeVisible();
  await context.setOffline(false);
});
