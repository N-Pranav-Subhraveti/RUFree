import {
  matchDay,
  rankMatches,
  type Match,
  type MatchInput,
} from "../domain/matching";
import { availability, type AvailabilityData } from "../domain/availability";
export type SearchInput = Omit<MatchInput, "participants"> & {
  participants: { id: string; data: AvailabilityData }[];
};
self.onmessage = (event: MessageEvent<SearchInput>) => {
  const raw = event.data;
  const warnings: string[] = [];
  const input: MatchInput = {
    ...raw,
    participants: raw.participants.map((p) => {
      const computed = availability(p.data, raw.start, raw.end);
      warnings.push(...computed.warnings);
      return { id: p.id, segments: computed.segments };
    }),
  };
  let results: Match[] = [];
  for (let day = input.start; day < input.end; day += 86400000) {
    results = rankMatches([
      ...results,
      ...matchDay(
        input,
        day,
        Math.min(day + 86400000 + input.duration * 60000, input.end),
      ).filter((r) => r.start < day + 86400000),
    ]);
    self.postMessage({
      progress: Math.min(
        1,
        (day + 86400000 - input.start) / (input.end - input.start),
      ),
    });
  }
  self.postMessage({ results: rankMatches(results), warnings });
};
