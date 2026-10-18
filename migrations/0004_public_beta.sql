-- Registration is open to verified Google accounts; per-group limits remain.
DROP TRIGGER IF EXISTS private_member_limit;
CREATE INDEX google_identity_email ON google_identities(email);
