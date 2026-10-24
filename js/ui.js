/* Views + events. Each render rebuilds the current view; state lives in core.js. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KANJI_WD = ['日', '月', '火', '水', '木', '金', '土'];
const ui = { tab: 'day', date: todayKey(), week: 0, listening: false, busy: false, partial: '' };

storageRef = window.localStorage;
load(storageRef);

function t12(t) { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${h}:${p2(m)}<small>${ap}</small>`; }
function longDate(key) {
  const [y, m, d] = key.split('-').map(Number), dt = new Date(y, m - 1, d);
  return { wd: dt.toLocaleDateString('en-US', { weekday: 'long' }), k: KANJI_WD[dt.getDay()],
    md: dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), d };
}
let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = esc(msg) + (action ? ` <button data-act="${action.act}">${esc(action.label)}</button>` : '');
  el.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : 2600);
}
function changed(msg) {
  render(); queueSync();
  if (saveError) toast(saveError); else if (msg) toast(msg, S.undo ? { act: 'undo', label: 'Undo' } : null);
}
let syncTimer;
function queueSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncReminders().catch(e => console.warn('[ntfy]', e.message)), 1500);
}

/* ------------------------------ Day -------------------------------- */
function viewDay() {
  const now = Date.now(), tk = todayKey(now), sel = ui.date, L = longDate(sel);
  const evs = eventsOn(sel), open = evs.filter(e => !e.done && !e.fixed).length;
  const streak = gateStreak(now), late = missed(now);
  // week strip anchored on the selected date's week (Mon first)
  const monday = shiftDate(sel, -((new Date(toMs(sel, '12:00')).getDay() + 6) % 7));
  const lateDays = new Set(late.map(e => e.date));
  let strip = '';
  for (let i = 0; i < 7; i++) {
    const k = shiftDate(monday, i), dt = longDate(k);
    const has = S.events.some(e => e.date === k && !e.skipped && !e.fixed);
    strip += `<button class="cell${k === sel ? ' sel' : ''}${k === tk ? ' today' : ''}${has ? ' has' : ''}${lateDays.has(k) ? ' late' : ''}" data-act="pick" data-date="${k}">
      <span class="wd">${dt.k}</span><span class="n">${dt.d}</span><span class="dot"></span></button>`;
  }
  const gate = gateFor(sel);
  let rows = '', nowDrawn = sel !== tk;
  for (const e of evs) {
    if (!nowDrawn && startMs(e) > now) { rows += '<li class="nowline" aria-label="now"></li>'; nowDrawn = true; }
    const isLate = !e.done && !e.fixed && endMs(e) < now;
    rows += `<li class="ev${e.done ? ' done' : ''}${e.fixed ? ' fixed' : ''}${isLate ? ' late' : ''}">
      <time>${t12(e.start)}</time>
      <button class="body" data-act="edit" data-id="${esc(e.id)}"><span class="t">${e.gate ? '<span class="gk">一手</span>' : ''}${esc(e.title)}</span>
        <span class="d">${e.dur} min${e.moved ? ` · moved ${esc(e.moved)}×` : ''}${e.note ? ' · ' + esc(e.note) : ''}</span></button>
      ${e.fixed ? '<span></span>' : `<button class="check" data-act="toggle" data-id="${esc(e.id)}" aria-label="${e.done ? 'Mark not done' : 'Mark done'}"></button>`}
    </li>`;
  }
  if (!nowDrawn && evs.length) rows += '<li class="nowline" aria-label="now"></li>';

  return `
  <header class="dayhead">
    <div class="seal" aria-hidden="true">${L.k}</div>
    <div><h1>${L.wd} ${L.d}</h1>
      <p class="sub">${L.md} · ${open} open${streak ? ` · gate streak ${streak}` : ''}</p></div>
  </header>
  <div class="strip">
    <button class="nav" data-act="week" data-d="-7" aria-label="Previous week">‹</button>${strip}
    <button class="nav" data-act="week" data-d="7" aria-label="Next week">›</button>
  </div>
  ${late.length ? `<div class="missed"><p><b>${late.length}</b> ${late.length === 1 ? 'thing' : 'things'} slipped past. That's fine.</p>
    <button class="btn-shu" data-act="fix">Move them →</button></div>` : ''}
  <section class="gate">
    <p class="label"><span class="k">一手</span>The Gate · today's one send</p>
    ${gate ? `<button class="gate-card${gate.done ? ' done' : ''}" data-act="stamp" data-id="${esc(gate.id)}">
        <h2>${esc(gate.title)}</h2><p class="when">${t12(gate.start).replace(/<\/?small>/g, '')} · ${gate.done ? 'sent. well done.' : 'tap when another person can see it'}</p>
        ${gate.done ? '<span class="hanko" id="hanko">済</span>' : ''}</button>`
      : `<p class="gate-empty">No Gate set. Open any task and mark it as the Gate, or say "make the mentor message my Gate".</p>`}
  </section>
  ${evs.length ? `<ol class="timeline">${rows}</ol>` : `<p class="empty">An empty day. Say what you want in it, or add one thing.</p>`}
  <button class="add" data-act="add">+ Add</button>
  ${sel !== tk ? `<button class="add" data-act="pick" data-date="${tk}" style="border:0">Back to today</button>` : ''}`;
}

