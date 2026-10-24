/* KOYOMI (v3) — state, dates, and the rescheduler.
   Plain script (no modules) so it also runs in Node for tests. */

const KEY = 'koyomi-v3';
const OLD_KEY = 'discipline-engine-v1';

/* ------------------------------ dates -------------------------------- */
const p2 = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const todayKey = (now = Date.now()) => dateKey(new Date(now));
function shiftDate(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}
function toMs(date, hhmm) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = (hhmm || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, h, mi).getTime();
}
const startMs = e => toMs(e.date, e.start);
const endMs = e => startMs(e) + (e.dur || 30) * 60000;
const hhmm = ms => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const uid = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ------------------------------ state -------------------------------- */
function defaults() {
  return {
    v: 3,
    events: [],   // {id,title,date,start,dur,note,done,gate,fixed,series,moved,skipped}
    settings: { geminiKey: '', model: '', ntfyTopic: '', dayStart: '10:00', dayEnd: '23:30',
      voice: true, voiceName: '', humanVoice: 'Kore', ttsModel: '', convo: false },
    chat: [],     // [{who:'me'|'ai', text}]
    sent: {},     // eventId -> reminder time (ms) queued on ntfy
    undo: null,   // events snapshot before the last bulk change
  };
}

let S = defaults();
function load(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw), base = defaults();
      S = { ...base, ...p, settings: { ...base.settings, ...(p.settings || {}) } };
      return S;
    }
    // first run: carry the ntfy topic and Gemini key over from v2
    const old = JSON.parse(storage.getItem(OLD_KEY) || 'null');
    if (old && old.settings) {
      S.settings.ntfyTopic = old.settings.ntfyTopic || '';
      S.settings.geminiKey = old.settings.geminiKey || '';
    }
  } catch (e) { console.error('[koyomi] load failed', e); }
  return S;
}
let storageRef = null, saveError = '';
function save() {
  if (!storageRef) return;
  try { storageRef.setItem(KEY, JSON.stringify(S)); saveError = ''; }
  catch (e) { saveError = 'Could not save. Export a backup in Setup.'; }
}

/* ----------------------------- queries ------------------------------- */
const live = e => !e.done && !e.skipped;
function eventsOn(date) {
  return S.events.filter(e => e.date === date && !e.skipped).sort((a, b) => a.start.localeCompare(b.start));
}
function inRange(from, to) {
  return S.events.filter(e => e.date >= from && e.date <= to && !e.skipped)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}
/* Missed = an unfinished task whose end passed. Fixed blocks (sleep, dinner) never count. */
function missed(now = Date.now()) {
  const floor = shiftDate(todayKey(now), -14);
  return S.events.filter(e => live(e) && !e.fixed && e.date >= floor && endMs(e) < now)
    .sort((a, b) => (b.gate - a.gate) || startMs(a) - startMs(b));
}
function nextUp(now = Date.now()) {
  return S.events.filter(e => live(e) && !e.fixed && endMs(e) >= now)
    .sort((a, b) => startMs(a) - startMs(b))[0] || null;
}
function gateFor(date) { return eventsOn(date).find(e => e.gate) || null; }
function gateStreak(now = Date.now()) {
  let n = 0, d = todayKey(now);
  const g0 = gateFor(d);
  if (!g0 || !g0.done) d = shiftDate(d, -1);      // today still open does not break it
  for (let i = 0; i < 365; i++, d = shiftDate(d, -1)) {
    const g = gateFor(d); if (g && g.done) n++; else break;
  }
  return n;
}

/* ----------------------------- changes ------------------------------- */
function snapshot() { S.undo = JSON.parse(JSON.stringify(S.events)); }
function undo() { if (!S.undo) return false; S.events = S.undo; S.undo = null; save(); return true; }

function addEvent(f) {
  const e = { id: uid(), title: String(f.title || 'Untitled').slice(0, 140), date: f.date, start: f.start || '12:00',
    dur: Math.max(5, Math.min(720, Number(f.dur) || 30)), note: f.note || '', done: false,
    gate: !!f.gate, fixed: !!f.fixed, series: f.series || null, moved: 0 };
  if (e.gate) S.events.forEach(x => { if (x.date === e.date) x.gate = false; });
  S.events.push(e); save(); return e;
}
function updateEvent(id, f) {
  const e = S.events.find(x => x.id === id); if (!e) return null;
  const moving = (f.date && f.date !== e.date) || (f.start && f.start !== e.start);
  for (const k of ['title', 'date', 'start', 'note']) if (f[k] != null) e[k] = String(f[k]);
  if (f.dur != null) e.dur = Math.max(5, Math.min(720, Number(f.dur) || e.dur));
  for (const k of ['done', 'fixed']) if (f[k] != null) e[k] = !!f[k];
  if (f.gate != null) { if (f.gate) S.events.forEach(x => { if (x.date === e.date) x.gate = false; }); e.gate = !!f.gate; }
  if (moving) { e.moved = (e.moved || 0) + 1; e.skipped = false; }
  save(); return e;
}
function deleteEvent(id) {
  const i = S.events.findIndex(x => x.id === id); if (i < 0) return false;
  S.events.splice(i, 1); save(); return true;
}

