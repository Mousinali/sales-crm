export type DirectMessageRow = {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  reply_to_message_id: number | null;
  delivered_at: Date | null;
  read_at: Date | null;
  created_at: Date;
  // Present when the message carries a file (joined from chat_attachments).
  attachment_id: number | null;
  attachment_name: string | null;
  attachment_size: number | null;
};

export type ChatAttachmentInput = { name: string; mimeType: string; data: Buffer };

// Files go in the database, so keep them modest.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_MESSAGE_CHARS = 5000;

export type ConversationSummary = {
  counterpart_id: number;
  last_message: string;
  last_sender_id: number;
  last_at: Date;
  unread_count: number;
  muted: boolean;
  blocked: boolean;
};

export type ChatState = { blockedByMe: boolean; blockedByThem: boolean; muted: boolean };
