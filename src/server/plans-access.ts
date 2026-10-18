import { HttpError } from "./http";
import type { Plan } from "../domain/plans";
// Use the identical predicate in reads and database-guarded writes.
export const planAccess = `(p.organizer_id=? OR (p.status!='draft' AND ((p.visibility='invite' AND EXISTS(SELECT 1 FROM plan_invitees i WHERE i.plan_id=p.id AND i.user_id=?)) OR (p.visibility='group' AND EXISTS(SELECT 1 FROM group_members g WHERE g.group_id=p.group_id AND g.user_id=?)))))`;
export async function accessiblePlan(
  db: D1Database,
  id: string,
  user: string,
): Promise<Plan> {
  const plan = await db
    .prepare(`SELECT p.* FROM plans p WHERE p.id=? AND ${planAccess}`)
    .bind(id, user, user, user)
    .first<Plan>();
  if (!plan) throw new HttpError(404, "Plan not found.");
  return plan;
}
