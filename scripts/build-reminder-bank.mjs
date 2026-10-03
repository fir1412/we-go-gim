import { themes } from '../content/reminders/source.mjs';
import { writeFileSync } from 'node:fs';
const bank = themes.flatMap(([theme, openings, closings]) => openings.flatMap((opening, o) => closings.map((closing, c) => ({
  id: `${theme}-${o + 1}-${c + 1}`, theme, text: `${opening} ${closing}`
}))));
if (bank.length !== 1000 || new Set(bank.map(r => r.text.toLowerCase())).size !== 1000) throw Error('Expected 1000 unique drafts');
const banned = /no excuses|burn fat|lose weight|push through pain|earn.*food|lazy|failure|guarantee|shred|beast mode|not .+, just/i;
for (const row of bank) if (row.text.length > 180 || banned.test(row.text)) throw Error(`Copy check failed: ${row.id}`);
writeFileSync('js/reminder-bank.js', '// Generated from content/reminders/source.mjs. 1,000 English drafts.\nexport const REMINDER_BANK = ' + JSON.stringify(bank, null, 2) + ';\n');
writeFileSync('content/reminders/drafts.md', '# 1,000 we go gim reminder drafts\n\nEnglish notification/share alternatives. See VOICE.md for source and review rules.\n\n' + bank.map((r, i) => `${i + 1}. **${r.theme}** — ${r.text}`).join('\n') + '\n');
console.log(`Built ${bank.length} unique drafts; longest ${Math.max(...bank.map(r => r.text.length))} characters.`);
