/* =====================================================================
   DISCIPLINE ENGINE — views and interaction
   ===================================================================== */

const $  = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let TAB = 'today';
let openEx = null;
let viewDate = today();
let visionResult = null;
let busy = false;

/* ︎ forces text presentation so the tab glyphs stay monochrome. */
const TABS = [
  ['today',  '◉',       'Today'],
  ['quests', '⚔︎', 'Quests'],
  ['body',   '⬢',       'Body'],
  ['fuel',   '☘︎', 'Fuel'],
  ['codex',  '⚙︎', 'Codex'],
];

/* ============================== CHROME =============================== */
function renderHUD() {
  const li = levelInfo(S.xp);
  const r = rankFor(li.level);
  const nr = nextRank(li.level);
  const m = multiplier();
  const cursed = isCursed();

  return `
  <div class="hud">
    <div class="hud-row">
      <div class="orb" style="--p:${li.pct.toFixed(1)}">
        <div style="text-align:center">
          <div class="orb-lvl">${li.level}</div>
          <div class="orb-cap">Lv</div>
        </div>
      </div>
      <div class="hud-main">
        <div class="rank-plate" style="color:${r.color}">${esc(r.name)}</div>
        <div class="rank-sub">${esc(r.tier)}${nr ? ` · ${nr.at - li.level} lv to ${esc(nr.name)}` : ' · apex'}</div>
        <div class="xpbar"><i style="width:${li.pct.toFixed(1)}%"></i></div>
        <div class="rank-sub" style="margin-top:5px">${li.into.toLocaleString()} / ${li.need.toLocaleString()} XP</div>
      </div>
      <div class="hud-side">
        <div class="streak ${S.streak ? '' : 'cold'}">${S.streak}</div>
        <div class="streak-cap">Streak</div>
        <div class="mult ${cursed ? 'cursed' : ''}">×${m.toFixed(2)}</div>
      </div>
    </div>
    ${cursed ? `<div class="curse-bar">⚠ CURSED — the Gate has gone untouched ${S.gateMisses} days.
      All XP is halved until you clear one.</div>` : ''}
  </div>`;
}

function renderTabs() {
  const gateOpen = !day(today()).gateDone && !!gateForDate(today());
  return `<nav class="tabbar">${TABS.map(([id, g, l]) => `
    <button class="tab ${TAB === id ? 'on' : ''}" data-tab="${id}">
      <span class="tg">${g}</span><span class="tl">${l}</span>
      ${id === 'today' && gateOpen ? '<span class="dot"></span>' : ''}
    </button>`).join('')}</nav>`;
}

function render() {
  const views = { today: viewToday, quests: viewQuests, body: viewBody, fuel: viewFuel, codex: viewCodex };
  $('#app').innerHTML = renderHUD() + `<div class="view">${views[TAB]()}</div>`;
  document.body.insertAdjacentHTML('beforeend', '');
  $('#tabmount').innerHTML = renderTabs();
}

