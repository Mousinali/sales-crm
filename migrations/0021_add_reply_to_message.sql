-- SET NULL (not CASCADE/RESTRICT): if the original message is ever removed,
-- the reply should keep existing, just without a quoted target.
ALTER TABLE direct_messages ADD COLUMN reply_to_message_id BIGINT REFERENCES direct_messages(id) ON DELETE SET NULL;