/* ------------------------------ Talk ------------------------------- */
const CHIPS = ['I missed everything. Move it.', "What's next?", 'Push the rest of today to tomorrow', 'Add gym tomorrow at 6 pm'];
function viewTalk() {
  const log = S.chat.slice(-30).map(m => `<p class="msg ${m.who}">${esc(m.text)}</p>`).join('');
  return `<div class="talk">
    <header><h1>Talk</h1><p class="sub">${S.settings.geminiKey ? 'Say what happened. I will move things around.' : 'Offline mode: a few commands work. Add a free Gemini key in Setup for full conversation.'}</p></header>
    <div class="log" id="log">${log || `<div class="chips">${CHIPS.map(c => `<button class="chip" data-act="chip">${esc(c)}</button>`).join('')}</div>`}</div>
    <div class="talkbar">
      <p class="partial" id="partial">${esc(ui.partial)}</p>
      <button class="mic${ui.listening ? ' on' : ''}${ui.busy ? ' busy' : ''}" data-act="mic" aria-label="${ui.listening ? 'Stop listening' : 'Talk'}">話</button>
      <p class="hint">${ui.busy ? 'thinking' : ui.listening ? 'listening · tap to stop' : canListen ? 'tap and talk' : 'voice not supported here, type below'}</p>
      <form class="type" data-form="say"><input name="q" placeholder="or type…" autocomplete="off" enterkeyhint="send"><button>Send</button></form>
      <div class="talkopts">
        <label class="toggle" style="margin:0"><input type="checkbox" data-set="convo" ${S.settings.convo ? 'checked' : ''}> Hands-free</label>
        <span><button data-act="undo" ${S.undo ? '' : 'disabled'}>Undo last change</button>${S.chat.length ? ' · <button data-act="clear">Clear</button>' : ''}</span>
      </div>
    </div></div>`;
}
async function say(text) {
  text = text.trim(); if (!text || ui.busy) return;
  unlockAudio();
  S.chat.push({ who: 'me', text }); ui.busy = true; ui.partial = ''; save(); render();
  try {
    const r = await ask(text);
    S.chat.push({ who: 'ai', text: r.text }); S.chat = S.chat.slice(-60); save();
    ui.busy = false; render(); if (r.changed) queueSync();
    speak(r.text, () => { if (S.settings.convo && ui.tab === 'talk' && !ui.listening) startMic(); });
  } catch (e) {
    S.chat.push({ who: 'err', text: e.message }); ui.busy = false; save(); render();
  }
  const log = $('#log'); if (log) log.lastElementChild?.scrollIntoView({ block: 'nearest' });
}
function startMic() {
  if (ui.listening) { stopListening(); return; }
  ui.listening = true; ui.partial = ''; render();
  listen({
    onPartial: t => { ui.partial = t; const p = $('#partial'); if (p) p.textContent = t; },
    onFinal: t => { ui.listening = false; say(t); },
    onEnd: ({ hadFinal, error, stopped }) => {
      if (ui.listening) { ui.listening = false; ui.partial = ''; render(); }
      if (!hadFinal && !stopped && (!error || error === 'no-speech'))
        setTimeout(() => { if (S.settings.convo && ui.tab === 'talk' && !ui.busy && !ui.listening && !document.hidden) startMic(); }, 500);
    },
    onError: m => { ui.listening = false; toast(m); render(); },
  });
}

