import { z } from "zod";
import { zoneSchema } from "./availability";
const timeSchema = z
  .object({
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
  })
  .refine(
    (v) => Date.parse(v.end) > Date.parse(v.start),
    "End must be after start.",
  );
export const draftSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(3000).default(""),
    category: z.string().trim().min(1).max(40).default("Social"),
    venue: z.string().trim().max(500).default(""),
    zone: zoneSchema,
    visibility: z.enum(["invite", "group"]),
    groupId: z.string().max(100).nullable().default(null),
    invitees: z.array(z.string().max(100)).max(20).default([]),
    joinPolicy: z.enum(["immediate", "approval"]),
    capacity: z.number().int().min(1).max(20),
    organizerAttends: z.boolean(),
    time: timeSchema.nullable(),
    candidates: z.array(timeSchema).max(10).default([]),
    joinDeadline: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .refine(
    (v) => v.visibility !== "group" || Boolean(v.groupId),
    "Select a group.",
  )
  .refine(
    (v) => Boolean(v.time) || v.candidates.length >= 2,
    "Choose a fixed time or at least two candidate times.",
  );
export type DraftInput = z.infer<typeof draftSchema>;
export type Plan = {
  id: string;
  organizer_id: string;
  title: string;
  description: string;
  category: string;
  venue: string;
  zone: string;
  visibility: "invite" | "group";
  group_id: string | null;
  join_policy: "immediate" | "approval";
  capacity: number;
  held: number;
  organizer_attends: number;
  status: "draft" | "proposed" | "confirmed" | "cancelled" | "completed";
  start_ms: number | null;
  end_ms: number | null;
  join_deadline: number | null;
  joining_closed: number;
  version: number;
  created_at: number;
  modified_at: number;
};
export type Participant = {
  user_id: string;
  name: string;
  status: string;
  accepted_version: number;
  expires_at: number | null;
  revision: number;
};
export type Candidate = {
  id: string;
  start_ms: number;
  end_ms: number;
  votes: { user_id: string; response: string }[];
};
export type PlanDetail = {
  plan: Plan;
  candidates: Candidate[];
  participants: Participant[];
  invitees: string[];
};
export function validatePlanTimes(input: DraftInput, now = Date.now()): void {
  const times = input.time ? [input.time] : input.candidates;
  const seen = new Set<string>();
  for (const time of times) {
    const start = Date.parse(time.start);
    const end = Date.parse(time.end);
    if (start <= now || end > now + 367 * 86400000)
      throw new Error("Choose future times within twelve months.");
    if (end - start > 14 * 86400000)
      throw new Error("Activities may last at most fourteen days.");
    const key = `${start}:${end}`;
    if (seen.has(key)) throw new Error("Candidate times must be distinct.");
    seen.add(key);
  }
  if (
    input.joinDeadline &&
    (Date.parse(input.joinDeadline) <= now ||
      Date.parse(input.joinDeadline) >
        Math.min(...times.map((t) => Date.parse(t.start))))
  )
    throw new Error(
      "Joining deadline must be in the future and no later than the earliest start.",
    );
}
