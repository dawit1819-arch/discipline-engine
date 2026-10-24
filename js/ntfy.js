/* Phone reminders through ntfy.sh. Each event gets one reminder 5 minutes
   before it starts, sent under a sequence id so a moved or finished event
   can cancel its old buzz (DELETE /topic/seq). ntfy holds up to 3 days. */
const NTFY = 'https://ntfy.sh';
const ascii = s => String(s).replace(/[^\x20-\x7E]/g, ' ').trim();
const validTopic = t => /^[a-zA-Z0-9_-]{1,64}$/.test(t || '');
const randomTopic = () => 'ky-' + Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
const seqOf = id => ('k' + id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);

async function ntfyPost(topic, { title, message, at, seq, priority = 4 }) {
  const headers = { Title: ascii(title).slice(0, 180), Priority: String(priority), Click: location.href.split('#')[0] };
  if (at) headers.At = String(Math.ceil(at / 1000));
  const url = `${NTFY}/${encodeURIComponent(topic)}` + (seq ? '/' + seq : '');
  const res = await fetch(url, { method: 'POST', headers, body: message, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`ntfy said ${res.status}`);
  return res.json();
}
async function ntfyCancel(topic, seq) {
  const res = await fetch(`${NTFY}/${encodeURIComponent(topic)}/${seq}`, { method: 'DELETE', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`ntfy cancel said ${res.status}`);
}

/* A change made while a sync runs triggers one more pass. */
let syncing = null, dirty = false;
function syncReminders() {
  dirty = true;
  if (!syncing) syncing = (async () => { let r; do { dirty = false; r = await doSync(); } while (dirty); return r; })()
    .finally(() => { syncing = null; });
  return syncing;
}
async function doSync() {
  const topic = S.settings.ntfyTopic;
  if (S.sentTopic === undefined) S.sentTopic = topic;
  if (S.sentTopic !== topic) {                      // topic changed: cancel the old topic's buzzes first
    for (const id of Object.keys(S.sent)) {
      if (S.sent[id] > Date.now() && validTopic(S.sentTopic)) await ntfyCancel(S.sentTopic, seqOf(id));
      delete S.sent[id]; save();
    }
    S.sentTopic = topic; save();
  }
  if (!validTopic(topic)) return { sent: 0, cancelled: 0 };
  const now = Date.now(), horizon = now + 70 * 3600000;
  const want = {};
  for (const e of S.events) {
    if (e.done || e.skipped || e.fixed) continue;
    const at = startMs(e) - 5 * 60000;
    if (at > now && at < horizon && (at > now + 30000 || S.sent[e.id] === at)) want[e.id] = { e, at };
  }
  let sent = 0, cancelled = 0;
  for (const id of Object.keys(S.sent)) {           // moved, done, deleted -> cancel
    if (!want[id] || want[id].at !== S.sent[id]) {
      if (S.sent[id] > now) { await ntfyCancel(topic, seqOf(id)); cancelled++; }
      delete S.sent[id]; save();
    }
  }
  for (const [id, { e, at }] of Object.entries(want)) {
    if (S.sent[id] === at) continue;
    await ntfyPost(topic, { title: `${e.gate ? 'THE GATE - ' : ''}${e.title}`, at, seq: seqOf(id),
      message: `${e.start} - ${e.dur} min${e.note ? '\n' + e.note.slice(0, 300) : ''}\nRunning late? Open Koyomi and say "move it".` });
    S.sent[id] = at; sent++;
  }
  save();
  return { sent, cancelled };
}
async function testPhone() {
  const t = S.settings.ntfyTopic;
  await ntfyPost(t, { title: 'Koyomi connected', message: 'If you can read this, reminders reach your phone.' });
}
