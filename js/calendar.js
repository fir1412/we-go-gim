// Training reminders without a server: a calendar file with one weekly repeating event per training day.
// The phone's own calendar (Google, Apple, Samsung) then reminds the user, even when the app is closed.

const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
const stamp = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const local = x => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;

/** Next date (local, from today) that falls on weekday dow (0 = Sunday). */
function nextDow(dow, from) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  return d;
}

/**
 * days: [{ dow, name, minutes }], time: 'HH:MM', url: link back to the app.
 * Returns iCalendar text in floating local time, so it follows the phone's time zone.
 */
export function trainingIcs(days, time = '18:00', url = '', now = new Date()) {
  const [hh, mm] = (/^\d{2}:\d{2}$/.test(time) ? time : '18:00').split(':').map(Number);
  const byday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//we go gim//training reminders//EN', 'CALSCALE:GREGORIAN'];
  for (const d of days) {
    const start = nextDow(d.dow, now);
    start.setHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + Math.max(15, Math.min(180, d.minutes || 45)) * 60000);
    lines.push('BEGIN:VEVENT', `UID:wegogim-${byday[d.dow]}-${start.getTime()}@we-go-gim`, `DTSTAMP:${stamp(now)}`,
      `DTSTART:${local(start)}`, `DTEND:${local(end)}`, `RRULE:FREQ=WEEKLY;BYDAY=${byday[d.dow]}`,
      `SUMMARY:${esc('we go gim: ' + d.name)}`, `DESCRIPTION:${esc(url ? 'Open the app: ' + url : 'Time to train')}`,
      ...(url ? [`URL:${esc(url)}`] : []),
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc('we go gim: ' + d.name)}`, 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
