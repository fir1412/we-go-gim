import { REMINDER_BANK } from './reminder-bank.js';

export function reminderText(index = Math.floor(Math.random() * REMINDER_BANK.length)) {
  return REMINDER_BANK[((index % REMINDER_BANK.length) + REMINDER_BANK.length) % REMINDER_BANK.length].text;
}

/** A bounded local-calendar schedule; each app visit renews the next four weeks. */
export function trainingReminders(state, now = new Date()) {
  const settings = state.settings || {};
  if (!settings.trainingReminders || !settings.onboarded || settings.sample) return [];
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(settings.remindAt || '') ? settings.remindAt : '18:00';
  const [hour, minute] = time.split(':').map(Number);
  const days = new Set((state.program?.days || []).filter(d => d.slots?.length).map(d => d.dow));
  const logged = new Set((state.sessions || []).filter(s => !s.seed).map(s => s.date));
  const notifications = [];
  for (let i = 0; i < 28; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute);
    const iso = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
    if (at <= now || !days.has(at.getDay()) || logged.has(iso)) continue;
    const number = Math.floor(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) / 86400000);
    notifications.push({ id: 2000 + i, at: at.getTime(), body: settings.trainingReminderText?.trim().slice(0, 180) || reminderText(number * 347) });
  }
  return notifications;
}

export function syncTrainingReminders(state) {
  if (!globalThis.gimNative?.trainingNotifications) return;
  return globalThis.gimNative.trainingNotifications(trainingReminders(state));
}
