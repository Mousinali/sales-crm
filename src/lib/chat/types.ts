export type DirectMessageRow = {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  reply_to_message_id: number | null;
  delivered_at: Date | null;
  read_at: Date | null;
  created_at: Date;
};

export type ConversationSummary = {
  counterpart_id: number;
  last_message: string;
  last_sender_id: number;
  last_at: Date;
  unread_count: number;
};