/* =============================== TODAY =============================== */
function viewToday() {
  const d = day(today());
  const q = gateForDate(today());
  const c = coreFour(today());
  const wid = workoutFor(today());
  const t = totals(today());
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const line = GATE_LINES[parseDate(today()).getDate() % GATE_LINES.length];

  // the schedule block we are currently inside
  let currentId = null;
  S.schedule.forEach(b => {
    const [h, mi] = b.t.split(':').map(Number);
    if (h * 60 + mi <= nowMin) currentId = b.id;
  });

  let h = '';

  /* ---- THE GATE ---- */
  if (q) {
    h += `<div class="gate ${d.gateDone ? 'cleared' : ''}">
      <div class="gate-tag"><span>${d.gateDone ? '✓ Gate cleared' : '⚡︎ The Gate'}</span>
        <span>+${XP.gate} XP</span></div>
      <div class="gate-quest">${esc(q.name)}</div>
      <div class="gate-do">${esc(q.gate)}</div>
      ${d.gateDone
        ? `<div class="gate-done-mark">◆ Done. That was the hard part.</div>`
        : `<div class="gate-line">"${esc(line)}"</div>
           <button class="gate-btn" data-act="cleargate">I sent it</button>`}
    </div>`;
  } else {
    h += `<div class="card framed"><div class="gate-tag" style="color:var(--jade)">✓ No gates open</div>
      <div class="quest-blurb" style="margin-top:8px">Every quest is shipped or has no last-mile step defined.
      Add one in Quests.</div></div>`;
  }

  /* ---- CORE FOUR ---- */
  h += `<div class="sect">Core Four</div><div class="core4">
    ${[['⚔︎', 'Train', c.trained], ['☘︎', 'Fuel', c.kcal],
       ['◈', 'Focus', c.focus], ['⚡︎', 'Gate', c.gate]]
      .map(([g, n, on]) => `<div class="core-cell ${on ? 'on' : ''}">
        <div class="core-glyph">${g}</div><div class="core-name">${n}</div></div>`).join('')}
  </div>`;

  /* ---- quick status ---- */
  h += `<div class="card">
    <div class="kv"><span>Session</span><span>${wid === 'rest' ? 'Rest day' : esc(W[wid].n)}</span></div>
    <div class="kv"><span>Fuel</span><span style="color:${t.kcal >= S.targets.kcal ? 'var(--jade)' : 'var(--ember)'}">${t.kcal} / ${S.targets.kcal} kcal</span></div>
    <div class="kv"><span>Deep work</span><span>${d.deep} block${d.deep === 1 ? '' : 's'}</span></div>
    <div class="kv"><span>XP today</span><span style="color:var(--gold)">+${d.xp}</span></div>
  </div>`;

  /* ---- schedule ---- */
  h += `<div class="sect">The Day</div>`;
  S.schedule.forEach(b => {
    const done = !!d.blocks[b.id];
    const [hh, mm] = b.t.split(':').map(Number);
    const past = hh * 60 + mm < nowMin;
    const isNow = b.id === currentId && !done;
    const xp = b.kind === 'deep' ? XP.deepWork : XP.habit;
    h += `<div class="block ${done ? 'done' : ''} ${isNow ? 'now' : ''} ${past && !done && !isNow ? 'past' : ''}"
              data-act="block" data-id="${b.id}">
      <span class="block-t">${b.t}</span>
      <span class="block-label">${esc(b.label)}</span>
      ${isNow ? '<span class="badge-now">now</span>' : ''}
      <span class="block-xp">+${b.kind === 'gate' ? XP.gate : xp}</span>
      <span class="tick">✓</span>
    </div>`;
  });

  /* ---- posture ---- */
  h += `<div class="sect">Daily Posture Block</div>
  <div class="card">
    <div class="block ${d.posture ? 'done' : ''}" data-act="posture" style="margin:0 0 10px">
      <span class="block-label" style="font-weight:500">5-minute posture block</span>
      <span class="block-xp">+${XP.posture}</span><span class="tick">✓</span>
    </div>
    ${POSTURE.map(([n, c2]) => `<div class="kv"><span>${esc(n)}</span><span style="font-size:11px">${esc(c2)}</span></div>`).join('')}
  </div>`;

  /* ---- stats ---- */
  h += `<div class="sect">Attributes</div><div class="stat-grid">
    ${Object.entries(STATS).map(([k, v]) => `<div class="stat">
      <div class="stat-g" style="color:${v.color}">${v.glyph}</div>
      <div class="stat-v" style="color:${v.color}">${Math.round(S.stats[k] / 100)}</div>
      <div class="stat-k">${k}</div></div>`).join('')}
  </div>`;

  /* ---- close the day ---- */
  h += `<div class="sect">Close</div><div class="card">
    ${d.closed
      ? `<div class="${d.clean ? 'ok-box' : 'warn'}">${d.clean
          ? '✓ Day closed clean. Streak advanced.'
          : '✗ Day closed short. Streak reset.'}</div>`
      : `<div class="quest-blurb" style="margin-bottom:11px">Closing scores the Core Four, advances or breaks
         the streak, and writes the day to your Obsidian log.</div>
         <button class="btn gold wide" data-act="closeday">Close the day</button>`}
  </div>`;

  /* ---- 14-day spark ---- */
  const hist = history(14);
  const max = Math.max(...hist.map(x => x.xp), 100);
  h += `<div class="sect">Last 14 Days</div><div class="card">
    <div class="spark">${hist.map(x => `<i class="${x.clean ? 'clean' : (x.xp > 0 ? 'on' : '')}"
      style="height:${Math.max(2, (x.xp / max) * 100)}%" title="${x.date}: ${x.xp} XP"></i>`).join('')}</div>
    <div class="rank-sub" style="margin-top:8px">${fmtShort(hist[0].date)} → ${fmtShort(hist[13].date)}
      · best streak ${S.bestStreak}</div>
  </div>`;

  return h;
}

