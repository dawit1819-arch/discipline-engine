/* The assistant. With a Gemini key it is a real agent with calendar tools.
   Without one, a few plain commands still work offline. */
const GEM = 'https://generativelanguage.googleapis.com/v1beta';

/* Picks the newest general "flash" model this key can use, so the app
   keeps working when Google retires an old model name. */
async function pickModel(key) {
  const res = await fetch(`${GEM}/models?pageSize=200`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(res.status === 400 || res.status === 403 ? 'Google rejected that key.' : `Google said ${res.status}.`);
  const names = ((await res.json()).models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace('models/', ''))
    .filter(n => /^gemini-[\d.]+-flash/.test(n) && !/lite|image|tts|live|audio|thinking|exp|embed/.test(n));
  if (!names.length) throw new Error('No Gemini Flash model on this key.');
  const ver = n => parseFloat(n.match(/^gemini-([\d.]+)/)[1]);
  names.sort((a, b) => ver(b) - ver(a) || a.includes('preview') - b.includes('preview') || a.length - b.length);
  return names[0];
}

const TOOLS = [{ functionDeclarations: [
  { name: 'list_events', description: 'List calendar events between two dates (inclusive). Each has id, title, date, start, dur (minutes), done, gate, fixed, note.',
    parameters: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['from', 'to'] } },
  { name: 'add_event', description: 'Add an event. Use find_free_time first when the user gives no exact time.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' },
      start: { type: 'string', description: 'HH:MM 24h' }, dur: { type: 'integer', description: 'minutes' }, note: { type: 'string' },
      gate: { type: 'boolean', description: "true = today's one most important 'send it' action" } }, required: ['title', 'date', 'start'] } },
  { name: 'update_event', description: 'Change an event: move it (date/start), rename, resize, mark done, make it the Gate.',
    parameters: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, date: { type: 'string' }, start: { type: 'string' },
      dur: { type: 'integer' }, note: { type: 'string' }, done: { type: 'boolean' }, gate: { type: 'boolean' } }, required: ['id'] } },
  { name: 'delete_event', description: 'Delete an event. Only when the user clearly asks to remove or cancel it.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'reschedule_missed', description: 'Move every missed, unfinished task into the next free gaps (Gate first). Missed daily habits that have a later copy are skipped instead of piled up.',
    parameters: { type: 'object', properties: {} } },
  { name: 'push_day', description: 'Move all unfinished tasks of a date to the following day(s).',
    parameters: { type: 'object', properties: { date: { type: 'string' } }, required: ['date'] } },
  { name: 'find_free_time', description: 'First free slot of a given length, from a date/time onward, inside waking hours.',
    parameters: { type: 'object', properties: { minutes: { type: 'integer' }, from_date: { type: 'string' }, from_time: { type: 'string' } }, required: ['minutes'] } },
] }];

const slim = e => ({ id: e.id, title: e.title, date: e.date, start: e.start, dur: e.dur, done: !!e.done, gate: !!e.gate, fixed: !!e.fixed, note: (e.note || '').slice(0, 160) });
const okDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || ''), okTime = s => /^\d{2}:\d{2}$/.test(s || '');

function runTool(name, a) {
  switch (name) {
    case 'list_events': return { events: inRange(a.from, a.to).map(slim) };
    case 'add_event':
      if (!okDate(a.date) || !okTime(a.start)) return { error: 'date must be YYYY-MM-DD and start HH:MM' };
      return { added: slim(addEvent(a)) };
    case 'update_event': {
      if ((a.date && !okDate(a.date)) || (a.start && !okTime(a.start))) return { error: 'bad date/time format' };
      const e = updateEvent(a.id, a); return e ? { updated: slim(e) } : { error: 'no event with that id' };
    }
    case 'delete_event': return { deleted: deleteEvent(a.id) };
    case 'reschedule_missed': {
      const r = rescheduleMissed();
      return { moved: r.moved.map(slim), skipped_habits: r.skipped.map(e => e.title), no_room: r.stuck.map(e => e.title) };
    }
    case 'push_day': return { moved: pushDay(a.date).map(slim) };
    case 'find_free_time': {
      const from = okDate(a.from_date) ? toMs(a.from_date, okTime(a.from_time) ? a.from_time : '00:00') : Date.now();
      const t = findSlot(a.minutes || 30, Math.max(from, Date.now()));
      return t == null ? { none: true } : { date: todayKey(t), start: hhmm(t) };
    }
  }
  return { error: 'unknown tool' };
}

function systemPrompt() {
  const now = new Date(), t = todayKey();
  const day = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const m = missed().map(slim);
  return `You are Koyomi, Dawit's calendar assistant and calm accountability partner. You talk out loud, so:
- Reply in 1 to 3 short spoken sentences. No lists, no markdown, no emojis. Say times like "5:30 pm".
- Act, don't ask, when the request is clear. Use the tools, then say exactly what changed.
- Ask one short question only when a request is truly ambiguous (two events could match, no day given for a big task).
- Never delete unless he says delete, cancel or remove. Moving is always safer.
- The Gate is the day's one "send it" action (the step another person has to see). If he tries to skip it, push back once, kindly.
- He is a night owl: waking window is ${S.settings.dayStart} to ${S.settings.dayEnd}. Fixed blocks (sleep, dinner) are not tasks.
Now: ${day}, ${hhmm(Date.now())} (date ${t}).
Today's events: ${JSON.stringify(eventsOn(t).map(slim))}
Missed and not yet moved: ${JSON.stringify(m)}
For other days call list_events.`;
}

