CREATE TABLE groups (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
);
CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(group_id,user_id)
);
CREATE INDEX group_member_user ON group_members(user_id,group_id);
CREATE TABLE group_invitations (
  id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','revoked')),
  created_at INTEGER NOT NULL
);
CREATE INDEX invitations_recipient ON group_invitations(recipient_id,status);
CREATE TABLE plans (
  id TEXT PRIMARY KEY, organizer_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Social',
  venue TEXT NOT NULL DEFAULT '', zone TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('invite','group')), group_id TEXT REFERENCES groups(id),
  join_policy TEXT NOT NULL CHECK(join_policy IN ('immediate','approval')),
  capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 20), held INTEGER NOT NULL DEFAULT 0 CHECK(held BETWEEN 0 AND capacity),
  organizer_attends INTEGER NOT NULL DEFAULT 0 CHECK(organizer_attends IN (0,1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','proposed','confirmed','cancelled','completed')),
  start_ms INTEGER, end_ms INTEGER, join_deadline INTEGER, joining_closed INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1, mutation_id TEXT NOT NULL DEFAULT '', modified_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  CHECK((start_ms IS NULL AND end_ms IS NULL) OR end_ms > start_ms),
  CHECK(visibility!='group' OR group_id IS NOT NULL)
);
CREATE INDEX plans_future ON plans(status,start_ms);
CREATE INDEX plans_organizer ON plans(organizer_id,status);
CREATE TRIGGER plan_limit BEFORE INSERT ON plans WHEN (SELECT count(*) FROM plans WHERE status NOT IN ('completed','cancelled'))>=100 BEGIN
  SELECT RAISE(ABORT,'plan_limit');
END;
CREATE TABLE plan_invitees (
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(plan_id,user_id)
);
CREATE TABLE candidates (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL CHECK(end_ms > start_ms), UNIQUE(plan_id,start_ms,end_ms)
);
CREATE INDEX candidates_plan ON candidates(plan_id);
CREATE TABLE votes (
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
  response TEXT NOT NULL CHECK(response IN ('Available','Unavailable','Maybe')), PRIMARY KEY(candidate_id,user_id)
);
CREATE TABLE participation (
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('requested','interested','confirmed','waitlisted','offered','reconfirmation','declined','expired','left','removed','rejected','cancelled')),
  accepted_version INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, revision INTEGER NOT NULL DEFAULT 1,
  joined_at INTEGER NOT NULL, modified_at INTEGER NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY(plan_id,user_id)
);
CREATE INDEX participants_status ON participation(plan_id,status,joined_at,user_id);
CREATE INDEX participants_user ON participation(user_id,status);
CREATE INDEX participants_expiry ON participation(status,expires_at);
CREATE TABLE outbox (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id), event TEXT NOT NULL, plan_version INTEGER NOT NULL, membership_revision INTEGER,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','done','failed')),
  lease_token TEXT, lease_until INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX outbox_due ON outbox(state,available_at,lease_until);
CREATE TABLE notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  event TEXT NOT NULL, plan_version INTEGER NOT NULL, membership_revision INTEGER, created_at INTEGER NOT NULL, read_at INTEGER
);
CREATE INDEX notifications_inbox ON notifications(user_id,created_at);
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id TEXT NOT NULL, actor_id TEXT NOT NULL,
  subject_id TEXT, event TEXT NOT NULL, created_at INTEGER NOT NULL
);

