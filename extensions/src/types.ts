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