/* =============================== QUESTS ============================== */
function viewQuests() {
  const open = S.quests.filter(q => !q.shipped);
  const done = S.quests.filter(q => q.shipped);
  const todayGate = gateForDate(today());

  let h = `<div class="card framed">
    <div class="gate-tag"><span>Pipeline</span><span>${open.length} open · ${done.length} shipped</span></div>
    <div class="quest-blurb" style="margin-top:8px">Every quest carries one <b style="color:var(--gold)">gate</b>:
    the single step that needs another human to see it. That is the step this app exists to force.</div>
  </div>`;

  h += `<div class="sect">Open</div>`;
  open.sort((a, b) => ({ S: 0, A: 1, B: 2, C: 3 }[a.tier] ?? 9) - ({ S: 0, A: 1, B: 2, C: 3 }[b.tier] ?? 9));
  open.forEach(q => h += questCard(q, todayGate && todayGate.id === q.id));

  if (done.length) {
    h += `<div class="sect">Shipped</div>`;
    done.forEach(q => h += questCard(q, false));
  }

  h += `<div class="sect">New Quest</div>
  <div class="card">
    <label class="fld"><span>Name</span><input type="text" id="nq-name" placeholder="What is it called"></label>
    <label class="fld"><span>The gate — the step needing someone else's verdict</span>
      <input type="text" id="nq-gate" placeholder="Send the DM / publish the page / submit the bid"></label>
    <label class="fld"><span>Steps, one per line</span>
      <textarea id="nq-steps" rows="3" placeholder="Draft it&#10;Publish it&#10;Send it"></textarea></label>
    <div class="btn-row">
      <select id="nq-tier" style="flex:0 0 90px">
        <option value="S">S tier</option><option value="A" selected>A tier</option>
        <option value="B">B tier</option><option value="C">C tier</option>
      </select>
      <button class="btn gold" data-act="addquest">Add quest</button>
    </div>
  </div>`;
  return h;
}

function questCard(q, isTodayGate) {
  const pct = q.steps.length ? (q.done.length / q.steps.length) * 100 : 0;
  return `<div class="card quest ${q.shipped ? 'shipped' : ''}" ${isTodayGate ? 'style="border-color:rgba(212,160,74,.45)"' : ''}>
    <div class="quest-head">
      <div class="tier ${q.tier}">${q.tier}</div>
      <div style="flex:1;min-width:0">
        <div class="quest-name">${esc(q.name)}</div>
        <div class="quest-blurb">${esc(q.blurb)}</div>
      </div>
      ${q.shipped ? '<span class="shipped-stamp">Shipped</span>' : ''}
    </div>
    ${!q.shipped && q.gate ? `<div class="quest-gate"><b>${isTodayGate ? "Today's gate" : 'Gate'}</b>${esc(q.gate)}</div>` : ''}
    <div class="pbar"><i style="width:${pct}%"></i></div>
    <div class="steps">${q.steps.map((s, i) => `
      <div class="step ${q.done.includes(i) ? 'on' : ''}" data-act="step" data-q="${q.id}" data-i="${i}">
        <span class="tick" style="flex:0 0 17px;height:17px;${q.done.includes(i)
          ? 'background:var(--jade);border-color:var(--jade);color:#08120e' : ''}">✓</span>
        <span>${esc(s)}</span>
      </div>`).join('')}</div>
    ${!q.shipped ? `<div class="btn-row" style="margin-top:12px">
      <button class="btn jade sm" data-act="ship" data-q="${q.id}">Mark shipped · +${XP.boss} XP</button>
    </div>` : ''}
  </div>`;
}

