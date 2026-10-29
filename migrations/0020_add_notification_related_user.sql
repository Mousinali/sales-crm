-- Generic "this notification is about that other user" link, used first by
-- CHAT_MESSAGE notifications to deep-link a click straight to the sender's
-- conversation. SET NULL (not CASCADE/RESTRICT) because losing the link is
-- just a lost deep-link convenience, never worth blocking a user deletion
-- or deleting the notification itself over.
ALTER TABLE notifications ADD COLUMN related_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
