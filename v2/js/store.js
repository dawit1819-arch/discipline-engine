/* =====================================================================
   DISCIPLINE ENGINE — state, persistence, and the XP economy
   ===================================================================== */

const KEY = 'discipline-engine-v1';
let persistenceError = '';

/* ------------------------------ time --------------------------------- */
const p2 = n => String(n).padStart(2, '0');
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
function dateKey(d) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
function shiftDate(str, days) {
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dateKey(dt);
}
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmtShort(str) { const [, m, d] = str.split('-'); return `${m}/${d}`; }

/* ---------------------------- defaults -------------------------------- */
function blankDay(date) {
  return {
    date,
    blocks: {},        // scheduleId -> true
    ex: {},            // exerciseId -> [{w,r,rir}]
    dayId: null,       // override workout for the day
    posture: false,
    meals: [],         // {name,kcal,protein,src,time}
    deep: 0,           // deep-work blocks completed
    gateDone: false,
    gateId: null,      // which quest's gate was cleared
    weight: null,
    note: '',
    xp: 0,
    stats: { STR: 0, VIT: 0, FOC: 0, WIL: 0, GLD: 0 },
    closed: false,
  };
}

function DEFAULTS() {
  return {
    v: 1,
    created: today(),
    xp: 0,
    stats: { STR: 0, VIT: 0, FOC: 0, WIL: 0, GLD: 0 },
    streak: 0,
    bestStreak: 0,
    lastClosed: null,
    gateMisses: 0,          // consecutive days the Gate went untouched
    levels: {},             // exerciseId -> ladder index
    logs: {},               // date -> day object
    quests: JSON.parse(JSON.stringify(SEED_QUESTS)).map(q => ({
      ...q, done: [], notes: '', shipped: false,
    })),
    schedule: JSON.parse(JSON.stringify(DEFAULT_SCHEDULE)),
    targets: { ...DEFAULT_TARGETS },
    settings: {
      split: '4day',
      ntfyTopic: '',
      geminiKey: '',
      geminiModel: 'gemini-2.5-flash',
      pushEnabled: false,
      lastPushSync: null,
      vaultPath: 'Second Brain/Logs/Discipline',
    },
    scheduledPushes: {},    // "date|blockId" -> true
    achievements: {},       // id -> date earned
  };
}

/* ------------------------------ load/save ----------------------------- */
let S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS();
    const parsed = JSON.parse(raw);
    const base = DEFAULTS();
    // shallow-merge so new fields in future versions do not wipe old saves
    const merged = { ...base, ...parsed };
    merged.settings = { ...base.settings, ...(parsed.settings || {}) };
    merged.targets = { ...base.targets, ...(parsed.targets || {}) };
    merged.stats = { ...base.stats, ...(parsed.stats || {}) };
    // re-seed any quest that shipped in a newer data.js but is missing here
    const have = new Set((merged.quests || []).map(q => q.id));
    SEED_QUESTS.forEach(q => {
      if (!have.has(q.id)) merged.quests.push({ ...q, done: [], notes: '', shipped: false });
    });
    return merged;
  } catch (e) {
    console.error('[store] load failed, starting fresh', e);
    return DEFAULTS();
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveNow();
  }, 120);
}
function saveNow() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(S)); persistenceError = ''; return true;
  } catch (e) {
    persistenceError = 'Browser storage failed. Your latest changes are only in memory. Export a backup in Setup before closing.';
    console.error('[store] save failed', e); return false;
  }
}

/* ------------------------------ day access ---------------------------- */
function day(date) {
  date = date || today();
  if (!S.logs[date]) S.logs[date] = blankDay(date);
  return S.logs[date];
}

/* =============================== LEVELS ==============================
   Cost of level L (going from L to L+1) rises linearly; cumulative is
   therefore quadratic. Level 10 ~ 2.6k XP, level 24 ~ 15k, level 46 ~ 55k.
   Tuned so a disciplined day (~450 XP) makes early levels feel fast and
   the cultivation ranks take real months.
--------------------------------------------------------------------- */
function costOf(level) { return 300 + (level - 1) * 110; }

function levelInfo(totalXp) {
  let lvl = 1, rem = Math.max(0, totalXp);
  while (rem >= costOf(lvl)) { rem -= costOf(lvl); lvl++; if (lvl > 500) break; }
  const need = costOf(lvl);
  return { level: lvl, into: rem, need, pct: Math.min(100, (rem / need) * 100) };
}

function rankFor(level) {
  let r = RANKS[0];
  for (const cand of RANKS) if (level >= cand.at) r = cand;
  return r;
}
function nextRank(level) {
  for (const cand of RANKS) if (cand.at > level) return cand;
  return null;
}

