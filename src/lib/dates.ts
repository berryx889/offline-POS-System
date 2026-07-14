// Date helpers. Sales store created_at as UTC ISO strings; the shop thinks in its
// LOCAL day. Local midnight converted to a UTC ISO instant compares correctly
// against stored created_at values (ISO strings sort chronologically).

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** ISO instant of the start of today (local). */
export function todayStartISO(): string {
  return startOfDay().toISOString();
}

/** The same weekday one week ago, as a [start, end) local-day window in ISO. */
export function lastWeekSameDayRange(): { from: string; to: string } {
  const from = startOfDay(addDays(new Date(), -7));
  const to = startOfDay(addDays(new Date(), -6));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function humanDate(d = new Date()): string {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export function startOfWeek(d = new Date()): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  return addDays(x, -day);
}

export function startOfMonth(d = new Date()): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

/** A [from, toExclusive) ISO window from two local date inputs (YYYY-MM-DD),
 *  end inclusive of the whole end day. */
export function rangeFromDates(fromDate: Date, toDate: Date): { from: string; toExclusive: string } {
  return {
    from: startOfDay(fromDate).toISOString(),
    toExclusive: startOfDay(addDays(toDate, 1)).toISOString(),
  };
}

/** Parse a YYYY-MM-DD input as a local date. */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Format a Date as YYYY-MM-DD for <input type="date">. */
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
