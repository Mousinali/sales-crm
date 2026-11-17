-- Team (group) chats: a named set of members with their own message stream.
-- last_read_at drives each member's unread count; muted silences just them.
CREATE TABLE chat_groups (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_group_members (
  group_id BIGINT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id),
  muted BOOLEAN NOT NULL DEFAULT false,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX idx_chat_group_members_user ON chat_group_members(user_id);

CREATE TABLE group_messages (
  id BIGSERIAL PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_group_messages_group ON group_messages(group_id, created_at);

-- File transfer: the bytes live here (not in the message tables) so message
-- lists never have to load them. A file-only message has an empty body. An
-- attachment belongs to exactly one of a direct or a group message.
CREATE TABLE chat_attachments (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT UNIQUE REFERENCES direct_messages(id) ON DELETE CASCADE,
  group_message_id BIGINT UNIQUE REFERENCES group_messages(id) ON DELETE CASCADE,
  CHECK ((message_id IS NULL) != (group_message_id IS NULL)),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Blocking stops the blocked user messaging the blocker (and the blocker
-- sending to them until unblocked). Muting only silences notifications.
CREATE TABLE chat_blocks (
  blocker_id BIGINT NOT NULL REFERENCES users(id),
  blocked_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE TABLE chat_mutes (
  user_id BIGINT NOT NULL REFERENCES users(id),
  muted_user_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, muted_user_id),
  CHECK (user_id != muted_user_id)
);