/* ================================ BODY =============================== */
function viewBody() {
  const d = day(viewDate);
  const wid = workoutFor(viewDate);
  const isToday = viewDate === today();

  let h = `<div class="card">
    <div class="btn-row">
      <button class="btn sm" data-act="dateshift" data-n="-1">←</button>
      <div style="flex:2;text-align:center">
        <div style="font-family:var(--font-plate);font-size:15px">${DAYNAMES[parseDate(viewDate).getDay()]}</div>
        <div class="rank-sub">${viewDate}${isToday ? ' · today' : ''}</div>
      </div>
      <button class="btn sm" data-act="dateshift" data-n="1" ${isToday ? 'disabled' : ''}>→</button>
    </div>
    <label class="fld" style="margin-top:12px"><span>Override today's session</span>
      <select data-act="setday">
        <option value="rest" ${wid === 'rest' ? 'selected' : ''}>Rest day</option>
        ${Object.keys(W).map(k => `<option value="${k}" ${wid === k ? 'selected' : ''}>${esc(W[k].n)}</option>`).join('')}
      </select></label>
    <label class="fld" style="margin-bottom:0"><span>Bodyweight (lb)</span>
      <input type="number" step="0.1" data-act="weight" value="${d.weight ?? ''}" placeholder="${S.targets.weightLb}"></label>
  </div>`;

  if (wid === 'rest') {
    h += `<div class="card framed"><div class="empty">Rest day.<br><br>
      Muscle is built while you rest and eat, not while you train.
      Do the posture block and hit ${S.targets.kcal} kcal.</div></div>`;
    return h;
  }

  const wk = W[wid];
  const doneCount = wk.ex.filter(([id]) => exDone(id, viewDate)).length;

  h += `<div class="card framed">
    <div class="gate-tag"><span>${esc(wk.n)}</span><span>${doneCount}/${wk.ex.length}</span></div>
    <div class="quest-blurb" style="margin-top:8px">${esc(wk.focus)}</div>
    <div class="pbar"><i style="width:${(doneCount / wk.ex.length) * 100}%"></i></div>
    <div class="cue" style="margin-top:12px"><b>The one rule:</b> your last set of every exercise ends with
      <b>0–2 reps left in the tank</b>. Light weight taken close to failure builds the same muscle as heavy
      weight — that is why one 25 lb dumbbell is enough.</div>
  </div>`;

  h += `<div class="sect">Warm-up — 4 minutes</div>
  <div class="card"><div class="quest-blurb">30 jumping jacks → 10 arm circles each way → 10 bodyweight
    squats → 10 hip hinges → 5 slow reps of your first exercise at an easy level. Do not static-stretch cold.</div></div>`;

  h += `<div class="sect">Session</div>`;
  wk.ex.forEach(([id, sets, lo, hi]) => h += exCard(id, sets, lo, hi, d));
  return h;
}