/* ------------------------------ Setup ------------------------------ */
function viewSetup() {
  const s = S.settings;
  return `<header><h1>Setup</h1><p class="sub">Everything stays on this phone.</p></header>
  <section class="sec"><h2>Voice brain</h2>
    <p>A free Google Gemini key lets Koyomi understand anything you say. Get one at <b>aistudio.google.com/apikey</b> (free, 1 minute), paste it here.</p>
    <label class="field"><span>Gemini key</span><input data-input="geminiKey" type="password" value="${esc(s.geminiKey)}" placeholder="AIza…" autocomplete="off"></label>
    <div class="btns"><button class="btn solid" data-act="testkey">Save &amp; test</button></div>
    <p class="muted" style="margin-top:8px">${s.model ? `<span class="ok">Connected</span> · model ${esc(s.model)}` : 'Not tested yet.'}</p>
    <label class="toggle"><input type="checkbox" data-set="voice" ${s.voice ? 'checked' : ''}> Speak answers out loud</label>
    <label class="field"><span>Voice</span><select data-input="humanVoice">
      ${HUMAN_VOICES.map(v => `<option ${s.humanVoice === v || (!s.humanVoice && v === 'Kore') ? 'selected' : ''}>${v}</option>`).join('')}
      <option value="phone" ${s.humanVoice === 'phone' ? 'selected' : ''}>Phone's built-in voice (no key needed)</option></select></label>
    <div class="btns"><button class="btn ghost" data-act="hearvoice">Hear it</button></div>
  </section>
  <section class="sec"><h2>Phone reminders</h2>
    <p>Install the free <b>ntfy</b> app, subscribe to this topic, and every task buzzes 5 minutes before. When Koyomi moves a task, the old buzz is cancelled.</p>
    <label class="field"><span>ntfy topic (keep it secret)</span><input data-input="ntfyTopic" value="${esc(s.ntfyTopic)}" placeholder="tap Generate" autocomplete="off"></label>
    <div class="btns"><button class="btn ghost" data-act="gentopic">Generate</button><button class="btn ghost" data-act="copytopic">Copy</button>
      <button class="btn solid" data-act="testphone">Send test</button><button class="btn ghost" data-act="sync">Sync now</button></div>
    <p class="muted" style="margin-top:8px">${Object.keys(S.sent).length} reminders queued.</p>
  </section>
  <section class="sec"><h2>Waking hours</h2><p>Koyomi only moves things inside this window.</p>
    <div class="row2"><label class="field"><span>Day starts</span><input type="time" data-input="dayStart" value="${s.dayStart}"></label>
    <label class="field"><span>Day ends</span><input type="time" data-input="dayEnd" value="${s.dayEnd}"></label></div>
  </section>
  <section class="sec"><h2>Plans &amp; backup</h2>
    <p>Import a plan file Claude made for you (it merges, nothing is lost), or back everything up.</p>
    <div class="btns"><label class="btn solid">Import plan<input type="file" accept=".json,application/json" data-file="plan" hidden></label>
      <button class="btn ghost" data-act="export">Export backup</button></div>
  </section>
  <p class="foot">Koyomi · v3 · the old Discipline Engine is still at <a href="v2/">v2/</a></p>`;
}

