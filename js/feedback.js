// In-app feedback, delivered to the developer's Google Form. Only what the user types (plus app
// version, device type and current screen) is sent; nothing from their workout data.
import { S, saveSettings } from './state.js';
import { esc, openSheet, closeSheet, toast } from './ui.js';

const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSf4dXE3MAv2QBqA2vImim-I5mPMAOYKynjETzDyXT19wXh9hw/formResponse';
const F = { type: 'entry.1924204516', message: 'entry.1654840080', contact: 'entry.299429769', info: 'entry.796536086' };
const TYPES = ['Bug', 'Idea', 'Other'];

/** "we go gim 1.2.0 · Android · Chrome · installed · #/workout" */
function appInfo(version) {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Other';
  const br = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'Other';
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'installed' : 'browser';
  return `we go gim ${version} · ${os} · ${br} · ${installed} · #/${location.hash.replace(/^#\/?/, '').split('/')[0] || 'today'}`;
}

async function post(item) {
  const body = new URLSearchParams({ [F.type]: item.type, [F.message]: item.message, [F.contact]: item.contact || '', [F.info]: item.info });
  // Google Forms doesn't allow reading the reply from another site; a network error is the only failure we can see.
  await fetch(FORM, { method: 'POST', mode: 'no-cors', body });
}

/** Send anything that was written while offline. */
export async function flushFeedback() {
  const q = S.settings?.feedbackQueue || [];
  if (!q.length || !navigator.onLine) return;
  const left = [];
  for (const item of q) { try { await post(item); } catch { left.push(item); } }
  await saveSettings({ feedbackQueue: left });
  if (left.length < q.length) toast(`Sent ${q.length - left.length} saved feedback message${q.length - left.length === 1 ? '' : 's'}`, 'up');
}
window.addEventListener('online', () => { flushFeedback().catch(() => {}); });

export function openFeedback(version, preset = 'Idea') {
  let type = preset;
  const info = appInfo(version);
  const sheet = openSheet(`<h2 class="sh-title">Send feedback</h2>
    <p class="sh-body">Found a bug or have an idea? It goes straight to the developer.</p>
    <div class="seg fb-type" role="group" aria-label="Feedback type">${TYPES.map(t => `<button data-fb="${t}" aria-pressed="${t === type}">${t}</button>`).join('')}</div>
    <label class="field"><span>Message</span><textarea class="inp" id="fb-msg" rows="5" maxlength="4000" placeholder="What happened, or what would make the app better?" autofocus></textarea></label>
    <label class="field"><span>Contact (optional)</span><input class="inp" id="fb-contact" maxlength="200" placeholder="Email or handle, if you'd like a reply" autocomplete="email"></label>
    <p class="fine">Also sent: <b>${esc(info)}</b>. Nothing from your workouts or body data is included. Replies aren't possible without contact details.</p>
    <div class="row2"><button class="btn ghost" data-fb-x="cancel">Cancel</button><button class="btn" data-fb-x="send">Send</button></div>`, { label: 'Send feedback' });
  sheet.addEventListener('click', async e => {
    const t = e.target.closest('[data-fb]');
    if (t) {
      type = t.dataset.fb;
      for (const b of sheet.querySelectorAll('[data-fb]')) b.setAttribute('aria-pressed', b.dataset.fb === type);
      return;
    }
    const x = e.target.closest('[data-fb-x]');
    if (!x) return;
    if (x.dataset.fbX === 'cancel') return closeSheet();
    const message = sheet.querySelector('#fb-msg').value.trim();
    if (message.length < 3) return toast('Write a short message first', 'flat');
    // Spam guard: one message a minute, ten a day (per phone).
    const now = Date.now(), sent = (S.settings.feedbackSent || []).filter(t => now - t < 864e5);
    if (sent.length && now - sent[sent.length - 1] < 60000) return toast('Thanks! Please wait a minute before sending another.', 'flat');
    if (sent.length >= 10) return toast("That's the limit for today. Thank you for all the feedback!", 'flat');
    await saveSettings({ feedbackSent: [...sent, now] });
    const item = { type, message, contact: sheet.querySelector('#fb-contact').value.trim(), info, at: new Date().toISOString() };
    x.disabled = true;
    try {
      if (!navigator.onLine) throw new Error('offline');
      await post(item);
      closeSheet();
      toast('Thanks! Feedback sent.', 'up');
    } catch {
      await saveSettings({ feedbackQueue: [...(S.settings.feedbackQueue || []), item].slice(-20) });
      closeSheet();
      toast("You're offline. It'll send automatically when you're back online.", 'flat');
    }
  });
}