function exCard(id, sets, lo, hi, d) {
  const e = EX[id];
  const done = exDone(id, viewDate);
  const open = openEx === id;
  const unit = (id === 'sideplank' || id === 'carry') ? 'sec' : 'reps';
  const cur = d.ex[id] || [];
  const prev = lastTimeDid(id, viewDate);
  const lvl = S.levels[id] || 0;

  let rows = '';
  for (let n = 0; n < sets; n++) {
    const s = cur[n] || {};
    rows += `<div class="setrow">
      <label>Set ${n + 1}</label>
      ${e.w ? `<input class="mini" type="number" inputmode="numeric" placeholder="lb" value="${s.w ?? ''}"
                 data-act="set" data-ex="${id}" data-n="${n}" data-f="w" style="flex:0 0 62px">` : ''}
      <input class="mini" type="number" inputmode="numeric" placeholder="${unit}" value="${s.r ?? ''}"
             data-act="set" data-ex="${id}" data-n="${n}" data-f="r" style="flex:1">
      <input class="mini" type="number" inputmode="numeric" placeholder="RIR" value="${s.rir ?? ''}"
             data-act="set" data-ex="${id}" data-n="${n}" data-f="rir" style="flex:0 0 62px">
    </div>`;
  }

  return `<div class="ex-card ${done ? 'done' : ''}">
    <div class="ex-head" data-act="openex" data-id="${id}">
      <span class="tick" style="${done ? 'background:var(--jade);border-color:var(--jade);color:#08120e' : ''}">✓</span>
      <div style="flex:1;min-width:0">
        <div class="ex-n">${esc(e.n)}</div>
        <div class="ex-m">${sets} × ${lo}–${hi} ${unit} · ${esc(e.m)}</div>
      </div>
      <span class="ex-count">${cur.filter(s => s && s.r).length}/${sets}</span>
    </div>
    ${open ? `<div class="ex-body">
      ${rows}
      ${prev ? `<div class="rank-sub" style="margin-top:10px">Last time · ${fmtShort(prev.date)} ·
        ${esc(prev.sets.map(s => (s.w ? s.w + '×' : '') + s.r).join(', '))}</div>` : ''}
      <div class="cue">${e.cue}</div>
      <div class="why">${esc(e.why)}</div>
      <div class="rank-sub" style="margin-top:12px">Progression ladder — tap your current level</div>
      <div class="ladder">${e.ladder.map((r, i) => `
        <span class="rung ${i === lvl ? 'on' : ''}" data-act="rung" data-ex="${id}" data-i="${i}">${i + 1}. ${esc(r)}</span>`).join('')}</div>
      <div class="rank-sub" style="margin-top:10px">RIR = reps left in reserve. Last set should be
        <b style="color:var(--gold)">0–2</b>. If you write 4+, the set did nothing.</div>
    </div>` : ''}
  </div>`;
}

/* ================================ FUEL =============================== */
function viewFuel() {
  const d = day(today());
  const t = totals(today());
  const pct = Math.min(100, (t.kcal / S.targets.kcal) * 100);
  const left = Math.max(0, S.targets.kcal - t.kcal);

  let h = `<div class="card framed">
    <div class="fuel-head">
      <span class="fuel-big ${t.kcal >= S.targets.kcal ? '' : 'short'}">${t.kcal}</span>
      <span class="fuel-of">/ ${S.targets.kcal} kcal</span>
    </div>
    <div class="fuel-bar"><i style="width:${pct}%"></i></div>
    <div class="kv"><span>Protein</span><span style="color:${t.protein >= S.targets.protein ? 'var(--jade)' : 'var(--ember)'}">${t.protein} / ${S.targets.protein} g</span></div>
    <div class="kv"><span>Still to eat</span><span>${left ? left + ' kcal' : 'Target hit ✓'}</span></div>
    ${left > 0 ? `<div class="quest-blurb" style="margin-top:10px">${left >= 745
      ? 'One gainer shake covers 745 of that. Blend it now, do not wait to feel hungry.'
      : 'Close the gap with milk, peanut butter, or oil stirred into whatever is already cooked.'}</div>` : ''}
  </div>`;

  /* ---- camera ---- */
  h += `<div class="sect">Photograph the plate</div><div class="card">
    ${!S.settings.geminiKey
      ? `<div class="warn">No Gemini key yet. Add one in Codex → Settings and the camera starts working.
         Until then, use the buttons below.</div>`
      : `<input type="file" accept="image/*" capture="environment" id="shotinput" style="display:none">
         <button class="btn gold wide" data-act="shoot" ${busy ? 'disabled' : ''}>
           ${busy ? '<span class="spinner"></span> Reading the plate…' : '◉  Take a photo of your food'}</button>`}
    ${visionResult ? renderVision() : ''}
  </div>`;

  /* ---- quick add ---- */
  h += `<div class="sect">Quick add</div><div class="card">
    <div>${FOODS.map((f, i) => `<span class="food-chip ${i === 0 ? 'hero' : ''}" data-act="food" data-i="${i}">
      ${esc(f[0])} <i>${f[1]}</i></span>`).join('')}</div>
    <div class="btn-row" style="margin-top:12px">
      <input type="text" id="cf-name" placeholder="Anything else" style="flex:2">
      <input type="number" id="cf-kcal" inputmode="numeric" placeholder="kcal" style="flex:0 0 76px">
      <input type="number" id="cf-pro" inputmode="numeric" placeholder="g" style="flex:0 0 60px">
      <button class="btn" data-act="customfood" style="flex:0 0 54px">Add</button>
    </div>
  </div>`;

  /* ---- log ---- */
  h += `<div class="sect">Today's log</div><div class="card">
    ${d.meals.length ? d.meals.map(m => `<div class="meal">
        <span class="rank-sub" style="flex:0 0 38px">${esc(m.time || '')}</span>
        <span style="flex:1">${esc(m.name)}${m.src === 'photo' ? ' <span class="conf medium">photo</span>' : ''}</span>
        <span class="meal-k">${m.kcal}</span>
        <span class="meal-x" data-act="delmeal" data-id="${m.id}">×</span>
      </div>`).join('')
      : '<div class="empty">Nothing logged yet today.<br>Eat on the clock, not on hunger.</div>'}
  </div>`;

  h += `<div class="card"><div class="quest-blurb"><b style="color:var(--gold)">The gainer shake:</b>
    1 cup whole milk + 2 tbsp peanut butter + 1 banana + 40g oats + 1 cup yogurt. Blend.
    745 kcal, 42g protein. Drink it <b>between</b> meals — never instead of one.</div></div>`;
  return h;
}

