export const EMAIL_LOG_STATUSES = ["PENDING", "SENT", "FAILED", "RETRYING"] as const;
export type EmailLogStatus = typeof EMAIL_LOG_STATUSES[number];

export type EmailAnnouncementRow = {
  id: number;
  sender_user_id: number;
  subject: string;
  body: string;
  created_at: Date;
};

export type EmailRecipientRow = {
  id: number;
  announcement_id: number;
  recipient_user_id: number;
};

export type EmailLogRow = {
  id: number;
  recipient_id: number;
  status: EmailLogStatus;
  attempt_count: number;
  last_error: string | null;
  sent_at: Date | null;
  updated_at: Date;
};