/* ============================ XP AWARDING ============================ */
/* The multiplier is the discipline flywheel: streaks raise it, an
   abandoned Gate halves it. Missing the Gate is the only real penalty
   in this app, because it is the only thing that has ever stopped him. */
function multiplier() {
  const streakBonus = 1 + Math.min(S.streak, 30) * 0.02;   // up to 1.60x
  const cursed = S.gateMisses >= 3 ? 0.5 : 1;
  return streakBonus * cursed;
}
function isCursed() { return S.gateMisses >= 3; }

const xpListeners = [];
function onXp(fn) { xpListeners.push(fn); }

function award(amount, stat, label, date) {
  date = date || today();
  const d = day(date);
  const before = levelInfo(S.xp).level;
  const gained = Math.round(amount * multiplier());
  S.xp += gained;
  d.xp += gained;
  if (stat && S.stats[stat] != null) { S.stats[stat] += gained; d.stats[stat] += gained; }
  const after = levelInfo(S.xp).level;
  save();
  xpListeners.forEach(fn => fn({ gained, stat, label, levelUp: after > before, level: after }));
  return gained;
}

/* Removes XP when a task is un-checked, so the ledger stays honest. */
function revoke(amount, stat, date) {
  date = date || today();
  const d = day(date);
  const lost = Math.round(amount * multiplier());
  S.xp = Math.max(0, S.xp - lost);
  d.xp = Math.max(0, d.xp - lost);
  if (stat && S.stats[stat] != null) {
    S.stats[stat] = Math.max(0, S.stats[stat] - lost);
    d.stats[stat] = Math.max(0, d.stats[stat] - lost);
  }
  save();
  xpListeners.forEach(fn => fn({ gained: -lost, stat, label: 'undone' }));
  return lost;
}

/* ============================= THE GATE ==============================
   One last-mile action, chosen across all quests, pinned to the top of
   the day. Cannot be hidden. Three consecutive misses = Curse.
--------------------------------------------------------------------- */
function activeGates() {
  return S.quests.filter(q => !q.shipped && q.gate && q.status !== 'done');
}
/* Deterministic per-day pick so the Gate does not shuffle on refresh,
   but rotates day to day. Highest tier first, then rotate within tier. */
function gateForDate(date) {
  const pool = activeGates();
  if (!pool.length) return null;
  const rank = { S: 0, A: 1, B: 2, C: 3 };
  pool.sort((a, b) => (rank[a.tier] ?? 9) - (rank[b.tier] ?? 9));
  const top = pool.filter(q => q.tier === pool[0].tier);
  const seed = parseDate(date).getTime() / 86400000 | 0;
  return top[seed % top.length];
}

function clearGate(date) {
  date = date || today();
  const d = day(date);
  if (d.gateDone) return;
  const q = gateForDate(date);
  d.gateDone = true;
  d.gateId = q ? q.id : null;
  S.gateMisses = 0;
  award(XP.gate, q ? q.stat : 'GLD', 'THE GATE', date);
}

/* ============================ DAY CLOSING ============================ */
function coreFour(date) {
  const d = day(date);
  const wid = workoutFor(date);
  const trained = wid === 'rest'
    ? true
    : W[wid].ex.every(([id]) => (d.ex[id] || []).length > 0);
  const kcal = totals(date).kcal >= S.targets.kcal * 0.9;
  const focus = d.deep >= 1;
  return { trained, kcal, focus, gate: d.gateDone };
}

function closeDay(date) {
  date = date || today();
  const d = day(date);
  if (d.closed) return { already: true };
  const c = coreFour(date);
  const all = c.trained && c.kcal && c.focus && c.gate;

  if (all) {
    // continue the streak only if yesterday was also closed clean
    const prev = S.logs[shiftDate(date, -1)];
    S.streak = (prev && prev.closed && prev.clean) ? S.streak + 1 : 1;
    S.bestStreak = Math.max(S.bestStreak, S.streak);
    d.clean = true;
    award(75, 'WIL', 'Day closed clean', date);
  } else {
    S.streak = 0;
    d.clean = false;
    if (!c.gate) S.gateMisses += 1;
  }
  d.closed = true;
  S.lastClosed = date;
  saveNow();
  return { clean: all, core: c };
}

/* Auto-resolves any day that was left open in the past, so the streak and
   the Curse stay truthful even if he never opened the app that night. */
function reconcile() {
  const t = today();
  let cur = S.created;
  let guard = 0;
  while (cur < t && guard++ < 400) {
    const d = S.logs[cur];
    if (d && !d.closed) closeDay(cur);
    else if (!d) {
      // a day with no record at all is a missed day
      S.streak = 0;
      const g = gateForDate(cur);
      if (g) S.gateMisses += 1;
    }
    cur = shiftDate(cur, 1);
  }
  saveNow();
}