function renderVision() {
  const v = visionResult;
  return `<div style="margin-top:14px">
    <img class="shot" src="${v.preview}" alt="plate">
    <div class="rank-sub" style="margin-top:10px">${esc(v.model)} · estimate</div>
    ${v.items.map(i => `<div class="vision-item">
      <div style="flex:1">
        <div>${esc(i.name)}</div>
        <div class="vision-portion">${esc(i.portion)}</div>
      </div>
      <span class="conf ${esc(i.confidence)}">${esc(i.confidence)}</span>
      <span class="meal-k">${i.kcal} kcal · ${i.protein}g</span>
    </div>`).join('')}
    ${v.note ? `<div class="why">${esc(v.note)}</div>` : ''}
    <div class="fuel-head" style="margin-top:12px">
      <span class="fuel-big" style="font-size:26px">${v.totals.kcal}</span>
      <span class="fuel-of">kcal · ${v.totals.protein}g protein</span>
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn gold" data-act="acceptvision">Log this plate</button>
      <button class="btn" data-act="discardvision">Discard</button>
    </div>
    <div class="hint">Photo estimates run high on purpose — for a hard gainer, undercounting is the
      more expensive mistake. Adjust by hand if it looks wrong.</div>
  </div>`;
}

/* ================================ CODEX ============================== */
function viewCodex() {
  const li = levelInfo(S.xp);
  const r = rankFor(li.level);
  const hist = history(30);
  const trained = hist.filter(x => x.trained).length;
  const gates = hist.filter(x => x.gate).length;
  const avgKcal = Math.round(hist.filter(x => x.kcal > 0).reduce((a, x) => a + x.kcal, 0) /
    Math.max(1, hist.filter(x => x.kcal > 0).length));
  const shipped = S.quests.filter(q => q.shipped).length;

  let h = `<div class="card framed">
    <div class="gate-tag"><span>The Record</span><span>since ${esc(S.created)}</span></div>
    <div class="kv"><span>Level</span><span>${li.level} · ${esc(r.name)}</span></div>
    <div class="kv"><span>Total XP</span><span>${S.xp.toLocaleString()}</span></div>
    <div class="kv"><span>Current streak</span><span>${S.streak} days (best ${S.bestStreak})</span></div>
    <div class="kv"><span>Gates cleared, last 30</span><span style="color:var(--gold)">${gates}</span></div>
    <div class="kv"><span>Sessions trained, last 30</span><span>${trained}</span></div>
    <div class="kv"><span>Average kcal logged</span><span>${avgKcal || 0}</span></div>
    <div class="kv"><span>Projects shipped</span><span style="color:var(--jade)">${shipped}</span></div>
  </div>`;

  h += `<div class="sect">Ranks</div><div class="card">
    ${RANKS.map(rk => `<div class="kv">
      <span style="color:${li.level >= rk.at ? rk.color : 'var(--ink-faint)'}">
        ${li.level >= rk.at ? '◆' : '◇'} ${esc(rk.name)}</span>
      <span>Lv ${rk.at}</span></div>`).join('')}
  </div>`;

  /* ---- notifications ---- */
  const topic = S.settings.ntfyTopic;
  h += `<div class="sect">Notifications</div><div class="card">
    ${topic
      ? `<div class="ok-box">Topic: <b>${esc(topic)}</b><br>
         Subscribe to this exact topic in the ntfy Android app.</div>`
      : `<div class="warn">No topic yet. Generate one, then subscribe to it in the ntfy app on your phone.</div>`}
    <div class="btn-row" style="margin-top:12px">
      <button class="btn" data-act="gentopic">${topic ? 'New topic' : 'Generate topic'}</button>
      <button class="btn" data-act="copytopic" ${topic ? '' : 'disabled'}>Copy</button>
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn jade" data-act="testnotify">Send a test</button>
      <button class="btn gold" data-act="syncpush">Sync next 48h</button>
    </div>
    <div class="hint">Last sync: ${S.settings.lastPushSync
      ? esc(new Date(S.settings.lastPushSync).toLocaleString()) : 'never'}.
      Reminders are queued on ntfy's servers, so they fire even with this app closed and your PC off.
      Open the app every couple of days to top the queue up.</div>
    <div class="hint" style="margin-top:8px"><b>Setup:</b> install <b>ntfy</b> from the Play Store →
      + → subscribe to the topic above. Anyone who guesses the topic could read it, so keep it random.</div>
  </div>`;

  /* ---- gemini ---- */
  h += `<div class="sect">Food camera</div><div class="card">
    <label class="fld"><span>Gemini API key</span>
      <input type="password" id="gk" value="${esc(S.settings.geminiKey)}" placeholder="AIza..."></label>
    <label class="fld"><span>Model</span>
      <input type="text" id="gm" value="${esc(S.settings.geminiModel)}"></label>
    <button class="btn wide" data-act="savegemini">Save key</button>
    <div class="hint">Free key from <b>aistudio.google.com/apikey</b>. It is stored only on this device and
      sent only to Google. The free tier covers far more photos than you will take.</div>
  </div>`;

  /* ---- targets ---- */
  h += `<div class="sect">Targets</div><div class="card">
    <label class="fld"><span>Daily calories</span>
      <input type="number" id="t-kcal" value="${S.targets.kcal}"></label>
    <label class="fld"><span>Daily protein (g)</span>
      <input type="number" id="t-pro" value="${S.targets.protein}"></label>
    <label class="fld"><span>Goal bodyweight (lb)</span>
      <input type="number" id="t-gw" value="${S.targets.goalWeightLb}"></label>
    <label class="fld"><span>Training split</span>
      <select id="t-split">
        <option value="4day" ${S.settings.split === '4day' ? 'selected' : ''}>4 day — Upper/Lower</option>
        <option value="3day" ${S.settings.split === '3day' ? 'selected' : ''}>3 day — Full body (busy mode)</option>
      </select></label>
    <button class="btn wide" data-act="savetargets">Save targets</button>
  </div>`;

  /* ---- schedule editor ---- */
  h += `<div class="sect">Schedule</div><div class="card">
    ${S.schedule.map(b => `<div class="setrow">
      <input type="time" value="${b.t}" data-act="btime" data-id="${b.id}" style="flex:0 0 108px">
      <input type="text" value="${esc(b.label)}" data-act="blabel" data-id="${b.id}" style="flex:1">
      <span class="rung ${b.push ? 'on' : ''}" data-act="bpush" data-id="${b.id}">◉</span>
    </div>`).join('')}
    <div class="hint">The gold dot means that block sends a push. Changing a time only affects
      reminders not already queued — re-sync after editing.</div>
  </div>`;

  /* ---- obsidian ---- */
  h += `<div class="sect">Obsidian</div><div class="card">
    <div class="quest-blurb">Today's entry, formatted for your vault at
      <b>${esc(S.settings.vaultPath)}/${today()}.md</b></div>
    <pre class="md">${esc(markdownFor(today()))}</pre>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn" data-act="copymd">Copy markdown</button>
      <button class="btn" data-act="downloadmd">Download .md</button>
    </div>
    <div class="hint">On your phone: copy, then paste into a new note in Obsidian mobile.
      On desktop: download and drop the file into the vault folder.</div>
  </div>`;

  /* ---- data ---- */
  h += `<div class="sect">Data</div><div class="card">
    <div class="quest-blurb">Everything lives in this browser's storage. Back it up before clearing
      browsing data, reinstalling, or switching phones.</div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn" data-act="export">Export backup</button>
      <button class="btn" data-act="importbtn">Import</button>
    </div>
    <input type="file" accept=".json,application/json" id="importfile" style="display:none">
    <div class="btn-row" style="margin-top:8px">
      <button class="btn danger wide" data-act="wipe">Erase everything</button>
    </div>
  </div>`;

  h += `<div class="card"><div class="why" style="text-align:center;font-size:12.5px">
    Built 2026-08-10. The Gate exists because roughly eighty hours went into building things and about
    five went into sending them. Level is a side effect. Sending is the point.</div></div>`;
  return h;
}

