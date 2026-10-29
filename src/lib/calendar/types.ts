export const CALENDAR_EVENT_TYPES = ["MEETING", "FOLLOW_UP", "OTHER"] as const;
export type CalendarEventType = typeof CALENDAR_EVENT_TYPES[number];

export const ATTENDEE_STATUSES = ["PENDING", "COMPLETED"] as const;
export type AttendeeStatus = typeof ATTENDEE_STATUSES[number];

export type CalendarEventAttendee = {
  user_id: number;
  status: AttendeeStatus;
  remarks: string | null;
};

export type CalendarEventRow = {
  id: number;
  title: string;
  description: string | null;
  type: CalendarEventType;
  starts_at: Date;
  created_by: number;
  created_at: Date;
  attendees: CalendarEventAttendee[];
};