/* ============================== WORKOUT ============================== */
function workoutFor(date) {
  const d = day(date);
  if (d.dayId) return d.dayId;
  const dow = parseDate(date).getDay();
  return SCHED[S.settings.split][dow];
}

function logSet(exId, idx, val, date) {
  date = date || today();
  const d = day(date);
  if (!d.ex[exId]) d.ex[exId] = [];
  const had = !!(d.ex[exId][idx] && d.ex[exId][idx].r);
  d.ex[exId][idx] = val;
  const has = !!(val && val.r);
  if (has && !had) award(XP.workoutSet, 'STR', 'set logged', date);
  if (!has && had) revoke(XP.workoutSet, 'STR', date);
  checkWorkoutComplete(date);
  save();
}

function checkWorkoutComplete(date) {
  const d = day(date);
  const wid = workoutFor(date);
  if (wid === 'rest' || d.workoutAwarded) return;
  const done = W[wid].ex.every(([id, sets]) =>
    (d.ex[id] || []).filter(s => s && s.r).length >= sets);
  if (done) { d.workoutAwarded = true; award(XP.workoutDone, 'STR', 'Session complete', date); }
}

function exDone(exId, date) {
  const d = day(date);
  const wid = workoutFor(date);
  const row = (W[wid] ? W[wid].ex : []).find(e => e[0] === exId);
  const need = row ? row[1] : 3;
  return (d.ex[exId] || []).filter(s => s && s.r).length >= need;
}

function lastTimeDid(exId, beforeDate) {
  const dates = Object.keys(S.logs).filter(k => k < beforeDate).sort().reverse();
  for (const k of dates) {
    const sets = S.logs[k].ex && S.logs[k].ex[exId];
    if (sets && sets.filter(s => s && s.r).length) return { date: k, sets: sets.filter(s => s && s.r) };
  }
  return null;
}

/* =============================== FUEL ================================ */
function totals(date) {
  const d = day(date);
  return d.meals.reduce((a, m) => ({
    kcal: a.kcal + (Number(m.kcal) || 0),
    protein: a.protein + (Number(m.protein) || 0),
  }), { kcal: 0, protein: 0 });
}

function addMeal(meal, date) {
  date = date || today();
  const d = day(date);
  const beforeK = totals(date).kcal, beforeP = totals(date).protein;
  d.meals.push({ ...meal, time: new Date().toTimeString().slice(0, 5), id: Date.now() + Math.random() });
  const after = totals(date);
  award(Math.round((Number(meal.kcal) || 0) / 100) * 2, 'VIT', 'fuel logged', date);
  if (beforeK < S.targets.kcal && after.kcal >= S.targets.kcal)
    award(XP.calorieHit, 'VIT', 'CALORIE TARGET HIT', date);
  if (beforeP < S.targets.protein && after.protein >= S.targets.protein)
    award(XP.proteinHit, 'VIT', 'protein target hit', date);
  save();
}

function removeMeal(id, date) {
  const d = day(date || today());
  const i = d.meals.findIndex(m => m.id === id);
  if (i >= 0) {
    const m = d.meals[i];
    d.meals.splice(i, 1);
    revoke(Math.round((Number(m.kcal) || 0) / 100) * 2, 'VIT', date);
    save();
  }
}

/* ============================== BLOCKS =============================== */
function toggleBlock(blockId, date) {
  date = date || today();
  const d = day(date);
  const blk = S.schedule.find(b => b.id === blockId);
  if (!blk) return;
  if (d.blocks[blockId]) {
    delete d.blocks[blockId];
    if (blk.kind === 'deep') { d.deep = Math.max(0, d.deep - 1); revoke(XP.deepWork, 'FOC', date); }
    else revoke(XP.habit, blk.stat, date);
  } else {
    d.blocks[blockId] = true;
    if (blk.kind === 'deep') { d.deep += 1; award(XP.deepWork, 'FOC', blk.label, date); }
    else award(XP.habit, blk.stat, blk.label, date);
  }
  save();
}

function togglePosture(date) {
  date = date || today();
  const d = day(date);
  d.posture = !d.posture;
  if (d.posture) award(XP.posture, 'WIL', 'Posture block', date);
  else revoke(XP.posture, 'WIL', date);
  save();
}

/* ============================== QUESTS =============================== */
function toggleQuestStep(qid, stepIdx) {
  const q = S.quests.find(x => x.id === qid);
  if (!q) return;
  const i = q.done.indexOf(stepIdx);
  if (i >= 0) { q.done.splice(i, 1); revoke(XP.questStep, q.stat); }
  else { q.done.push(stepIdx); award(XP.questStep, q.stat, q.name); }
  if (q.done.length === q.steps.length && !q.shipped) shipQuest(qid);
  save();
}

