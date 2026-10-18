import { Temporal } from "@js-temporal/polyfill";
import { stateDuring, type Segment } from "./availability";

export type MatchInput = {
  participants: { id: string; segments: Segment[] }[];
  start: number;
  end: number;
  duration: number;
  buffer: number;
  zone: string;
  windowStart: string;
  windowEnd: string;
};
export type Match = {
  start: number;
  end: number;
  available: number;
  busy: number;
  unknown: number;
  complete: boolean;
};
export function matchDay(
  input: MatchInput,
  start: number,
  end: number,
): Match[] {
  const results: Match[] = [];
  const duration = input.duration * 60000;
  const buffer = input.buffer * 60000;
  if (
    !input.participants.length ||
    input.duration < 15 ||
    input.duration > 1440 ||
    input.buffer < 0
  )
    return results;
  for (
    let t = Math.ceil(start / 900000) * 900000;
    t + duration <= end;
    t += 900000
  ) {
    const local = Temporal.Instant.fromEpochMilliseconds(t).toZonedDateTimeISO(
      input.zone,
    );
    const finish = Temporal.Instant.fromEpochMilliseconds(
      t + duration,
    ).toZonedDateTimeISO(input.zone);
    if (
      local.toPlainDate().toString() !== finish.toPlainDate().toString() ||
      local.toPlainTime().toString().slice(0, 5) < input.windowStart ||
      finish.toPlainTime().toString().slice(0, 5) > input.windowEnd
    )
      continue;
    const states = input.participants.map((p) =>
      stateDuring(p.segments, t - buffer, t + duration + buffer),
    );
    const available = states.filter((s) => s === "Available").length;
    results.push({
      start: t,
      end: t + duration,
      available,
      busy: states.filter((s) => s === "Busy").length,
      unknown: states.filter((s) => s === "Unknown").length,
      complete: available === states.length,
    });
  }
  return results;
}
export function rankMatches(results: Match[], limit = 20): Match[] {
  return results
    .sort(
      (a, b) =>
        Number(b.complete) - Number(a.complete) ||
        b.available - a.available ||
        a.start - b.start,
    )
    .slice(0, limit);
}
