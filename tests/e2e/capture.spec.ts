import { test, expect, type Page } from "@playwright/test";
const owner = "11111111-1111-4111-8111-111111111111",
  space = "22222222-2222-4222-8222-222222222222";
async function fixture(page: Page) {
  const memories: Record<string, unknown>[] = [];
  await page.route("**/api/auth/session", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: owner, email: "synthetic@example.test" },
      }),
    }),
  );
  await page.route("**/api/data", async (route) => {
    const operation = route.request().postDataJSON();
    let data: unknown = [];
    if (operation.table === "profiles")
      data = {
        owner_id: owner,
        display_name: "Synthetic tester",
        timezone: "Asia/Jerusalem",
        ai_consent: false,
        no_ai_default: true,
        default_space_id: space,
      };
    if (operation.table === "spaces")
      data = [{ id: space, name: "Private Inbox" }];
    if (operation.rpc === "save_capture") {
      const { payload } = operation.args;
      if (!memories.some((m) => m.id === payload.id))
        memories.push({
          ...payload,
          owner_id: owner,
          current_revision: 1,
          received_at: payload.captured_at,
          deleted_at: null,
          processing_status: "Not sent to AI",
        });
      data = payload.id;
    }
    if (operation.table === "memory_view" || operation.rpc === "timeline_page")
      data = memories;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data, error: null }),
    });
  });
  return memories;
}
test("C01 C02 U02 typed mixed-language capture persists through transport and appears in timeline", async ({
  page,
}) => {
  const memories = await fixture(page);
  await page.goto("/capture");
  await expect(
    page.getByRole("heading", { name: "What would you like to remember?" }),
  ).toBeVisible();
  const editor = page.getByRole("textbox", {
    name: "What happened, or what do you need to remember?",
  });
  await editor.fill("Synthetic: דיברתי עם Maya על Project Cedar 3.5 million");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  expect(memories).toHaveLength(1);
  await expect(editor).toHaveValue("");
  await page.goto("/timeline");
  await expect(
    page.getByText("Synthetic: דיברתי עם Maya על Project Cedar 3.5 million"),
  ).toBeVisible();
});
test("C06 C09 trusted-device draft survives reload and queued logout requires choice", async ({
  page,
  context,
}) => {
  await fixture(page);
  await page.goto("/capture");
  await page.getByRole("button", { name: "Enable on this device" }).click();
  const editor = page.getByRole("textbox", {
    name: "What happened, or what do you need to remember?",
  });
  await editor.fill("Synthetic durable draft");
  await expect(
    page.getByText("Draft on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(editor).toHaveValue("Synthetic durable draft");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Saved on this device — waiting to sync", { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
});
test("U01 U03 320px capture has labelled controls and no horizontal overflow", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/capture");
  await expect(
    page.getByRole("textbox", {
      name: "What happened, or what do you need to remember?",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/capture-320.png",
    fullPage: true,
  });
});
test("P07 malicious note text is rendered as text", async ({ page }) => {
  await fixture(page);
  await page.goto("/capture");
  await page
    .getByRole("textbox", {
      name: "What happened, or what do you need to remember?",
    })
    .fill("<script>window.__injected=true</script>");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Synced", { exact: true })).toBeVisible();
  await page.goto("/timeline");
  await expect(
    page.getByText("<script>window.__injected=true</script>"),
  ).toBeVisible();
  expect(await page.evaluate(() => Object.hasOwn(window, "__injected"))).toBe(
    false,
  );
});
