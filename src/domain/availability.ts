import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

export const zoneSchema = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      Temporal.Now.zonedDateTimeISO(value);
      return !/^[+-]/.test(value);
    } catch {
      return false;
    }
  }, "Choose a valid IANA time zone.");
export const entrySchema = z
  .object({
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    state: z.enum(["Available", "Busy"]),
    zone: zoneSchema,
    label: z.string().trim().max(100).default(""),
  })
  .refine((v) => Date.parse(v.end) > Date.parse(v.start), {
    message: "End must be after start.",
  });
export const ruleSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    effectiveStart: z.iso.date(),
    effectiveEnd: z.iso.date(),
    state: z.enum(["Available", "Busy"]),
    zone: zoneSchema,
    disambiguation: z.enum(["reject", "earlier", "later"]).default("reject"),
  })
  .refine(
    (v) => v.effectiveEnd >= v.effectiveStart && v.startTime !== v.endTime,
    { message: "Check effective dates and duration." },
  );
export type Entry = z.infer<typeof entrySchema> & { id: string };
export type Rule = z.infer<typeof ruleSchema> & { id: string };
export type State = "Available" | "Busy" | "Unknown";
export type Interval = {
  start: number;
  end: number;
  state: State;
  priority: number;
};
export type Segment = { start: number; end: number; state: State };
export type AvailabilityData = {
  entries: Entry[];
  rules: Rule[];
  external?: Interval[];
  stale?: boolean;
};

export function instant(
  local: string,
  zone: string,
  disambiguation: "reject" | "earlier" | "later" = "reject",
): number {
  return Number(
    Temporal.PlainDateTime.from(local).toZonedDateTime(zone, { disambiguation })
      .epochMilliseconds,
  );
}

export function expandRules(
  rules: Rule[],
  start: number,
  end: number,
): { intervals: Interval[]; warnings: string[] } {
  const intervals: Interval[] = [];
  const warnings: string[] = [];
  for (const rule of rules) {
    let day = Temporal.Instant.fromEpochMilliseconds(start)
      .toZonedDateTimeISO(rule.zone)
      .toPlainDate()
      .subtract({ days: 1 });
    const last = Temporal.Instant.fromEpochMilliseconds(end)
      .toZonedDateTimeISO(rule.zone)
      .toPlainDate();
    for (
      let n = 0;
      Temporal.PlainDate.compare(day, last) <= 0 && n < 370;
      n++, day = day.add({ days: 1 })
    ) {
      if (
        day.dayOfWeek !== rule.weekday ||
        day.toString() < rule.effectiveStart ||
        day.toString() > rule.effectiveEnd
      )
        continue;
      const endDay =
        rule.endTime <= rule.startTime ? day.add({ days: 1 }) : day;
      try {
        // Nonexistent times always require correction; only repeated times may use a selected offset.
        const resolve = (d: Temporal.PlainDate, time: string) => {
          const local = d.toPlainDateTime(time);
          const earlier = local.toZonedDateTime(rule.zone, {
            disambiguation: "earlier",
          });
          const later = local.toZonedDateTime(rule.zone, {
            disambiguation: "later",
          });
          if (
            !earlier.toPlainDateTime().equals(local) ||
            !later.toPlainDateTime().equals(local)
          )
            throw new Error("Nonexistent local time");
          return Number(
            local.toZonedDateTime(rule.zone, {
              disambiguation: rule.disambiguation,
            }).epochMilliseconds,
          );
        };
        const a = resolve(day, rule.startTime);
        const b = resolve(endDay, rule.endTime);
        if (a < end && b > start)
          intervals.push({ start: a, end: b, state: rule.state, priority: 1 });
      } catch {
        warnings.push(
          `${day.toString()}: ${rule.startTime}–${rule.endTime} in ${rule.zone} needs daylight-saving correction.`,
        );
      }
    }
  }
  return { intervals, warnings };
}

export function segments(
  intervals: Interval[],
  start: number,
  end: number,
  stale = false,
): Segment[] {
  if (!(end > start) || end - start > 367 * 86400000)
    throw new Error("Choose a positive range of at most twelve months.");
  const relevant = intervals.filter((i) => i.start < end && i.end > start);
  const edges = [
    ...new Set([
      start,
      end,
      ...relevant.flatMap((i) => [
        Math.max(start, i.start),
        Math.min(end, i.end),
      ]),
    ]),
  ].sort((a, b) => a - b);
  const output: Segment[] = [];
  for (let index = 0; index < edges.length - 1; index++) {
    const a = edges[index];
    const b = edges[index + 1];
    const active = relevant.filter((i) => i.start < b && i.end > a);
    const priority = Math.max(0, ...active.map((i) => i.priority));
    const highest = active.filter((i) => i.priority === priority);
    let state: State = highest.some((i) => i.state === "Busy")
      ? "Busy"
      : highest.some((i) => i.state === "Available")
        ? "Available"
        : "Unknown";
    if (stale && state === "Available") state = "Unknown";
    const last = output.at(-1);
    if (last?.state === state) last.end = b;
    else output.push({ start: a, end: b, state });
  }
  return output;
}

export function availability(
  data: AvailabilityData,
  start: number,
  end: number,
) {
  const expanded = expandRules(data.rules, start, end);
  const intervals: Interval[] = [
    ...expanded.intervals,
    ...data.entries.map((e) => ({
      start: Date.parse(e.start),
      end: Date.parse(e.end),
      state: e.state,
      priority: 2,
    })),
    ...(data.external ?? []),
  ];
  return {
    segments: segments(intervals, start, end, data.stale),
    warnings: expanded.warnings,
  };
}

export function stateDuring(
  items: Segment[],
  start: number,
  end: number,
): State {
  // Input is the sorted, nonoverlapping output of segments(). Jump to the first intersecting segment.
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (items[middle].end <= start) low = middle + 1;
    else high = middle;
  }
  let available = 0;
  for (let i = low; i < items.length && items[i].start < end; i++) {
    if (items[i].state === "Busy") return "Busy";
    if (items[i].state === "Available")
      available +=
        Math.min(items[i].end, end) - Math.max(items[i].start, start);
  }
  return end > start && available >= end - start ? "Available" : "Unknown";
}
