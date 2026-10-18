import { describe, expect, it } from "vitest";
import {
  availability,
  expandRules,
  instant,
  segments,
  stateDuring,
  type Rule,
} from "../../src/domain/availability";
import {
  matchDay,
  rankMatches,
  type MatchInput,
} from "../../src/domain/matching";
const rule = (overrides: Partial<Rule> = {}): Rule => ({
  id: "r",
  weekday: 7,
  startTime: "18:00",
  endTime: "20:00",
  effectiveStart: "2026-01-01",
  effectiveEnd: "2026-12-31",
  zone: "America/New_York",
  state: "Available",
  disambiguation: "reject",
  ...overrides,
});
describe("availability precedence and coverage", () => {
  it("does not infer availability from missing data", () =>
    expect(segments([], 0, 100)).toEqual([
      { start: 0, end: 100, state: "Unknown" },
    ]));
  it("applies half-open boundaries", () =>
    expect(
      stateDuring(
        segments(
          [
            { start: 0, end: 10, state: "Busy", priority: 3 },
            { start: 10, end: 20, state: "Available", priority: 1 },
          ],
          0,
          20,
        ),
        10,
        20,
      ),
    ).toBe("Available"));
  it("lets dated entries override rules but external busy overrides both", () => {
    expect(
      segments(
        [
          { start: 0, end: 100, state: "Busy", priority: 1 },
          { start: 10, end: 90, state: "Available", priority: 2 },
          { start: 30, end: 40, state: "Busy", priority: 3 },
        ],
        0,
        100,
      ),
    ).toEqual([
      { start: 0, end: 10, state: "Busy" },
      { start: 10, end: 30, state: "Available" },
      { start: 30, end: 40, state: "Busy" },
      { start: 40, end: 90, state: "Available" },
      { start: 90, end: 100, state: "Busy" },
    ]);
  });
  it("resolves same-priority overlap to Busy and merges adjacent states", () => {
    expect(
      segments(
        [
          { start: 0, end: 20, state: "Available", priority: 2 },
          { start: 10, end: 30, state: "Busy", priority: 2 },
          { start: 30, end: 40, state: "Busy", priority: 2 },
        ],
        0,
        40,
      ),
    ).toEqual([
      { start: 0, end: 10, state: "Available" },
      { start: 10, end: 40, state: "Busy" },
    ]);
  });
  it("stale imports preserve known busy and downgrade available to Unknown", () =>
    expect(
      segments(
        [
          { start: 0, end: 10, state: "Available", priority: 1 },
          { start: 10, end: 20, state: "Busy", priority: 3 },
        ],
        0,
        20,
        true,
      ),
    ).toEqual([
      { start: 0, end: 10, state: "Unknown" },
      { start: 10, end: 20, state: "Busy" },
    ]));
  it("retains all-day exclusive ends", () => {
    const a = instant("2026-10-10T00:00", "Asia/Seoul");
    const b = instant("2026-10-11T00:00", "Asia/Seoul");
    const data = availability(
      {
        rules: [],
        entries: [
          {
            id: "a",
            start: new Date(a).toISOString(),
            end: new Date(b).toISOString(),
            zone: "Asia/Seoul",
            state: "Busy",
            label: "",
          },
        ],
      },
      a,
      b + 3600000,
    );
    expect(stateDuring(data.segments, b, b + 3600000)).toBe("Unknown");
  });
});
describe("local recurrence and daylight saving", () => {
  it("retains New York wall time across DST", () => {
    const expanded = expandRules(
      [rule()],
      Date.parse("2026-03-01T00:00Z"),
      Date.parse("2026-03-10T00:00Z"),
    );
    expect(
      expanded.intervals.map((i) => new Date(i.start).toISOString()),
    ).toEqual(["2026-03-01T23:00:00.000Z", "2026-03-08T22:00:00.000Z"]);
  });
  it("Seoul and New York refer to the same instant", () =>
    expect(instant("2026-03-09T07:00", "Asia/Seoul")).toBe(
      instant("2026-03-08T18:00", "America/New_York"),
    ));
  it("rejects nonexistent spring times even with earlier/later selected", () => {
    for (const disambiguation of ["reject", "earlier", "later"] as const) {
      const expanded = expandRules(
        [rule({ startTime: "02:30", endTime: "04:00", disambiguation })],
        Date.parse("2026-03-08T00:00Z"),
        Date.parse("2026-03-09T00:00Z"),
      );
      expect(expanded.intervals).toHaveLength(0);
      expect(expanded.warnings).toHaveLength(1);
    }
  });
  it("requires choice for repeated autumn times", () => {
    const bounds = [
      Date.parse("2026-11-01T00:00Z"),
      Date.parse("2026-11-02T00:00Z"),
    ] as const;
    expect(
      expandRules([rule({ startTime: "01:30", endTime: "02:30" })], ...bounds)
        .warnings,
    ).toHaveLength(1);
    const earlier = expandRules(
      [
        rule({
          startTime: "01:30",
          endTime: "02:30",
          disambiguation: "earlier",
        }),
      ],
      ...bounds,
    );
    const later = expandRules(
      [rule({ startTime: "01:30", endTime: "02:30", disambiguation: "later" })],
      ...bounds,
    );
    expect(later.intervals[0].start - earlier.intervals[0].start).toBe(3600000);
  });
  it("expands cross-midnight rules and honors effective end", () => {
    const expanded = expandRules(
      [
        rule({
          weekday: 6,
          startTime: "23:00",
          endTime: "01:00",
          effectiveEnd: "2026-10-10",
          zone: "Asia/Seoul",
        }),
      ],
      Date.parse("2026-10-10T00:00Z"),
      Date.parse("2026-10-18T00:00Z"),
    );
    expect(expanded.intervals).toHaveLength(1);
    expect(expanded.intervals[0].end - expanded.intervals[0].start).toBe(
      7200000,
    );
  });
});
describe("time matching", () => {
  const start = Date.parse("2026-10-10T09:00Z");
  const end = start + 3 * 3600000;
  const input = (): MatchInput => ({
    participants: [
      { id: "a", segments: [{ start, end, state: "Available" }] },
      { id: "b", segments: [{ start, end, state: "Available" }] },
      { id: "c", segments: [{ start, end, state: "Available" }] },
    ],
    start,
    end,
    duration: 90,
    buffer: 0,
    zone: "UTC",
    windowStart: "09:00",
    windowEnd: "12:00",
  });
  it("finds a common 90-minute opening", () =>
    expect(matchDay(input(), start, end)[0]).toMatchObject({
      complete: true,
      available: 3,
      busy: 0,
      unknown: 0,
    }));
  it("a busy half-hour removes the complete match", () => {
    const data = input();
    data.participants[1].segments = segments(
      [
        { start, end, state: "Available", priority: 1 },
        {
          start: start + 1800000,
          end: start + 3600000,
          state: "Busy",
          priority: 2,
        },
      ],
      start,
      end,
    );
    expect(matchDay(data, start, end)[0]).toMatchObject({
      complete: false,
      available: 2,
      busy: 1,
    });
  });
  it("does not count unknown members as available", () => {
    const data = input();
    data.participants[2].segments = [];
    expect(matchDay(data, start, end)[0]).toMatchObject({
      complete: false,
      available: 2,
      unknown: 1,
    });
  });
  it("checks the buffer and ranks complete before partial", () => {
    const data = input();
    data.buffer = 15;
    const matches = matchDay(data, start, end);
    expect(matches[0].complete).toBe(false);
    expect(rankMatches(matches)[0].start).toBe(start + 900000);
  });
});