/* --------------------------- free slots ------------------------------
   Walks the waking window day by day and returns the first gap that
   fits, keeping a 10-minute breath between things. */
function findSlot(dur, fromMs, ignoreId, maxDays = 14) {
  const gap = 10 * 60000, step = 15 * 60000;
  const busy = S.events.filter(e => !e.skipped && !e.done && e.id !== ignoreId)
    .map(e => [startMs(e), endMs(e)]).sort((a, b) => a[0] - b[0]);
  const roundSlot = ms => { let t = Math.ceil(ms / step) * step; while (toMs(todayKey(t), hhmm(t)) !== t) t += step; return t; };  // skips DST-ambiguous times
  const overnight = S.settings.dayEnd <= S.settings.dayStart;
  let day = todayKey(fromMs);
  if (overnight && fromMs < toMs(day, S.settings.dayEnd)) day = shiftDate(day, -1);
  for (let i = 0; i < maxDays; i++, day = shiftDate(day, 1)) {
    const winA = toMs(day, S.settings.dayStart);
    const winB = toMs(overnight ? shiftDate(day, 1) : day, S.settings.dayEnd);
    let t = roundSlot(Math.max(winA, fromMs));
    for (const [a, b] of busy) {
      if (b + gap <= t) continue;
      if (a >= winB) break;
      if (t + dur * 60000 + gap <= a) break;
      t = roundSlot(b + gap);
    }
    if (t + dur * 60000 <= winB) return t;
  }
  return null;
}

/* ---------------------------- reschedule -----------------------------
   Missed one-offs move to the next free gaps (the Gate goes first).
   A missed habit with a later copy coming up is skipped, not piled on. */
function rescheduleMissed(now = Date.now()) {
  const list = missed(now).sort((x, y) => startMs(x) - startMs(y));   // keep his original order
  if (!list.length) return { moved: [], skipped: [], stuck: [] };
  snapshot();
  const moved = [], skipped = [], stuck = [];
  for (const e of list) {
    const later = e.series && S.events.some(x => x.series === e.series && x.id !== e.id && live(x) && startMs(x) >= now);
    if (later) { e.skipped = true; skipped.push(e); continue; }
    const t = findSlot(e.dur, now, e.id);
    if (t == null) { stuck.push(e); continue; }
    e.date = todayKey(t); e.start = hhmm(t); e.moved = (e.moved || 0) + 1;
    if (e.gate && S.events.some(x => x !== e && x.gate && x.date === e.date && !x.skipped)) e.gate = false;   // one Gate a day
    moved.push(e);
  }
  save();
  return { moved, skipped, stuck };
}
/* Push what is left of a day to the next day, same order, into free gaps. */
function pushDay(date, now = Date.now()) {
  const rest = eventsOn(date).filter(e => live(e) && !e.fixed);
  if (!rest.length) return [];
  snapshot();
  const from = toMs(shiftDate(date, 1), S.settings.dayStart);
  const out = [];
  for (const e of rest) {
    const t = findSlot(e.dur, Math.max(from, now), e.id);
    if (t == null) continue;
    e.date = todayKey(t); e.start = hhmm(t); e.moved = (e.moved || 0) + 1; out.push(e);
  }
  save(); return out;
}

/* --------------------------- import/export --------------------------- */
function exportJSON() { return JSON.stringify({ v: 3, events: S.events, settings: { ...S.settings, geminiKey: '' } }, null, 1); }
/* Merges a plan file by id: new ids are added, known ids are replaced. */
function importPlan(text) {
  const p = JSON.parse(text);
  const list = Array.isArray(p) ? p : p.events;
  if (!Array.isArray(list)) throw new Error('No events in that file.');
  let added = 0, updated = 0;
  for (const raw of list) {
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) || !/^\d{2}:\d{2}$/.test(raw.start)) continue;
    const e = { id: /^[\w-]{1,80}$/.test(raw.id || '') ? raw.id : uid(), title: String(raw.title || 'Untitled'), date: raw.date, start: raw.start,
      dur: Number(raw.dur) || 30, note: raw.note || '', done: !!raw.done, gate: !!raw.gate, fixed: !!raw.fixed,
      series: raw.series ? String(raw.series).slice(0, 80) : null, moved: Math.max(0, Math.trunc(Number(raw.moved) || 0)), skipped: !!raw.skipped };
    e.dur = Math.max(5, Math.min(720, e.dur));
    const i = S.events.findIndex(x => x.id === e.id);
    if (i >= 0) { S.events[i] = e; updated++; } else { S.events.push(e); added++; }
  }
  save(); return { added, updated };
}

if (typeof module !== 'undefined') {
  module.exports = { get S() { return S; }, set S(v) { S = v; }, defaults, load, save, todayKey, shiftDate, toMs,
    startMs, endMs, hhmm, eventsOn, inRange, missed, nextUp, gateFor, gateStreak, addEvent, updateEvent,
    deleteEvent, findSlot, rescheduleMissed, pushDay, undo, importPlan, exportJSON };
}
