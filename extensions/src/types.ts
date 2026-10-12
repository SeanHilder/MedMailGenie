// One message of the open Gmail conversation, as sent to the backend.
export interface ThreadMessage {
  sender: string;
  date: string;
  body: string;
}

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
}

export interface TaskExtraction {
  tasks: string[];
  deadlines: string[];
  meeting_times: string[];
  calendar_events: CalendarEvent[];
}