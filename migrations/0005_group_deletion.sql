-- Retain the group reference for organizers' historical plan records.
ALTER TABLE groups ADD COLUMN deleted_at INTEGER;
CREATE INDEX plans_group ON plans(group_id);

-- Reject stale requests that were authorized before a concurrent deletion.
CREATE TRIGGER deleted_group_member BEFORE INSERT ON group_members
WHEN EXISTS(SELECT 1 FROM groups WHERE id=NEW.group_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'group_deleted'); END;
CREATE TRIGGER deleted_group_invitation BEFORE INSERT ON group_invitations
WHEN EXISTS(SELECT 1 FROM groups WHERE id=NEW.group_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'group_deleted'); END;
CREATE TRIGGER deleted_group_plan_insert BEFORE INSERT ON plans
WHEN EXISTS(SELECT 1 FROM groups WHERE id=NEW.group_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'group_deleted'); END;
CREATE TRIGGER deleted_group_plan_update BEFORE UPDATE ON plans
WHEN NEW.status NOT IN ('cancelled','completed') AND EXISTS(SELECT 1 FROM groups WHERE id=NEW.group_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'group_deleted'); END;