-- Seat counter and durable work commit within the membership mutation, never from a JS read-then-write.
CREATE TRIGGER participation_insert AFTER INSERT ON participation BEGIN
  INSERT INTO availability_versions VALUES(NEW.user_id,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1;
  UPDATE plans SET held=held+(NEW.status IN ('interested','confirmed','offered','reconfirmation')) WHERE id=NEW.plan_id;
  INSERT INTO outbox(id,plan_id,user_id,event,plan_version,membership_revision,available_at,created_at)
    SELECT NEW.plan_id||':'||NEW.user_id||':'||NEW.revision,NEW.plan_id,NEW.user_id,NEW.status,version,NEW.revision,NEW.modified_at,NEW.modified_at FROM plans WHERE id=NEW.plan_id;
  INSERT INTO audit_events(plan_id,actor_id,subject_id,event,created_at) VALUES(NEW.plan_id,NEW.actor_id,NEW.user_id,NEW.status,NEW.modified_at);
END;
CREATE TRIGGER participation_update AFTER UPDATE OF status ON participation WHEN NEW.status!=OLD.status BEGIN
  INSERT INTO availability_versions VALUES(NEW.user_id,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1;
  UPDATE plans SET held=held+(NEW.status IN ('interested','confirmed','offered','reconfirmation'))-(OLD.status IN ('interested','confirmed','offered','reconfirmation')) WHERE id=NEW.plan_id;
  INSERT INTO outbox(id,plan_id,user_id,event,plan_version,membership_revision,available_at,created_at)
    SELECT NEW.plan_id||':'||NEW.user_id||':'||NEW.revision,NEW.plan_id,NEW.user_id,NEW.status,version,NEW.revision,NEW.modified_at,NEW.modified_at FROM plans WHERE id=NEW.plan_id;
  INSERT INTO audit_events(plan_id,actor_id,subject_id,event,created_at) VALUES(NEW.plan_id,NEW.actor_id,NEW.user_id,NEW.status,NEW.modified_at);
END;
CREATE TRIGGER plan_cancel AFTER UPDATE OF status ON plans WHEN NEW.status='cancelled' AND OLD.status!='cancelled' BEGIN
  UPDATE participation SET status='cancelled',revision=revision+1,modified_at=NEW.modified_at,expires_at=NULL,actor_id=NEW.organizer_id
    WHERE plan_id=NEW.id AND status IN ('requested','interested','confirmed','waitlisted','offered','reconfirmation');
END;
CREATE TRIGGER plan_material_change AFTER UPDATE ON plans
WHEN NEW.status='confirmed' AND (OLD.status='proposed' OR (OLD.status='confirmed' AND (OLD.start_ms!=NEW.start_ms OR OLD.end_ms!=NEW.end_ms OR OLD.zone!=NEW.zone OR OLD.venue!=NEW.venue))) BEGIN
  UPDATE participation SET status='reconfirmation',revision=revision+1,modified_at=NEW.modified_at,
    expires_at=min(NEW.modified_at+172800000,NEW.start_ms),actor_id=NEW.organizer_id
    WHERE plan_id=NEW.id AND status IN ('interested','confirmed','reconfirmation');
  UPDATE participation SET expires_at=min(expires_at,NEW.start_ms),modified_at=NEW.modified_at
    WHERE plan_id=NEW.id AND status='offered';
END;
CREATE TRIGGER plan_version_event AFTER UPDATE OF version ON plans BEGIN
  INSERT INTO audit_events(plan_id,actor_id,event,created_at) VALUES(NEW.id,NEW.organizer_id,'plan:'||NEW.status,NEW.modified_at);
  INSERT OR IGNORE INTO outbox(id,plan_id,user_id,event,plan_version,available_at,created_at)
    SELECT NEW.id||':change:'||NEW.version||':'||user_id,NEW.id,user_id,'plan:'||NEW.status,NEW.version,NEW.modified_at,NEW.modified_at
    FROM participation WHERE plan_id=NEW.id;
END;
CREATE TRIGGER plan_time_availability AFTER UPDATE OF start_ms,end_ms ON plans WHEN OLD.start_ms IS NOT NEW.start_ms OR OLD.end_ms IS NOT NEW.end_ms BEGIN
  UPDATE availability_versions SET version=version+1 WHERE user_id IN(SELECT user_id FROM participation WHERE plan_id=NEW.id);
END;