/* ---------------------- surgical updates (no repaint) -----------------
   Used while the user is typing sets, where a full render() would steal
   focus from the field they just moved into.
--------------------------------------------------------------------- */
function refreshExCard(exId) {
  const card = document.querySelector(`.ex-head[data-id="${exId}"]`);
  if (!card) return;
  const d = day(viewDate);
  const wid = workoutFor(viewDate);
  const row = (W[wid] ? W[wid].ex : []).find(e => e[0] === exId);
  if (!row) return;
  const logged = (d.ex[exId] || []).filter(s => s && s.r).length;
  const done = logged >= row[1];

  card.parentElement.classList.toggle('done', done);
  const count = card.querySelector('.ex-count');
  if (count) count.textContent = `${logged}/${row[1]}`;
  const tick = card.querySelector('.tick');
  if (tick) tick.style.cssText = done
    ? 'background:var(--jade);border-color:var(--jade);color:#08120e' : '';

  // session progress bar at the top of the view
  const bar = document.querySelector('.card.framed .pbar > i');
  if (bar) {
    const doneCount = W[wid].ex.filter(([id]) => exDone(id, viewDate)).length;
    bar.style.width = `${(doneCount / W[wid].ex.length) * 100}%`;
    const tag = document.querySelector('.card.framed .gate-tag span:last-child');
    if (tag) tag.textContent = `${doneCount}/${W[wid].ex.length}`;
  }
}

