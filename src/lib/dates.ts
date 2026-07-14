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