/* ------------------------------ sheet ------------------------------ */
function openSheet(e) {
  const isNew = !e;
  e = e || { title: '', date: ui.date, start: (() => { const t = findSlot(30, ui.date === todayKey() ? Date.now() : toMs(ui.date, '00:00')); return t && todayKey(t) === ui.date ? hhmm(t) : '12:00'; })(), dur: 30, note: '', gate: false, fixed: false };
  const sh = $('#sheet');
  sh.innerHTML = `<form data-form="event" data-id="${esc(e.id || '')}">
    <p class="label">${isNew ? 'New' : 'Edit'}</p>
    <label class="field"><span>What</span><input name="title" value="${esc(e.title)}" required maxlength="140" ${isNew ? 'autofocus' : ''}></label>
    <div class="row3"><label class="field"><span>Day</span><input type="date" name="date" value="${e.date}" required></label>
      <label class="field"><span>Start</span><input type="time" name="start" value="${e.start}" required></label>
      <label class="field"><span>Minutes</span><input type="number" name="dur" value="${e.dur}" min="5" max="720" step="5"></label></div>
    <label class="field"><span>Note</span><textarea name="note" rows="2">${esc(e.note)}</textarea></label>
    <label class="toggle"><input type="checkbox" name="gate" ${e.gate ? 'checked' : ''}> This is the day's Gate (the one send)</label>
    <label class="toggle"><input type="checkbox" name="fixed" ${e.fixed ? 'checked' : ''}> Fixed block, not a task (sleep, meals)</label>
    <div class="btns"><button class="btn solid">Save</button><button type="button" class="btn ghost" data-act="close">Cancel</button>
      ${isNew ? '' : `<button type="button" class="btn ghost" data-act="later" data-id="${esc(e.id)}">Move to next free time</button>
      <button type="button" class="btn danger" data-act="del" data-id="${esc(e.id)}">Delete</button>`}</div></form>`;
  sh.hidden = false;
}
const closeSheet = () => { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; };

/* ------------------------------ render ----------------------------- */
function render() {
  const html = ui.tab === 'day' ? viewDay() : ui.tab === 'talk' ? viewTalk() : viewSetup();
  $('#view').innerHTML = (saveError ? `<p class="msg err" role="alert">${esc(saveError)}</p>` : '') + html;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
}

