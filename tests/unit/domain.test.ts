import { describe, it, expect } from "vitest";
import { birthday, localInstant, relativeDate } from "../../lib/domain/dates";
import {
  copyContext,
  locateQuote,
  validateCitations,
} from "../../lib/domain/provenance";
describe("dates and provenance", () => {
  it("E01 E02 uses capture timezone, never sync time", () =>
    expect(relativeDate("2026-09-15T09:00:00Z", "Asia/Jerusalem", -1)).toBe(
      "2026-09-14",
    ));
  it("R08 resolves IANA timezone", () =>
    expect(localInstant("2026-09-15", "09:00", "Asia/Jerusalem")).toBe(
      "2026-09-15T06:00:00Z",
    ));
  it("R09 R10 no invented birth year, explicit leap policy", () => {
    expect(birthday(2027, 2, 29, "mar1")).toBe("2027-03-01");
    expect(birthday(2028, 2, 29, "feb28")).toBe("2028-02-29");
  });
  it("E07 rejects fabricated or ambiguous quotes", () => {
    expect(() => locateQuote("Maya said hello", "said goodbye")).toThrow();
    expect(() => locateQuote("yes yes", "yes")).toThrow();
  });
  it("A05 rejects unprovided source IDs", () =>
    expect(() =>
      validateCitations([{ source_id: "missing", quote: "text" }], new Map()),
    ).toThrow());
  it("A06 preserves mixed Hebrew offsets", () =>
    expect(locateQuote("דיברתי עם Maya היום", "Maya").start).toBe(10));
  it("X05 X06 excludes restricted content and explains omissions", () => {
    const result = copyContext([
      { id: "private", text: "secret", no_ai: true, captured_at: "2026-09-15" },
    ]);
    expect(result).not.toContain("secret");
    expect(result).toContain("Omitted 1");
  });
});