function shipQuest(qid) {
  const q = S.quests.find(x => x.id === qid);
  if (!q || q.shipped) return;
  q.shipped = true;
  q.status = 'done';
  q.shippedOn = today();
  award(XP.boss, q.stat, `BOSS DEFEATED: ${q.name}`);
  save();
}

function addQuest(q) {
  S.quests.push({
    id: 'q' + Date.now(), tier: q.tier || 'B', stat: q.stat || 'GLD',
    status: 'active', done: [], notes: '', shipped: false,
    name: q.name, blurb: q.blurb || '', gate: q.gate || '',
    steps: (q.steps && q.steps.length) ? q.steps : ['Define the first step'],
  });
  save();
}

/* ============================ ANALYTICS ============================== */
function lastNDays(n) {
  const out = [];
  let cur = today();
  for (let i = 0; i < n; i++) { out.unshift(cur); cur = shiftDate(cur, -1); }
  return out;
}

function history(n) {
  return lastNDays(n).map(date => {
    const d = S.logs[date];
    return {
      date,
      xp: d ? d.xp : 0,
      kcal: d ? d.meals.reduce((a, m) => a + (Number(m.kcal) || 0), 0) : 0,
      trained: d ? Object.keys(d.ex || {}).length > 0 : false,
      gate: d ? !!d.gateDone : false,
      weight: d ? d.weight : null,
      clean: d ? !!d.clean : false,
    };
  });
}

/* ========================= EXPORT / IMPORT =========================== */
function exportJSON() {
  return JSON.stringify(S, null, 2);
}
function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('Not a valid save file');
  S = { ...DEFAULTS(), ...parsed };
  saveNow();
  return true;
}

/* Obsidian-flavoured markdown for the vault. */
function markdownFor(date) {
  date = date || today();
  const d = day(date);
  const t = totals(date);
  const li = levelInfo(S.xp);
  const r = rankFor(li.level);
  const wid = workoutFor(date);
  const c = coreFour(date);
  const q = gateForDate(date);

  const lines = [];
  lines.push('---');
  lines.push(`date: ${date}`);
  lines.push('type: discipline-log');
  lines.push(`level: ${li.level}`);
  lines.push(`rank: ${r.name}`);
  lines.push(`xp_today: ${d.xp}`);
  lines.push(`streak: ${S.streak}`);
  lines.push(`kcal: ${t.kcal}`);
  lines.push(`protein: ${t.protein}`);
  lines.push(`weight: ${d.weight ?? ''}`);
  lines.push(`gate_cleared: ${d.gateDone}`);
  lines.push('tags: [discipline, log]');
  lines.push('---');
  lines.push('');
  lines.push(`# ${date} — Level ${li.level} ${r.name}`);
  lines.push('');
  lines.push(`> [!${d.clean ? 'success' : 'warning'}] Core Four`);
  lines.push(`> Trained: ${c.trained ? '✅' : '❌'} · Calories: ${c.kcal ? '✅' : '❌'} · Deep work: ${c.focus ? '✅' : '❌'} · **Gate: ${c.gate ? '✅' : '❌'}**`);
  lines.push('');
  lines.push('## The Gate');
  lines.push(q ? `**${q.name}** — ${q.gate}` : '_No open gate._');
  lines.push(d.gateDone ? '\n✅ Cleared.' : '\n❌ Not cleared.');
  lines.push('');
  lines.push('## Training');
  if (wid === 'rest') lines.push('_Rest day._');
  else {
    lines.push(`**${W[wid].n}**`);
    lines.push('');
    lines.push('| Exercise | Sets logged |');
    lines.push('| --- | --- |');
    W[wid].ex.forEach(([id]) => {
      const sets = (d.ex[id] || []).filter(s => s && s.r);
      lines.push(`| ${EX[id].n} | ${sets.length ? sets.map(s => (s.w ? s.w + '×' : '') + s.r).join(', ') : '—'} |`);
    });
  }
  lines.push('');
  lines.push('## Fuel');
  lines.push(`**${t.kcal} / ${S.targets.kcal} kcal · ${t.protein} / ${S.targets.protein}g protein**`);
  lines.push('');
  if (d.meals.length) {
    lines.push('| Time | Food | kcal | protein |');
    lines.push('| --- | --- | --- | --- |');
    d.meals.forEach(m => lines.push(`| ${m.time || ''} | ${m.name} | ${m.kcal} | ${m.protein || 0} |`));
  } else lines.push('_Nothing logged._');
  lines.push('');
  lines.push('## Quests touched');
  S.quests.filter(x => x.done.length).forEach(x =>
    lines.push(`- [[${x.name}]] — ${x.done.length}/${x.steps.length} steps`));
  lines.push('');
  if (d.note) { lines.push('## Notes'); lines.push(d.note); }
  return lines.join('\n');
}
