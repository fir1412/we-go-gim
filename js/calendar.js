// Training reminders without a server: a calendar file with one weekly repeating event per training day.
// The phone's own calendar (Google, Apple, Samsung) then reminds the user, even when the app is closed.

const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
const stamp = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** 'HH:MM' from 00:00 to 23:59 as [h, m]; anything else is 18:00. */
function parseTime(time) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time ?? ''));
  return m ? [+m[1], +m[2]] : [18, 0];
}
const okDow = d => Number.isInteger(d?.dow) && d.dow >= 0 && d.dow <= 6;

/** Next date (local, from today) that falls on weekday dow (0 = Sunday), as a local midnight Date. */
function nextDow(dow, from) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  return d;
}

/**
 * Start and end of the first event as floating local times 'YYYYMMDDTHHMM00'. They're written from the date
 * fields and the chosen clock time, never from a Date's hours, so a DST change can't shift the series. If the
 * time doesn't exist on the first date (a spring-forward gap), the series starts a week later. The end is the
 * start plus the duration on the wall clock (past midnight moves to the next day), so it's always after the start.
 */
function eventTimes(dow, hh, mm, minutes, now) {
  let day = nextDow(dow, now);
  for (let k = 0; k < 4; k++) {
    const probe = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
    if (probe.getHours() === hh && probe.getMinutes() === mm) break;
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 7);
  }
  const ymd = x => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`;
  const dur = Math.max(15, Math.min(180, Math.round(+minutes) || 45));
  const endMin = hh * 60 + mm + dur;
  const endDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + Math.floor(endMin / 1440));
  const em = endMin % 1440;
  return { start: `${ymd(day)}T${pad(hh)}${pad(mm)}00`, end: `${ymd(endDay)}T${pad(Math.floor(em / 60))}${pad(em % 60)}00` };
}

/**
 * days: [{ dow, name, minutes }], time: 'HH:MM', url: link back to the app.
 * Returns iCalendar text in floating local time, so it follows the phone's time zone.
 * Days whose weekday isn't 0–6 are skipped.
 */
export function trainingIcs(days, time = '18:00', url = '', now = new Date(), words = {}) {
  const [hh, mm] = parseTime(time);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//we go gim//training reminders//EN', 'CALSCALE:GREGORIAN'];
  (days || []).filter(okDow).forEach((d, i) => {
    const t = eventTimes(d.dow, hh, mm, d.minutes, now);
    // The index keeps two reminders on one weekday apart (same UID = the second replaces the first).
    lines.push('BEGIN:VEVENT', `UID:wegogim-${i}-${BYDAY[d.dow]}-${t.start}@we-go-gim`, `DTSTAMP:${stamp(now)}`,
      `DTSTART:${t.start}`, `DTEND:${t.end}`, `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[d.dow]}`,
      `SUMMARY:${esc('we go gim: ' + (d.title || d.name))}`, `DESCRIPTION:${esc(`${words.train || 'Time to train'}${url ? ' · ' + url : ''}`)}`,
      ...(url ? [`URL:${esc(url)}`] : []),
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc('we go gim: ' + (d.title || d.name))}`, 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/**
 * One training day as a Google Calendar "add event" link: a weekly event at the chosen time, in the phone's
 * own time zone. Works on Android, where Google Calendar can't open a downloaded calendar file.
 * A weekday outside 0–6 is read as Monday.
 */
export function googleCalendarUrl(day, time = '18:00', { title, details } = {}, now = new Date()) {
  const [hh, mm] = parseTime(time);
  const dow = okDow(day) ? day.dow : 1;
  const t = eventTimes(dow, hh, mm, day.minutes, now);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title || `we go gim: ${day.name}`, dates: `${t.start}/${t.end}`, details: details || '', recur: `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[dow]}` });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
