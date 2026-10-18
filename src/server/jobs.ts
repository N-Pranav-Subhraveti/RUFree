import { planAccess } from "./plans-access";

export function promote(
  db: D1Database,
  planId: string,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE participation SET status='offered',revision=revision+1,modified_at=?,
    expires_at=(SELECT min(?+86400000,coalesce(join_deadline,?+86400000),coalesce(start_ms,?+86400000)) FROM plans WHERE id=?)
    WHERE plan_id=? AND status='waitlisted' AND user_id=(
      SELECT q.user_id FROM participation q JOIN plans p ON p.id=q.plan_id JOIN users u ON u.id=q.user_id
      WHERE q.plan_id=? AND q.status='waitlisted' AND u.status='active' AND p.status IN ('proposed','confirmed')
      AND p.joining_closed=0 AND p.held<p.capacity AND (p.join_deadline IS NULL OR p.join_deadline>?) AND (p.start_ms IS NULL OR p.start_ms>?)
      AND (p.organizer_id=q.user_id OR (p.visibility='invite' AND EXISTS(SELECT 1 FROM plan_invitees i WHERE i.plan_id=p.id AND i.user_id=q.user_id))
        OR (p.visibility='group' AND EXISTS(SELECT 1 FROM group_members g WHERE g.group_id=p.group_id AND g.user_id=q.user_id)))
      ORDER BY q.joined_at,q.user_id LIMIT 1)`,
    )
    .bind(now, now, now, now, planId, planId, planId, now, now);
}
export async function expirePlan(
  db: D1Database,
  planId: string,
  now = Date.now(),
): Promise<void> {
  await db.batch([
    db
      .prepare(
        "UPDATE participation SET status='expired',revision=revision+1,modified_at=? WHERE plan_id=? AND status IN ('offered','reconfirmation') AND expires_at<=?",
      )
      .bind(now, planId, now),
    promote(db, planId, now),
    db
      .prepare(
        "UPDATE plans SET status='completed',version=version+1,modified_at=? WHERE id=? AND status='confirmed' AND end_ms<=?",
      )
      .bind(now, planId, now),
  ]);
}
type Job = {
  id: string;
  plan_id: string;
  user_id: string;
  event: string;
  plan_version: number;
  attempts: number;
};
export async function dispatch(
  db: D1Database,
  now = Date.now(),
): Promise<{ processed: number }> {
  const due = await db
    .prepare(
      "SELECT DISTINCT plan_id FROM participation WHERE status IN ('offered','reconfirmation') AND expires_at<=? LIMIT 3",
    )
    .bind(now)
    .all<{ plan_id: string }>();
  for (const row of due.results) await expirePlan(db, row.plan_id, now);
  await db
    .prepare(
      "UPDATE plans SET status='completed',version=version+1,modified_at=? WHERE id IN (SELECT id FROM plans WHERE status='confirmed' AND end_ms<=? LIMIT 3)",
    )
    .bind(now, now)
    .run();
  const lease = crypto.randomUUID();
  const job = await db
    .prepare(
      `UPDATE outbox SET state='leased',lease_token=?,lease_until=?,attempts=attempts+1
    WHERE id=(SELECT id FROM outbox WHERE (state='pending' AND available_at<=?) OR (state='leased' AND lease_until<=?) ORDER BY created_at,id LIMIT 1)
    RETURNING id,plan_id,user_id,event,plan_version,attempts`,
    )
    .bind(lease, now + 60000, now, now)
    .first<Job>();
  if (!job) return { processed: 0 };
  try {
    // Notification and acknowledgement of this lease are one transaction. Recheck access and current version here and on inbox reads.
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO notifications(id,user_id,plan_id,event,plan_version,membership_revision,created_at)
        SELECT ?,?,?,?,p.version,j.membership_revision,? FROM plans p JOIN outbox j ON j.plan_id=p.id
        WHERE j.id=? AND j.state='leased' AND j.lease_token=? AND p.version=? AND (j.membership_revision IS NULL OR EXISTS(SELECT 1 FROM participation m WHERE m.plan_id=j.plan_id AND m.user_id=j.user_id AND m.revision=j.membership_revision)) AND ${planAccess}`,
        )
        .bind(
          job.id,
          job.user_id,
          job.plan_id,
          job.event,
          now,
          job.id,
          lease,
          job.plan_version,
          job.user_id,
          job.user_id,
          job.user_id,
        ),
      promote(db, job.plan_id, now),
      db
        .prepare(
          "UPDATE outbox SET state='done',lease_token=NULL,lease_until=NULL WHERE id=? AND state='leased' AND lease_token=?",
        )
        .bind(job.id, lease),
    ]);
    return { processed: 1 };
  } catch {
    await db
      .prepare(
        "UPDATE outbox SET state=?,available_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
      )
      .bind(
        job.attempts >= 8 ? "failed" : "pending",
        now + Math.min(3600000, 1000 * 2 ** job.attempts),
        job.id,
        lease,
      )
      .run();
    return { processed: 0 };
  }
}