let chatHistory = [];   // Gemini contents for this session
async function askGemini(text) {
  const key = S.settings.geminiKey;
  if (!S.settings.model) { S.settings.model = await pickModel(key); save(); }
  chatHistory.push({ role: 'user', parts: [{ text }] });
  chatHistory = chatHistory.slice(-24);
  while (chatHistory.length && !(chatHistory[0].role === 'user' && chatHistory[0].parts[0].text != null)) chatHistory.shift();
  const before = JSON.parse(JSON.stringify(S.events));
  let changed = false;
  const finish = text => { if (changed) { S.undo = before; save(); } return { text, changed }; };
  try {
  for (let round = 0; round < 8; round++) {
    const res = await fetch(`${GEM}/models/${S.settings.model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt() }] }, contents: chatHistory, tools: TOOLS,
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 } }),
      signal: AbortSignal.timeout(45000),
    });
    if (res.status === 404) { S.settings.model = ''; save(); throw new Error('That model was retired. Try again, a new one will be picked.'); }
    if (res.status === 429) throw new Error('Google free limit hit for now. Wait a minute and try again.');
    if (!res.ok) throw new Error(`Gemini said ${res.status}.`);
    const cand = (await res.json()).candidates?.[0];
    if (!cand || (cand.finishReason && cand.finishReason !== 'STOP') || !cand.content?.parts) throw new Error(`Gemini stopped early (${cand?.finishReason || 'no answer'}). Try again.`);
    const content = cand.content;
    chatHistory.push(content);   // kept whole so thought signatures survive
    const calls = content.parts.filter(p => p.functionCall);
    if (!calls.length) return finish(content.parts.filter(p => !p.thought).map(p => p.text || '').join(' ').trim() || 'Done.');
    if (calls.some(c => !['list_events', 'find_free_time'].includes(c.functionCall.name))) changed = true;
    chatHistory.push({ role: 'user', parts: calls.map(c => ({ functionResponse: {
      name: c.functionCall.name, ...(c.functionCall.id ? { id: c.functionCall.id } : {}),
      response: runTool(c.functionCall.name, c.functionCall.args || {}) } })) });
  }
  throw new Error('That took too many steps, so I stopped. Check the calendar.');
  } catch (e) {
    changed = JSON.stringify(S.events) !== JSON.stringify(before);
    chatHistory = [];
    return finish(`${changed ? 'Some changes were made. ' : ''}${e.message}`);
  }
}

/* -------- offline commands (no key) -------- */
function parseWhen(s) {
  let date = todayKey();
  if (/tomorrow/.test(s)) date = shiftDate(date, 1);
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const wd = days.findIndex(d => s.includes(d));
  if (wd >= 0) { let k = (wd - new Date().getDay() + 7) % 7 || 7; date = shiftDate(todayKey(), k); }
  let start = null;
  const m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/);
  if (/noon/.test(s)) start = '12:00';
  else if (m && (m[3] || m[2])) {
    let h = +m[1]; const pm = m[3] && m[3][0] === 'p';
    if (pm && h < 12) h += 12; if (m[3] && !pm && h === 12) h = 0;
    start = `${p2(h)}:${m[2] || '00'}`;
  }
  return { date, start };
}
function offline(text) {
  const s = text.toLowerCase();
  if (/(missed|behind|reschedul|catch up|didn.?t do)/.test(s)) {
    const r = rescheduleMissed();
    if (!r.moved.length && !r.skipped.length) return { text: 'Nothing is overdue. You are clear.', changed: false };
    return { text: `Moved ${r.moved.length} task${r.moved.length === 1 ? '' : 's'} into your next free time` +
      (r.skipped.length ? ` and skipped ${r.skipped.length} old habit slot${r.skipped.length === 1 ? '' : 's'}` : '') +
      (r.moved[0] ? `. First up: ${r.moved[0].title} at ${fmt12(r.moved[0].start)}.` : '.'), changed: true };
  }
  if (/(push|move).*(rest|everything|all).*(tomorrow)/.test(s)) {
    const n = pushDay(todayKey()).length;
    return { text: n ? `Pushed ${n} task${n === 1 ? '' : 's'} to tomorrow.` : 'Nothing left today to push.', changed: n > 0 };
  }
  if (/(what.?s next|next up|what now|what should i do)/.test(s)) {
    const e = nextUp(); return { text: e ? `Next: ${e.title}, ${e.date === todayKey() ? 'today' : e.date} at ${fmt12(e.start)}.` : 'Nothing else is planned.', changed: false };
  }
  const add = s.match(/^(?:add|schedule|put)\s+(.+?)(?:\s+(?:at|on|for|tomorrow|today|this|next)\b.*)?$/);
  if (add) {
    const w = parseWhen(s);
    const title = text.slice(text.toLowerCase().indexOf(add[1]), text.toLowerCase().indexOf(add[1]) + add[1].length);
    snapshot();
    let start = w.start;
    if (!start) {
      const t = findSlot(30, w.date === todayKey() ? Date.now() : toMs(w.date, '00:00'));
      if (t == null) return { text: 'No free slot in the next two weeks.', changed: false };
      w.date = todayKey(t); start = hhmm(t);
    }
    const e = addEvent({ title: title[0].toUpperCase() + title.slice(1), date: w.date, start, dur: 30 });
    return { text: `Added ${e.title}, ${e.date === todayKey() ? 'today' : e.date} at ${fmt12(e.start)}.`, changed: true };
  }
  return { text: 'Without a Gemini key I only know: "reschedule what I missed", "what\'s next", "push the rest to tomorrow", and "add X at 5 pm". Add a free key in Setup and I can do anything.', changed: false };
}
function fmt12(t) { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return m ? `${h}:${p2(m)} ${ap}` : `${h} ${ap}`; }

async function ask(text) {
  if (S.settings.geminiKey) return askGemini(text);
  return offline(text);
}