document.addEventListener('click', async ev => {
  const tab = ev.target.closest('[data-tab]');
  if (tab) { ui.tab = tab.dataset.tab; if (ui.tab === 'day') ui.date = ui.date || todayKey(); render(); scrollTo(0, 0); return; }
  if (ev.target.id === 'sheet') return closeSheet();
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const id = el.dataset.id, act = el.dataset.act;
  try {
    switch (act) {
      case 'pick': ui.date = el.dataset.date; render(); break;
      case 'week': ui.date = shiftDate(ui.date, +el.dataset.d); render(); break;
      case 'toggle': { const e = S.events.find(x => x.id === id); updateEvent(id, { done: !e.done }); changed(); break; }
      case 'stamp': {
        const e = S.events.find(x => x.id === id); updateEvent(id, { done: !e.done }); changed();
        if (!e.done) return; const h = $('#hanko'); if (h) h.classList.add('stamp'); navigator.vibrate?.(30); break;
      }
      case 'fix': {
        const r = rescheduleMissed();
        changed(`Moved ${r.moved.length}${r.skipped.length ? `, skipped ${r.skipped.length} old habit slot${r.skipped.length > 1 ? 's' : ''}` : ''}${r.stuck.length ? `, ${r.stuck.length} had no room` : ''}.`);
        break;
      }
      case 'undo': if (undo()) changed('Undone.'); break;
      case 'add': openSheet(null); break;
      case 'edit': openSheet(S.events.find(x => x.id === id)); break;
      case 'close': closeSheet(); break;
      case 'del': snapshot(); deleteEvent(id); closeSheet(); changed('Deleted.'); break;
      case 'later': {
        const e = S.events.find(x => x.id === id); const t = findSlot(e.dur, Math.max(Date.now(), endMs(e)), id);
        if (t == null) { toast('No free time in the next two weeks.'); break; }
        snapshot(); updateEvent(id, { date: todayKey(t), start: hhmm(t) }); closeSheet(); ui.date = todayKey(t);
        changed(`Moved to ${todayKey(t) === todayKey() ? 'today' : longDate(todayKey(t)).wd} ${hhmm(t)}.`); break;
      }
      case 'mic': unlockAudio(); startMic(); break;
      case 'hearvoice': unlockAudio(); speak("Hi Dawit. I moved what you missed into today. Your Gate is the Colwen application, at eleven thirty."); break;
      case 'chip': say(el.textContent); break;
      case 'clear': S.chat = []; chatHistory = []; save(); render(); break;
      case 'testkey': {
        S.settings.geminiKey = ($('[data-input=geminiKey]').value || '').trim(); S.settings.model = ''; save();
        if (!S.settings.geminiKey) { toast('Key removed. Offline mode.'); render(); break; }
        toast('Testing…'); S.settings.model = await pickModel(S.settings.geminiKey); save(); render(); toast('Connected.'); break;
      }
      case 'gentopic': S.settings.ntfyTopic = randomTopic(); save(); render(); queueSync(); toast('New topic. Subscribe to it in ntfy.'); break;
      case 'copytopic': await navigator.clipboard.writeText(S.settings.ntfyTopic); toast('Copied.'); break;
      case 'testphone': await testPhone(); toast('Sent. Your phone should buzz.'); break;
      case 'sync': { const r = await syncReminders(); render(); toast(`Queued ${r.sent}, cancelled ${r.cancelled}.`); break; }
      case 'export': {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' }));
        a.download = `koyomi-backup-${todayKey()}.json`; a.click(); break;
      }
    }
  } catch (e) { toast(e.message || 'Something went wrong.'); }
});

document.addEventListener('submit', ev => {
  ev.preventDefault();
  const f = ev.target;
  if (f.dataset.form === 'say') { const q = f.q.value; f.q.value = ''; say(q); return; }
  if (f.dataset.form === 'event') {
    const v = { title: f.title.value.trim(), date: f.date.value, start: f.start.value, dur: +f.dur.value || 30,
      note: f.note.value.trim(), gate: f.gate.checked, fixed: f.fixed.checked };
    if (!v.title) return;
    snapshot();
    if (f.dataset.id) updateEvent(f.dataset.id, v); else addEvent(v);
    ui.date = v.date; closeSheet(); changed('Saved.');
  }
});

document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset.set) { S.settings[t.dataset.set] = t.checked; save(); return; }
  if (t.dataset.input && t.dataset.input !== 'geminiKey') {
    if (t.dataset.input === 'ntfyTopic' && t.value && !validTopic(t.value.trim())) { toast('Topic: letters, numbers, - or _ only.'); return; }
    S.settings[t.dataset.input] = t.value.trim();
    save(); toast(saveError || 'Saved.'); if (t.dataset.input === 'ntfyTopic') queueSync(); return;
  }
  if (t.dataset.file === 'plan' && t.files[0]) {
    try { const r = importPlan(await t.files[0].text()); ui.tab = 'day'; ui.date = todayKey(); changed(`Imported ${r.added} new, ${r.updated} updated.`); }
    catch (e) { toast('Could not read that file: ' + e.message); }
  }
});

/* keep "now" honest while the app stays open */
setInterval(() => { if (ui.tab === 'day' && $('#sheet').hidden) render(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); queueSync(); } });

render();
queueSync();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
