-- Activity history should outlive an account row (and test cleanup must be
-- able to delete users); the log entry stays, with no actor, if one is removed.
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_actor_user_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
