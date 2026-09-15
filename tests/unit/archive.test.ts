import { it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { createArchive, inspectArchive } from "../../lib/export/archive";
import { validateFile } from "../../lib/security/files";
it("X01 X02 preserves Hebrew text, revisions, policy and attachment bytes", async () => {
  const id = crypto.randomUUID();
  const data = {
    captures: [
      {
        id,
        current_revision: 1,
        no_ai: true,
        captured_at: "2026-09-15T09:00:00Z",
      },
    ],
    revisions: [
      {
        id: crypto.randomUUID(),
        capture_id: id,
        number: 1,
        text: "שלום Maya 3.5 million",
      },
    ],
    attachments: [{ id: "attachment" }],
  };
  const bytes = await createArchive(data, {
    "attachments/attachment": strToU8("original bytes"),
  });
  const parsed = await inspectArchive(bytes);
  expect(parsed.data.revisions[0].text).toBe("שלום Maya 3.5 million");
  expect(parsed.data.captures[0].no_ai).toBe(true);
  expect(parsed.files["attachments/attachment"]).toEqual(
    strToU8("original bytes"),
  );
});
it("X04 rejects traversal before decompression", async () => {
  const bytes = zipSync({ "../escape": strToU8("bad") });
  await expect(inspectArchive(bytes)).rejects.toThrow("Unsafe archive path");
});
it("X11 incomplete attachment backup never becomes a complete restore", async () => {
  const bytes = await createArchive({ attachments: [{ id: "missing" }] });
  await expect(inspectArchive(bytes)).rejects.toThrow("incomplete");
});
it("P07 rejects disguised executable files", () => {
  expect(() =>
    validateFile("evil.png", "image/png", strToU8("<script>bad()</script>")),
  ).toThrow();
  expect(() =>
    validateFile("evil.txt", "text/plain", strToU8("<html>bad</html>")),
  ).toThrow();
  expect(validateFile("memory.md", "text/markdown", strToU8("# שלום"))).toBe(
    "text/markdown",
  );
});