function refreshHUD() {
  const li = levelInfo(S.xp);
  const orb = document.querySelector('.orb');
  if (orb) orb.style.setProperty('--p', li.pct.toFixed(1));
  const lvl = document.querySelector('.orb-lvl');
  if (lvl) lvl.textContent = li.level;
  const bar = document.querySelector('.xpbar > i');
  if (bar) bar.style.width = `${li.pct.toFixed(1)}%`;
  const readout = document.querySelectorAll('.hud-main .rank-sub')[1];
  if (readout) readout.textContent = `${li.into.toLocaleString()} / ${li.need.toLocaleString()} XP`;
}

/* ============================== FEEDBACK ============================= */
function toast(msg, cls) {
  const el = document.createElement('div');
  el.className = 'toast ' + (cls || '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function levelUpScreen(level) {
  const r = rankFor(level);
  $('#levelup').innerHTML = `<div class="lu-inner">
    <div class="lu-tag">Realm Advanced</div>
    <div class="lu-lvl">${level}</div>
    <div class="lu-rank" style="color:${r.color}">${esc(r.name)}</div>
    <div class="lu-hint">tap to continue</div></div>`;
  $('#levelup').classList.add('show');
  if (navigator.vibrate) navigator.vibrate([50, 60, 120]);
}

onXp(({ gained, label, levelUp, level }) => {
  if (gained > 0) toast(`+${gained} XP  ${label || ''}`.trim(), 'xp');
  else if (gained < 0) toast(`${gained} XP`, 'bad');
  if (levelUp) setTimeout(() => levelUpScreen(level), 420);
});
