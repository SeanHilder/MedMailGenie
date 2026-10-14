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

// Result of /analyze/email: everything except the reply, from one Gemini request.
export interface EmailAnalysis extends TaskExtraction {
  category: string;
  priority: string;
  summary: string;
}