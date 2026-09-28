// The import corpus: 100+ made-up workout exports from many apps, formats, languages and encodings,
// with what a correct import finds in each. makeCorpus() writes the files (outside the repo, so they
// don't take space on C:) and returns the expectations. Every file is invented; none is anyone's real log.
// By hand: node tests/import-corpus/make.mjs [dir]
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

/** Where the files go: WGG_CORPUS_DIR, else D:\AI\claude-generated\... when there's a D: drive, else the temp folder. */
export const corpusDir = () => process.env.WGG_CORPUS_DIR || (existsSync('D:\\') ? 'D:\\AI\\claude-generated\\wegogim\\import-corpus' : join(tmpdir(), 'wegogim-import-corpus'));

export function makeCorpus(DIR = corpusDir()) {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  const expected = {};
  const enc = new TextEncoder();
  const put = (name, content, exp) => {
    writeFileSync(join(DIR, name), typeof content === 'string' ? enc.encode(content) : content);
    expected[name] = exp;
  };

  // Two sessions, 13 working sets in all.
  const S1 = { iso: '2026-09-21', name: 'Push', ex: [['Bench press', 60, 8, 3], ['Barbell squat', 80, 5, 3], ['Lat pulldown', 50, 10, 3]] };
  const S2 = { iso: '2026-09-23', name: 'Pull', ex: [['Deadlift', 100, 5, 1], ['Overhead press', 40, 6, 3]] };
  const BOTH = [S1, S2];
  const OK = { sessions: 2, sets: 13, date: '2026-09-21', check: { ex: 'bbbench', w: 60, r: 8 } };
  const noCheck = { sessions: 2, sets: 13, date: '2026-09-21' };
  const lbCheck = { ...OK, check: { ex: 'bbbench', w: 58.967, r: 8 } };
  const lbOf = w => Math.round(w / 0.45359237 / 5) * 5;

  // ---- text logs: one set notation per file ----------------------------------------------------------
  const NOTATION = {
    'n01-kg-x-reps-x-sets': (n, w, r, k) => [`${n} ${w}kg x ${r} x ${k}`],
    'n02-sets-x-reps-at': (n, w, r, k) => [`${n} ${k}x${r} @ ${w}kg`],
    'n03-kg-commas': (n, w, r, k) => [`${n} ${w}kg ${Array(k).fill(r).join(',')}`],
    'n04-kg-colon-slashes': (n, w, r, k) => [`${n} ${w} kg: ${Array(k).fill(r).join('/')}`],
    'n05-kg-spaces': (n, w, r, k) => [`${n} ${w}kg ${Array(k).fill(r).join(' ')}`],
    'n06-repeated-pairs': (n, w, r, k) => [`${n} ${Array(k).fill(`${w}x${r}`).join(', ')}`],
    'n07-unicode-times': (n, w, r, k) => [`${n} ${w} × ${r} × ${k}`],
    'n08-sets-of-at': (n, w, r, k) => [`${n} ${k} sets of ${r} at ${w}kg`],
    'n09-set-lines': (n, w, r, k) => [n, ...Array.from({ length: k }, (_, i) => `Set ${i + 1}: ${w}kg x ${r}`)],
    'n10-reps-at-lines': (n, w, r, k) => [n, ...Array(k).fill(`${r} reps @ ${w}kg`)],
    'n11-for-reps-lines': (n, w, r, k) => [n, ...Array(k).fill(`${w}kg for ${r} reps`)],
    'n12-no-spaces': (n, w, r, k) => [`${n} ${w}kgx${r}x${k}`],
    'n13-decimal-comma': (n, w, r, k) => [`${n} ${w},0kg x ${r} x ${k}`],
    'n14-bullets-colon': (n, w, r, k) => [`- ${n}: ${w}kg x ${r} x ${k}`],
    'n15-emoji': (n, w, r, k) => [`🏋️ ${n} ${w}kg x${r}x${k} 💪`],
    'n16-bare-numbers': (n, w, r, k) => [`${n} ${w} ${Array(k).fill(r).join(' ')}`],
    'n17-dash-sets-reps': (n, w, r, k) => [`${n} - ${w}kg - ${k} sets x ${r} reps`],
    'n18-rpe-lines': (n, w, r, k) => [n, ...Array(k).fill(`${w}kg x ${r} @8`)],
    'n19-numbered-sets': (n, w, r, k) => [n, ...Array.from({ length: k }, (_, i) => `${i + 1}. ${w}kg × ${r}`)],
    'n20-kilos-word': (n, w, r, k) => [`${n}: ${k} x ${r} with ${w} kilos`],
    'n21-reps-first-at': (n, w, r, k) => [`${n} ${k} sets ${r} reps ${w}kg`],
    'n22-tab-columns': (n, w, r, k) => [`${n}\t${w}kg\t${Array(k).fill(r).join('\t')}`],
  };
  const textLog = (fmt, dateOf = s => s.iso) => BOTH.map(s => [`${dateOf(s)} ${s.name}`, ...s.ex.flatMap(([n, w, r, k]) => fmt(n, w, r, k))].join('\n')).join('\n\n') + '\n';
  for (const [id, fmt] of Object.entries(NOTATION)) put(`${id}.txt`, textLog(fmt), { kind: 'text', ...OK });
  put('n23-lbs.txt', textLog((n, w, r, k) => [`${n} ${lbOf(w)} lbs x ${r} x ${k}`]), { kind: 'text', ...lbCheck });

  // ---- date styles ----------------------------------------------------------------------------------------------
  const kgx = NOTATION['n01-kg-x-reps-x-sets'];
  const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const parts = iso => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };
  const ord = d => d + (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th');
  const pad = n => String(n).padStart(2, '0');
  const DATES = {
    'd01-iso': s => s.iso,
    'd02-dmy-slash': s => { const p = parts(s.iso); return `${pad(p.d)}/${pad(p.m)}/${p.y}`; },
    'd03-us-mdy': s => { const p = parts(s.iso); return `${p.m}/${p.d}/${p.y}`; },
    'd04-mon-d-y': s => { const p = parts(s.iso); return `${M[p.m - 1].slice(0, 3)} ${p.d}, ${p.y}`; },
    'd05-d-month-y': s => { const p = parts(s.iso); return `${p.d} ${M[p.m - 1]} ${p.y}`; },
    'd06-weekday-ordinal': s => { const p = parts(s.iso); return `${DOW[p.dow]} ${ord(p.d)} ${M[p.m - 1]}`; },
    'd07-dotted-short': s => { const p = parts(s.iso); return `${DOW[p.dow].slice(0, 3)} ${p.d}.${p.m}.`; },
    'd08-d-mon-yy': s => { const p = parts(s.iso); return `${p.d}-${M[p.m - 1].slice(0, 3)}-${String(p.y).slice(2)}`; },
    'd09-iso-timestamp': s => `${s.iso}T18:02:11Z`,
    'd10-dmy-dots': s => { const p = parts(s.iso); return `${pad(p.d)}.${pad(p.m)}.${p.y}`; },
    'd11-long-us': s => { const p = parts(s.iso); return `${DOW[p.dow]}, ${M[p.m - 1]} ${p.d}, ${p.y}`; },
    'd12-md-heading': s => { const p = parts(s.iso); return `## ${p.d}/${p.m}`; },
    'd13-chinese': s => { const p = parts(s.iso); return `${p.y}年${p.m}月${p.d}日`; },
    'd14-sept-abbrev': s => { const p = parts(s.iso); return `${p.d} Sept ${p.y}`; },
  };
  for (const [id, dateOf] of Object.entries(DATES)) put(`${id}.txt`, textLog(kgx, dateOf), { kind: 'text', ...OK });

  // ---- where the text came from ---------------------------------------------------------------------------------
  const lines = s => s.ex.flatMap(([n, w, r, k]) => kgx(n, w, r, k));
  const dmy = DATES['d02-dmy-slash'], long = DATES['d05-d-month-y'];
  put('s01-whatsapp-ios.txt', BOTH.flatMap(s => lines(s).map((l, i) => `[${dmy(s)}, 18:${pad(2 + i)}:11] Sam: ${l}`)).join('\n') + '\n', { kind: 'text', ...OK });
  put('s02-whatsapp-android.txt', BOTH.flatMap(s => lines(s).map((l, i) => `${dmy(s)}, 18:${pad(2 + i)} - Sam: ${l}`)).join('\n') + '\n', { kind: 'text', ...OK });
  put('s03-telegram-export.html', `<!DOCTYPE html><html><head><title>Exported Data</title><style>.x{}</style></head><body><div class="history">${BOTH.map(s => `<div class="message service"><div class="body details">${long(s)}</div></div>${lines(s).map(l => `<div class="message default"><div class="body"><div class="from_name">Sam</div><div class="text">${l}</div></div></div>`).join('')}`).join('')}</div></body></html>`, { kind: 'html', ...OK });
  put('s04-notion-table.md', BOTH.map(s => `# ${s.iso} ${s.name}\n\n| Exercise | Weight | Reps | Sets |\n| --- | --- | --- | --- |\n${s.ex.map(([n, w, r, k]) => `| ${n} | ${w}kg | ${r} | ${k} |`).join('\n')}`).join('\n\n') + '\n', { kind: 'text', ...OK });
  put('s05-notion-export.html', `<html><head><meta charset="utf-8"><title>Gym log</title></head><body><article>${BOTH.map(s => `<h1>${s.iso} ${s.name}</h1><ul>${lines(s).map(l => `<li>${l}</li>`).join('')}</ul>`).join('')}</article></body></html>`, { kind: 'html', ...OK });
  put('s06-obsidian.md', BOTH.map(s => `# ${s.iso}\n\n## ${s.name}\n${lines(s).map(l => `- ${l}`).join('\n')}\n\n#gym #training`).join('\n\n') + '\n', { kind: 'text', ...OK });
  put('s07-evernote.enex', `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export3.dtd">\n<en-export>${BOTH.map(s => `<note><title>${s.name} ${dmy(s)}</title><content><![CDATA[<?xml version="1.0" encoding="UTF-8"?><en-note><div>${dmy(s)}</div>${lines(s).map(l => `<div>${l}</div>`).join('')}</en-note>]]></content></note>`).join('')}</en-export>\n`, { kind: 'html', ...OK });
  put('s08-apple-notes.txt', BOTH.map(s => `${long(s)}\n${lines(s).map(l => `• ${l}`).join('\n')}`).join('\n\n') + '\n', { kind: 'text', ...OK });
  put('s09-google-keep.txt', BOTH.map(s => `${s.name} – ${dmy(s)}\n\n${lines(s).map(l => `☐ ${l}`).join('\n')}`).join('\n\n\n') + '\n', { kind: 'text', ...OK });
  put('s10-google-docs.html', `<html><head><meta content="text/html; charset=UTF-8" http-equiv="content-type"><style type="text/css">.c1{color:#000}</style></head><body class="c1">${BOTH.map(s => `<p class="c2"><span class="c0">${dmy(s)} ${s.name}</span></p>${lines(s).map(l => `<p class="c2"><span class="c0">${l.replace(/ /g, '&nbsp;')}</span></p>`).join('')}<p class="c2"><span class="c0"></span></p>`).join('')}</body></html>`, { kind: 'html', ...OK });
  put('s11-textedit.rtf', `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2761\n{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica;}\n{\\colortbl;\\red255\\green255\\blue255;}\n\\paperw11900\\paperh16840\\margl1440\\margr1440\\vieww11520\\viewh8400\\viewkind0\n\\pard\\tx566\\pardirnatural\\partightenfactor0\n\n\\f0\\fs24 \\cf0 ${BOTH.map(s => [dmy(s) + ' ' + s.name, ...lines(s)].join('\\\n')).join('\\\n\\\n')}}`, { kind: 'rtf', ...OK });
  put('s12-wordpad.rtf', `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fnil Calibri;}}{\\*\\generator Riched20 10.0.19041}\\viewkind4\\uc1 \n${BOTH.map(s => [`\\pard\\sa200\\sl276\\slmult1\\f0\\fs22\\lang9 ${dmy(s)} ${s.name}\\par`, ...lines(s).map(l => l.replace(/ x /g, " \\'d7 ") + '\\par')].join('\n')).join('\n')}\n}`, { kind: 'rtf', ...OK });
  put('s13-onenote.html', `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body lang="en-GB"><div style="position:absolute">${BOTH.map(s => `<p style="margin:0in"><b>${dmy(s)}</b></p>${lines(s).map(l => `<p style="margin:0in;font-family:Calibri">${l}</p>`).join('')}<p style="margin:0in">&nbsp;</p>`).join('')}</div></body></html>`, { kind: 'html', ...OK });
  put('s14-coach-email.eml', `From: Coach Sam <coach@example.com>\nTo: me@example.com\nDate: Mon, 28 Sep 2026 07:15:00 +0800\nSubject: Your logged sessions\nContent-Type: text/plain; charset=UTF-8\n\nHi! Here's what you did:\n\n${BOTH.map(s => [dmy(s), ...lines(s)].join('\n')).join('\n\n')}\n\nKeep it up,\nSam\n`, { kind: 'text', ...OK });
  put('s15-coach-table-sets-reps-weight.txt', BOTH.map(s => [`${dmy(s)} ${s.name}`, 'Exercise | Sets | Reps | Weight', ...s.ex.map(([n, w, r, k]) => `${n} | ${k} | ${r} | ${w}kg`)].join('\n')).join('\n\n') + '\n', { kind: 'text', ...OK });
  put('s16-samsung-notes.txt', BOTH.map(s => [`${DOW[parts(s.iso).dow]}, ${long(s)} 6:02 PM`, ...lines(s)].join('\r\n')).join('\r\n\r\n') + '\r\n', { kind: 'text', ...OK });
  put('s17-discord.txt', BOTH.map(s => [`Sam — ${dmy(s)} 6:02 PM`, ...lines(s)].join('\n')).join('\n') + '\n', { kind: 'text', ...OK });
  put('s18-sms-backup.xml', `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\n<smses count="2">${BOTH.map(s => `<sms protocol="0" address="+60123456789" date="1790000000000" type="2" body="${[dmy(s), ...lines(s)].join('&#10;')}" readable_date="${dmy(s)}" contact_name="Gym buddy" />`).join('\n')}</smses>\n`, { kind: 'html', ...noCheck });

  // ---- other languages -------------------------------------------------------------------------------------------------
  const LANG = {
    'l01-german': [['Bankdrücken', 'Kniebeugen', 'Latzug', 'Kreuzheben', 'Schulterdrücken'], 'bbbench', DATES['d10-dmy-dots']],
    'l02-spanish': [['Press banca', 'Sentadilla', 'Jalón al pecho', 'Peso muerto', 'Press militar'], 'bbbench', dmy],
    'l03-french': [['Développé couché', 'Squat', 'Tirage vertical', 'Soulevé de terre', 'Développé militaire'], 'bbbench', dmy],
    'l04-portuguese': [['Supino reto', 'Agachamento', 'Puxada frontal', 'Levantamento terra', 'Desenvolvimento'], 'bbbench', dmy],
    'l05-italian': [['Panca piana', 'Squat', 'Lat machine', 'Stacco da terra', 'Lento avanti'], 'bbbench', dmy],
    'l06-malay-mixed': [['Bench press', 'Barbell squat', 'Lat pulldown', 'Deadlift', 'Overhead press'], 'bbbench', s => `${['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'][parts(s.iso).dow]} ${parts(s.iso).d}/${parts(s.iso).m}/${parts(s.iso).y}`],
    'l07-chinese': [['卧推', '深蹲', '高位下拉', '硬拉', '推举'], null, DATES['d13-chinese']],
  };
  for (const [id, [names, first, date]] of Object.entries(LANG)) {
    let i = 0;
    const rename = s => ({ ...s, ex: s.ex.map(e => [names[i++], ...e.slice(1)]) });
    const S = [rename(S1), rename(S2)];
    const fmt = id === 'l06-malay-mixed' ? (n, w, r, k) => [`${n} ${w}kg ${k} set x ${r} ulangan`] : kgx;
    put(`${id}.txt`, S.map(s => [date(s), ...s.ex.flatMap(([n, w, r, k]) => fmt(n, w, r, k))].join('\n')).join('\n\n') + '\n', { kind: 'text', ...noCheck, ...(first ? { check: { ex: first, w: 60, r: 8 } } : {}) });
  }

  // ---- CSV exports from apps and spreadsheets ------------------------------------------------------------------------
  const q = v => (/[",;\t\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = (rows, d = ',') => rows.map(r => r.map(q).join(d)).join('\n') + '\n';
  const eachSet = fn => BOTH.flatMap(s => s.ex.flatMap(([n, w, r, k]) => Array.from({ length: k }, (_, i) => fn(s, n, w, r, i))));
  const APP = { 'Bench press': 'Bench Press (Barbell)', 'Barbell squat': 'Squat (Barbell)', 'Lat pulldown': 'Lat Pulldown (Cable)', Deadlift: 'Deadlift (Barbell)', 'Overhead press': 'Overhead Press (Barbell)' };
  const hevyDate = s => { const p = parts(s.iso); return `${p.d} ${M[p.m - 1].slice(0, 3)} ${p.y}, 18:02`; };
  const HEVY_HEAD = ['title', 'start_time', 'end_time', 'description', 'exercise_title', 'superset_id', 'exercise_notes', 'set_index', 'set_type', 'weight_kg', 'reps', 'distance_km', 'duration_seconds', 'rpe'];
  put('c01-hevy.csv', csv([HEVY_HEAD, ...BOTH.flatMap(s => s.ex.flatMap(([n, w, r, k]) => [[s.name, hevyDate(s), hevyDate(s), '', APP[n], '', '', 0, 'warmup', w / 2, 10, '', '', ''], ...Array.from({ length: k }, (_, i) => [s.name, hevyDate(s), hevyDate(s), '', APP[n], '', '', i + 1, 'normal', w, r, '', '', 8])]))]), { kind: 'csv', ...OK });
  put('c02-hevy-lbs.csv', csv([HEVY_HEAD.map(h => h === 'weight_kg' ? 'weight_lbs' : h === 'distance_km' ? 'distance_miles' : h), ...eachSet((s, n, w, r, i) => [s.name, hevyDate(s), hevyDate(s), '', APP[n], '', '', i, 'normal', lbOf(w), r, '', '', ''])]), { kind: 'csv', ...lbCheck });
  const STRONG_HEAD = ['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE'];
  put('c03-strong.csv', csv([STRONG_HEAD, ...eachSet((s, n, w, r, i) => [`${s.iso} 18:02:11`, s.name, '1h 2m', APP[n], i + 1, w, r, 0, 0, '', '', ''])]), { kind: 'csv', ...OK });
  put('c04-strong-eu-semicolon.csv', csv([STRONG_HEAD, ...eachSet((s, n, w, r, i) => [`${s.iso} 18:02:11`, s.name, '1h 2m', APP[n], i + 1, String(w === 60 ? 62.5 : w).replace('.', ','), r, 0, 0, '', '', ''])], ';'), { kind: 'csv', ...OK, check: { ex: 'bbbench', w: 62.5, r: 8 } });
  put('c05-fitnotes.csv', csv([['Date', 'Exercise', 'Category', 'Weight (kgs)', 'Reps', 'Distance', 'Distance Unit', 'Time', 'Comment'], ...eachSet((s, n, w, r) => [s.iso, n === 'Bench press' ? 'Flat Barbell Bench Press' : n, 'Chest', w.toFixed(1), r, '', '', '', ''])]), { kind: 'csv', ...OK });
  put('c06-fitnotes-lbs.csv', csv([['Date', 'Exercise', 'Category', 'Weight (lbs)', 'Reps', 'Distance', 'Distance Unit', 'Time', 'Comment'], ...eachSet((s, n, w, r) => [s.iso, n === 'Bench press' ? 'Flat Barbell Bench Press' : n, 'Chest', lbOf(w).toFixed(1), r, '', '', '', ''])]), { kind: 'csv', ...lbCheck });
  put('c07-fitbod.csv', csv([['Date', 'Exercise', 'Reps', 'Weight(kg)', 'Duration(s)', 'Distance(m)', 'Incline', 'Resistance', 'isWarmup', 'Note', 'multiplier'], ...eachSet((s, n, w, r) => [`${s.iso} 18:02:11 +0000`, APP[n].replace(/ \((Barbell|Cable)\)/, ''), r, w, 0, 0, 0, 0, 'false', '', 1])]), { kind: 'csv', ...OK, check: { ex: 'bbbench', w: 60, r: 8 } });
  put('c08-jefit.csv', `### EXERCISE LOGS ###\n_id,mydate,eid,ename,logs\n${BOTH.flatMap(s => s.ex.map(([n, w, r, k], i) => `${i + 1},${s.iso},${100 + i},${n},"${Array(k).fill(`${w}x${r}`).join(',')}"`)).join('\n')}\n`, { kind: 'any', ...OK });
  put('c09-gymbook-german.csv', csv([['Datum', 'Zeit', 'Training', 'Übung', 'Satz', 'Wdh.', 'Gewicht (kg)'], ...eachSet((s, n, w, r, i) => [DATES['d10-dmy-dots'](s), '18:02', s.name, n, i + 1, r, String(w).replace('.', ',')])], ';'), { kind: 'csv', ...OK });
  const simple = (dateOf, d = ',') => csv([['Date', 'Exercise', 'Weight', 'Reps'], ...eachSet((s, n, w, r) => [dateOf(s), n, w, r])], d);
  put('c10-sheets-dmy.csv', simple(dmy), { kind: 'csv', ...OK });
  put('c11-excel-us.csv', simple(DATES['d03-us-mdy']), { kind: 'csv', ...OK });
  const serial = iso => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 864e5);
  put('c12-excel-serial-dates.csv', simple(s => serial(s.iso)), { kind: 'csv', ...OK });
  put('c13-sheet.tsv', simple(s => s.iso, '\t'), { kind: 'csv', ...OK });
  put('c14-sheet-crlf.csv', simple(s => s.iso).replace(/\n/g, '\r\n'), { kind: 'csv', ...OK });
  put('c15-sheet-bom.csv', '\uFEFF' + simple(s => s.iso), { kind: 'csv', ...OK });
  const utf16 = (str, be = false, bom = true) => { const o = bom ? 2 : 0, b = new Uint8Array(o + str.length * 2); if (bom) { b[0] = be ? 0xfe : 0xff; b[1] = be ? 0xff : 0xfe; } for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); b[o + 2 * i + (be ? 1 : 0)] = c & 255; b[o + 2 * i + (be ? 0 : 1)] = c >> 8; } return b; };
  put('c16-excel-unicode-text.txt', utf16(simple(s => s.iso, '\t').replace(/\n/g, '\r\n')), { kind: 'csv', ...OK });
  put('c17-one-row-per-exercise.csv', csv([['Date', 'Exercise', 'Sets', 'Reps', 'Weight'], ...BOTH.flatMap(s => s.ex.map(([n, w, r, k]) => [s.iso, n, k, r, w]))]), { kind: 'csv', ...OK });
  put('c18-wide-set-columns.csv', csv([['Date', 'Exercise', 'Set 1', 'Set 2', 'Set 3'], ...BOTH.flatMap(s => s.ex.map(([n, w, r, k]) => [s.iso, n, ...Array.from({ length: 3 }, (_, i) => (i < k ? `${w}x${r}` : ''))]))]), { kind: 'any', ...OK });
  put('c19-unit-column-lbs.csv', csv([['Date', 'Exercise', 'Weight', 'Unit', 'Reps'], ...eachSet((s, n, w, r) => [s.iso, n, lbOf(w), 'lbs', r])]), { kind: 'csv', ...lbCheck });
  put('c20-Strength_2026-09-21.csv', csv([['Set', 'Exercise Name', 'Time', 'Rest', 'Reps', 'Weight', 'Volume'], ...S1.ex.flatMap(([n, w, r, k]) => Array.from({ length: k }, (_, i) => [i + 1, n.toUpperCase().replace(/ /g, '_'), '0:45', '2:00', r, `${w} kg`, `${w * r} kg`]))]), { kind: 'any', sessions: 1, sets: 9, date: '2026-09-21', note: 'Garmin: the date is only in the file name' });
  put('c21-myfitnesspal.csv', csv([['Date', 'Exercise Name', 'Sets', 'Reps Per Set', 'Weight Per Set'], ...BOTH.flatMap(s => s.ex.map(([n, w, r, k]) => [s.iso, n, k, r, w]))]), { kind: 'csv', ...OK });
  put('c22-stronglifts.csv', csv([['Date', 'Workout', 'Exercise', 'Weight (kg)', 'Set 1', 'Set 2', 'Set 3'], ...BOTH.flatMap(s => s.ex.map(([n, w, r, k]) => [s.iso, s.name, n, w, ...Array.from({ length: 3 }, (_, i) => (i < k ? r : ''))]))]), { kind: 'csv', ...OK });
  put('c23-rpe-column.csv', csv([['Date', 'Exercise', 'Weight', 'Reps', 'RPE'], ...eachSet((s, n, w, r) => [s.iso, n, w, r, 8])]), { kind: 'csv', ...OK });
  put('c24-quoted-commas.csv', csv([['Date', 'Exercise', 'Weight', 'Reps', 'Notes'], ...eachSet((s, n, w, r) => [s.iso, n, w, r, 'felt good, "easy"'])]), { kind: 'csv', ...OK });
  put('c25-date-time-12h.csv', simple(s => `${DATES['d03-us-mdy'](s)} 6:02 PM`), { kind: 'csv', ...OK });
  put('c26-kg-suffix-cells.csv', csv([['Date', 'Exercise', 'Weight', 'Reps'], ...eachSet((s, n, w, r) => [s.iso, n, `${w} kg`, `${r} reps`])]), { kind: 'csv', ...OK });

  // ---- encodings and line endings ----------------------------------------------------------------------------------
  const plain = textLog(kgx);
  put('e01-utf16le-bom.txt', utf16(plain), { kind: 'text', ...OK });
  put('e02-utf16le-no-bom.txt', utf16(plain, false, false), { kind: 'text', ...OK });
  put('e03-utf16be-bom.txt', utf16(plain, true), { kind: 'text', ...OK });
  put('e04-windows-1252-times.txt', Uint8Array.from([...textLog((n, w, r, k) => [`${n} ${w}kg \u00d7 ${r} \u00d7 ${k}`])].map(c => c.charCodeAt(0) & 255)), { kind: 'text', ...OK });
  put('e05-old-mac-cr.txt', plain.replace(/\n/g, '\r'), { kind: 'text', ...OK });
  put('e06-nbsp-and-trailing.txt', plain.replace(/ /g, '\u00a0').replace(/\n/g, '   \n'), { kind: 'text', ...OK });
  put('e07-utf8-bom.txt', '\uFEFF' + plain, { kind: 'text', ...OK });
  const many = [];
  for (let i = 0; i < 400; i++) many.push(`${new Date(Date.UTC(2023, 0, 2) + i * 2 * 864e5).toISOString().slice(0, 10)} Session\nBench press ${40 + (i % 30)}kg x 8 x 3\nBarbell squat ${60 + (i % 40)}kg x 5 x 3`);
  put('e08-big-400-sessions.txt', many.join('\n\n') + '\n', { kind: 'text', sessions: 400, sets: 2400, date: '2023-01-02' });

  // ---- edge cases -------------------------------------------------------------------------------------------------------------
  put('x01-empty.txt', '', { kind: 'text', sessions: 0, sets: 0 });
  put('x02-header-only.csv', 'Date,Exercise,Weight,Reps\n', { kind: 'any', sessions: 0, sets: 0 });
  put('x03-duplicate-copy.txt', plain + '\n' + plain, { kind: 'text', ...OK });
  put('x04-bodyweight.txt', `2026-09-21 Pull\nPull-up BW x 8 x 3\nPush-up BW 20, 20, 15\nDips BW +10kg x 6\n`, { kind: 'text', sessions: 1, sets: 7, date: '2026-09-21', check: { ex: 'pullup', w: 0, r: 8 } });
  put('x05-pain-remarks.txt', `2026-09-21 Push\nBench press 60kg x 8 x 3 (left shoulder sore on the last set)\nfelt heavy today, slept 5h\nBarbell squat 80kg x 5 x 3\n`, { kind: 'text', sessions: 1, sets: 6, date: '2026-09-21', pain: 'bbbench' });
  put('x06-cardio-mixed-in.txt', `2026-09-21 Push\nTreadmill 20 min incline 10\nBench press 60kg x 8 x 3\nStairmaster 10 min\n`, { kind: 'text', sessions: 1, sets: 3, date: '2026-09-21', check: { ex: 'bbbench', w: 60, r: 8 } });
  put('x07-mixed-kg-lb.txt', `2026-09-21 Push\nBench press 135 lbs x 8 x 3\nLat pulldown 50kg x 10 x 3\n`, { kind: 'text', sessions: 1, sets: 6, date: '2026-09-21', check: { ex: 'bbbench', w: 61.235, r: 8 } });
  put('x08-plank-seconds.txt', `2026-09-21 Core\nPlank 60s x 3\nCable crunch L6 x 15 x 3\n`, { kind: 'text', sessions: 1, sets: 6, date: '2026-09-21' });
  put('x09-no-dates.txt', `Bench press 60kg x 8 x 3\nBarbell squat 80kg x 5 x 3\n`, { kind: 'text', sessions: 0, sets: 0, note: 'no date anywhere, so nothing to place it on' });
  put('x10-future-date.txt', `2027-09-21 Push\nBench press 60kg x 8 x 3\n`, { kind: 'text', sessions: 1, sets: 3, date: '2027-09-21' });
  put('x11-dumbbells-each.txt', `2026-09-21 Push\nDB bench press 25kg each x 10 x 3\nDB shoulder press 16kg ea 10, 9, 8\n`, { kind: 'text', sessions: 1, sets: 6, date: '2026-09-21', check: { ex: 'bench', w: 25, r: 10 } });
  put('x12-machine-levels.txt', `2026-09-21 Pull\nSeated cable row L9 x 12 x 3\nFace pull level 5: 15, 15, 12\n`, { kind: 'text', sessions: 1, sets: 6, date: '2026-09-21' });

  // ---- files to turn away, with a helpful reason ---------------------------------------------------------------------------
  const bin = (...b) => Uint8Array.from(b);
  const zip = bin(0x50, 0x4b, 3, 4, 20, 0, 6, 0, 8, 0, 0, 0);
  put('r01-photo.jpg', bin(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1), { kind: 'reject', why: 'photo' });
  put('r02-screenshot.png', bin(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13), { kind: 'reject', why: 'photo' });
  put('r03-iphone-photo.heic', bin(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63), { kind: 'reject', why: 'photo' });
  put('r04-log.xlsx', zip, { kind: 'reject', why: 'CSV' });
  put('r05-log.docx', zip, { kind: 'reject', why: 'plain text' });
  put('r06-log.numbers', zip, { kind: 'reject', why: 'CSV' });
  put('r07-old-excel.xls', bin(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0), { kind: 'reject', why: 'CSV' });
  put('r08-exports.zip', zip, { kind: 'reject', why: 'Unzip' });
  put('r09-run.gpx', `<?xml version="1.0"?><gpx version="1.1" creator="Strava"><trk><name>Morning run</name></trk></gpx>`, { kind: 'reject', why: 'Cardio' });
  put('r10-ride.tcx', `<?xml version="1.0"?><TrainingCenterDatabase><Activities/></TrainingCenterDatabase>`, { kind: 'reject', why: 'Cardio' });
  put('r11-other-app.json', JSON.stringify({ workouts: [{ date: '2026-09-21', exercises: [{ name: 'Bench', sets: [{ kg: 60, reps: 8 }] }] }] }), { kind: 'reject', why: 'another app' });
  put('r12-wegogim-backup.json', JSON.stringify({ app: 'setlist', version: 1, sessions: [] }), { kind: 'backup' });
  put('r13-voice-note.m4a', bin(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20), { kind: 'reject', why: 'not a workout log' });
  put('r14-log.odt', zip, { kind: 'reject', why: 'plain text' });
  put('r15-coach-plan.pdf', '%PDF-1.4\n1 0 obj<<>>endobj\n', { kind: 'pdf' });
  put('r16-json-array.txt', JSON.stringify([{ date: '2026-09-21', lift: 'bench', kg: 60 }]), { kind: 'reject', why: 'another app' });

  writeFileSync(join(DIR, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
  return { dir: DIR, expected };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { dir, expected } = makeCorpus(process.argv[2]);
  console.log(`${Object.keys(expected).length} files written to ${dir}`);
}
