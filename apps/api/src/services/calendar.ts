export type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location?: string | null;
  description?: string | null;
};

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function fold(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

export function buildIcs(events: CalendarEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kort//Tenis Kulubu//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@kort`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(event.start)}`,
      `DTEND:${stamp(event.end)}`,
      `SUMMARY:${fold(event.title)}`,
    );
    if (event.location) lines.push(`LOCATION:${fold(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${fold(event.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
