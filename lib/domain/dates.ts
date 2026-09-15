import { Temporal } from "@js-temporal/polyfill";
export function relativeDate(captured: string, timezone: string, days: number) {
  return Temporal.Instant.from(captured)
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .add({ days })
    .toString();
}
export function localInstant(date: string, time: string, timezone: string) {
  return Temporal.PlainDate.from(date)
    .toPlainDateTime(Temporal.PlainTime.from(time))
    .toZonedDateTime(timezone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}
export function birthday(
  year: number,
  month: number,
  day: number,
  leap: "feb28" | "mar1",
) {
  try {
    return Temporal.PlainDate.from(
      { year, month, day },
      { overflow: "reject" },
    ).toString();
  } catch {
    if (month !== 2 || day !== 29) throw new Error("Invalid birthday");
    return Temporal.PlainDate.from({
      year,
      month: leap === "feb28" ? 2 : 3,
      day: leap === "feb28" ? 28 : 1,
    }).toString();
  }
}
