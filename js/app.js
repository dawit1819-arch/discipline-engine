/* =====================================================================
   DISCIPLINE ENGINE — controller and boot
   All interaction is delegated from document, so re-rendering never
   orphans a listener.
   ===================================================================== */

/* ------------------------------- helpers ------------------------------ */
function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

const val = id => (document.getElementById(id) || {}).value || '';

/* ------------------------------- actions ------------------------------ */
const ACTIONS = {

  async wake() {
    if (moneyDay() && !moneyDay().closed) return;
    try {
      const draft = readMoneyPlan();
      S.money.nextPlan = draft.tasks.length ? normalizePlan(draft) : draft;
      startMoneyDay(); render();
      await moneySyncFeedback();
    } catch(e) { toast(e.message, 'bad'); }
  },
  async sleep() {
    const d = sleepMoneyDay(); if (!d) return;
    render(); document.getElementById('checkin')?.scrollIntoView({behavior:'smooth'});
    if (S.settings.ntfyTopic) {
      try { await ntfySend({topic:S.settings.ntfyTopic,title:'Going to sleep — daily check-in',message:'Open Today and save what got done, $ earned, blockers, and tomorrow’s money task.',priority:4}); }
      catch(e) { S.money.syncError=e.message;saveNow();toast(e.message,'bad'); }
    }
  },
  async savemoneyplan() {
    try {
      const raw=readMoneyPlan(),plan=raw.tasks.length?normalizePlan(raw):raw;
      const d=moneyDay();
      if(d&&!d.closed){
        d.tasks=plan.tasks.map((t,i)=>({...t,project:projectRef(t.projectId),done:d.tasks[i]?.title===t.title&&d.tasks[i]?.projectId===t.projectId?!!d.tasks[i].done:false}));
        if(d.gate!==plan.gate)d.gateDone=false;
        d.gate=plan.gate;d.mainProject=projectRef(plan.mainProject);d.gateProject=projectRef(plan.gateProjectId);
      } else { S.money.draft=plan.tasks;S.money.planDraft=plan;S.money.nextPlan=plan; }
      saveNow();render();toast('Plan saved.');if(d&&!d.closed)await moneySyncFeedback();
    }catch(e){toast(e.message,'bad');}
  },
  moneytask(el) {
    const d=moneyDay();if(!d||d.closed)return;
    const t=d.tasks.find(t=>t.id===el.dataset.id);if(t){t.done=!t.done;saveNow();render();}
  },
  moneygate() {
    const d=moneyDay();if(!d||d.closed||d.gateDone||!d.gate.trim())return;
    d.gateDone=true;
    const legacy=day(d.date);
    if(!legacy.gateDone){legacy.gateDone=true;legacy.gateId=d.gateProject?.id||null;S.gateMisses=0;award(XP.gate,'GLD','THE GATE',d.date);}
    saveNow();render();
  },
  focusdone() {
    const d=moneyDay();if(!d||d.closed||!d.longFocus)return;
    d.longFocus.done=!d.longFocus.done;saveNow();render();
  },
  showprojects() {showInactiveProjects=!showInactiveProjects;render();},
  saveproject(el) {
    try {
      const id=el.dataset.id;
      saveProject(id==='new'?null:id,{name:val('pn-'+id),goal:val('pg-'+id),link:val('pl-'+id),status:id==='new'?'active':val('ps-'+id)});
      render();toast('Project saved.');
    }catch(e){toast(e.message,'bad');}
  },
  moveproject(el) {moveProject(el.dataset.id,Number(el.dataset.direction),showInactiveProjects);render();},
  async savefocus() {
    try {
      changeLongFocus({projectId:val('lf-project'),startDate:val('lf-start'),length:val('lf-length')==='custom'?val('lf-custom'):val('lf-length'),minimum:val('lf-minimum')},val('lf-reason'));
      render();toast('Long Focus saved.');if(moneyDay()&&!moneyDay().closed)await moneySyncFeedback();
    }catch(e){toast(e.message,'bad');}
  },
  endfocus() {
    try{changeLongFocus(null,val('lf-reason'));render();toast('Long Focus ended; change logged.');}catch(e){toast(e.message,'bad');}
  },
  async savecheckin() {
    const d=moneyDay();if(!d)return;
    try {
      const checkin={done:val('ci-done').trim(),blocked:val('ci-blocked').trim(),tomorrow:val('ci-tomorrow').trim()};
      const preview={...d,checkin,updated:new Date().toISOString()};
      if(new TextEncoder().encode(JSON.stringify({type:'de-checkin',v:2,record:preview})).length>4096)
        throw new Error('Check-in is too long for phone sync. Shorten the notes, then save.');
      finishMoneyDay(checkin);render();toast(moneyMet(d)?'Day closed: MET.':'Day closed: MISSED.');await moneySyncFeedback();
    }catch(e){toast(e.message,'bad');}
  },
  async syncmoney() { await moneySyncFeedback(true); },
  later(el) { laterTab=el.dataset.id;laterOpen=true;render(); },
  savemoneytargets() {
    for(const key of ['claude','chatgpt','api','kalshi','polymarket','credit']){
      const n=Number(val('money-'+key));if(!Number.isFinite(n)||n<0)return toast('Money targets must be zero or more.','bad');
    }
    for(const key of ['claude','chatgpt','api'])S.money.bills[key]=Number(val('money-'+key));
    for(const key of ['kalshi','polymarket','credit'])S.money.recover[key]=Number(val('money-'+key));
    saveNow();render();toast('Money targets saved.');
  },
  async saventfy() {
    const topic=val('ntfy-topic').trim();if(!validTopic(topic))return toast('Use letters, numbers, _ or -, max 64 characters.','bad');
    S.settings.ntfyTopic=topic;saveNow();render();await moneySyncFeedback();
  },
  async choosevault() {
    try{await chooseVault();toast('Vault folder connected.');render();}catch(e){if(e.name!=='AbortError')toast(e.message,'bad');}
  },
  async allowvault() {
    try{
      if(!await vaultHandle())return toast('Choose the Discipline folder first.','bad');
      await writeVault(true);await moneySyncFeedback();
    }catch(e){toast(e.message,'bad');}
  },
  async coachconfig() {
    const text=JSON.stringify({topic:S.settings.ntfyTopic,vault:'C:\\Users\\Dawit\\Second Brain\\Logs\\Discipline'},null,2);
    try{
      if(window.showSaveFilePicker){
        const f=await window.showSaveFilePicker({suggestedName:'coach-config.json',types:[{description:'Coach config',accept:{'application/json':['.json']}}]});
        const w=await f.createWritable();await w.write(text);await w.close();toast('Config saved.');
      }else{download('coach-config.json',text,'application/json');toast('Save this on the laptop as tools/coach-config.json.');}
    }catch(e){if(e.name!=='AbortError')toast(e.message,'bad');}
  },

  /* ---- navigation ---- */
  tab(el) { TAB = el.dataset.tab; openEx = null; render(); window.scrollTo(0, 0); },

  dateshift(el) {
    const n = Number(el.dataset.n);
    const next = shiftDate(viewDate, n);
    if (next > today()) return;
    viewDate = next; openEx = null; render();
  },

  openex(el) { openEx = openEx === el.dataset.id ? null : el.dataset.id; render(); },

  /* ---- the gate ---- */
  cleargate() {
    clearGate(today());
    if (navigator.vibrate) navigator.vibrate([40, 50, 40, 50, 90]);
    render();
  },

  /* ---- schedule ---- */
  block(el) { toggleBlock(el.dataset.id); render(); },
  posture() { togglePosture(); render(); },

  closeday() {
    const res = closeDay(today());
    if (res.already) return toast('Already closed.');
    toast(res.clean ? 'Day closed clean. Streak advanced.' : 'Day closed short. Streak reset.',
      res.clean ? 'xp' : 'bad');
    render();
  },

  /* ---- quests ---- */
  step(el) { toggleQuestStep(el.dataset.q, Number(el.dataset.i)); render(); },

  ship(el) {
    const q = S.quests.find(x => x.id === el.dataset.q);
    if (!q) return;
    if (!confirm(`Mark "${q.name}" as shipped?\n\nOnly do this if a real person has actually seen it.`)) return;
    shipQuest(q.id);
    render();
  },

  addquest() {
    const name = val('nq-name').trim();
    if (!name) return toast('Give it a name first.', 'bad');
    addQuest({
      name,
      gate: val('nq-gate').trim(),
      tier: val('nq-tier'),
      steps: val('nq-steps').split('\n').map(s => s.trim()).filter(Boolean),
    });
    toast('Quest added.');
    render();
  },

  /* ---- fuel ---- */
  food(el) {
    const f = FOODS[Number(el.dataset.i)];
    addMeal({ name: f[0], kcal: f[1], protein: f[2], src: 'quick' });
    render();
  },

  customfood() {
    const name = val('cf-name').trim();
    const kcal = Number(val('cf-kcal'));
    if (!name || !kcal) return toast('Need a name and a calorie number.', 'bad');
    addMeal({ name, kcal, protein: Number(val('cf-pro')) || 0, src: 'manual' });
    render();
  },

  delmeal(el) { removeMeal(Number(el.dataset.id)); render(); },

  shoot() { document.getElementById('shotinput').click(); },

  acceptvision() {
    if (!visionResult) return;
    visionResult.items.forEach(i =>
      addMeal({ name: i.name + (i.portion ? ` (${i.portion})` : ''), kcal: i.kcal, protein: i.protein, src: 'photo' }));
    visionResult = null;
    render();
  },

  discardvision() { visionResult = null; render(); },

  /* ---- body ---- */
  rung(el) {
    S.levels[el.dataset.ex] = Number(el.dataset.i);
    save(); render();
  },

  /* ---- notifications ---- */
  async gentopic() {
    if (S.settings.ntfyTopic &&
      !confirm('Replace your topic? You will have to re-subscribe in the ntfy app.')) return;
    S.settings.ntfyTopic = randomTopic();
    S.scheduledPushes = {};
    saveNow();
    toast('Topic generated.');
    render();
  },

  async copytopic() {
    await copyText(S.settings.ntfyTopic);
    toast('Topic copied.');
  },

  async testnotify() {
    await ensureLocalPermission();
    const r = await testNotification();
    if (r.error) toast('ntfy failed: ' + r.error, 'bad');
    else if (r.ntfy) toast('Sent. Check your phone.');
    else if (r.local) toast('Local notification sent. No ntfy topic set.');
    else toast('Notifications are blocked in this browser.', 'bad');
  },

  async syncpush(el) {
    if (!S.settings.ntfyTopic) return toast('Generate a topic first.', 'bad');
    el.disabled = true; el.textContent = 'Syncing…';
    try {
      const r = await syncPush();
      await scheduleGateWarning();
      toast(r.sent ? `${r.sent} reminders queued.` : 'Already up to date.');
      if (r.failures.length) toast(r.failures[0], 'bad');
    } catch (e) {
      toast(e.message, 'bad');
    }
    render();
  },

  /* ---- settings ---- */
  savegemini() {
    S.settings.geminiKey = val('gk').trim();
    S.settings.geminiModel = val('gm').trim() || 'gemini-2.5-flash';
    saveNow();
    toast('Saved. The camera is live.');
    render();
  },

  savetargets() {
    S.targets.kcal = Number(val('t-kcal')) || S.targets.kcal;
    S.targets.protein = Number(val('t-pro')) || S.targets.protein;
    S.targets.goalWeightLb = Number(val('t-gw')) || S.targets.goalWeightLb;
    S.settings.split = val('t-split');
    saveNow();
    toast('Targets saved.');
    render();
  },

  bpush(el) {
    const b = S.schedule.find(x => x.id === el.dataset.id);
    if (b) { b.push = !b.push; save(); render(); }
  },

  /* ---- obsidian + data ---- */
  async copymd() {
    await copyText(markdownFor(today()));
    toast('Markdown copied. Paste into Obsidian.');
  },

  downloadmd() { download(`${today()}.md`, markdownFor(today()), 'text/markdown'); },

  export() {
    download(`discipline-engine-${today()}.json`, exportJSON(), 'application/json');
    toast('Backup downloaded.');
  },

  importbtn() { document.getElementById('importfile').click(); },

  wipe() {
    if (!confirm('Erase every log, quest, level and streak?\n\nThis cannot be undone.')) return;
    if (!confirm('Really? Export a backup first if you are not certain.')) return;
    localStorage.removeItem(KEY);
    location.reload();
  },
};

function readMoneyPlan() {
  const tasks=[];
  for(let i=0;i<3;i++){
    const title=val('mt-'+i).trim(),hours=val('md-'+i);
    if(title)tasks.push({title,afterHours:hours===''?null:Number(hours),projectId:val('mp-'+i)});
  }return {tasks,gate:val('money-gate').trim(),mainProject:val('main-project'),gateProjectId:val('gate-project')};
}
async function moneySyncFeedback(force=false) {
  const errors=await exchangeMoney(force);
  toast(errors.length?'Saved locally. Sync needs attention.':'Sync finished.',errors.length?'bad':'');render();
}
document.addEventListener('input',e=>{
  const el=e.target,d=moneyDay();
  if(el.hasAttribute('data-money-earned')&&d){
    const n=Number(el.value);if(Number.isFinite(n)&&n>=0&&n<=1000000000){d.earned=Math.round(n*100)/100;save();}
  }
  if(el.dataset.checkin&&d){d.checkin[el.dataset.checkin]=el.value;save();}
  if(el.hasAttribute('data-money-draft')||el.hasAttribute('data-money-hours')||el.hasAttribute('data-money-gate')||el.hasAttribute('data-plan-project')&&el.id!=='lf-project'){
    if(!d||d.closed){S.money.planDraft=readMoneyPlan();S.money.draft=S.money.planDraft.tasks;save();}
  }
});
document.addEventListener('toggle',e=>{if(e.target.id==='later')laterOpen=e.target.open;},true);
window.addEventListener('pagehide',saveNow);

/* --------------------------- event delegation ------------------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act],[data-tab]');
  if (!el) return;
  const act = el.dataset.tab ? 'tab' : el.dataset.act;
  const fn = ACTIONS[act];
  if (!fn) return;
  // inputs handle themselves on change; do not fire twice
  if (el.tagName === 'INPUT' && el.type !== 'button' || el.tagName === 'SELECT') return;
  e.preventDefault();
  fn(el);
});

document.addEventListener('change', async e => {
  const el = e.target;
  const act = el.dataset.act;

  if (el.id === 'shotinput' && el.files && el.files[0]) {
    busy = true; render();
    try {
      visionResult = await analyzeFoodPhoto(el.files[0]);
      toast(`${visionResult.totals.kcal} kcal estimated.`);
    } catch (err) {
      visionResult = null;
      toast(err.message === 'NO_KEY' ? 'Add a Gemini key in Codex first.' : err.message, 'bad');
    }
    busy = false; render();
    return;
  }

  if (el.id === 'importfile' && el.files && el.files[0]) {
    try {
      importJSON(await el.files[0].text());
      toast('Backup restored.');
      location.reload();
    } catch (err) { toast('That file is not a valid backup.', 'bad'); }
    return;
  }

  if (!act) return;

  switch (act) {
    case 'set': {
      const { ex, n, f } = el.dataset;
      const d = day(viewDate);
      const cur = (d.ex[ex] && d.ex[ex][n]) || {};
      const next = { ...cur, [f]: el.value === '' ? undefined : Number(el.value) };
      logSet(ex, Number(n), next, viewDate);
      // Deliberately NOT a full render(): `change` fires as focus moves to
      // the next set field, and rebuilding the DOM here would rip that
      // field out from under the keyboard mid-entry. Patch in place.
      refreshExCard(ex);
      refreshHUD();
      break;
    }
    case 'setday': {
      const d = day(viewDate);
      d.dayId = el.value;
      save(); openEx = null; render();
      break;
    }
    case 'weight': {
      const d = day(viewDate);
      d.weight = el.value === '' ? null : Number(el.value);
      if (d.weight) S.targets.weightLb = d.weight;
      save();
      break;
    }
    case 'btime': {
      const b = S.schedule.find(x => x.id === el.dataset.id);
      if (b) { b.t = el.value; S.schedule.sort((a, c) => a.t.localeCompare(c.t)); save(); }
      break;
    }
    case 'blabel': {
      const b = S.schedule.find(x => x.id === el.dataset.id);
      if (b) { b.label = el.value; save(); }
      break;
    }
  }
});

$('#levelup').addEventListener('click', () => $('#levelup').classList.remove('show'));

/* --------------------------------- boot -------------------------------- */
async function boot() {
  // Money days stay open across midnight; sleep/check-in closes them.

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js'); }
    catch (e) { console.warn('[sw] registration failed', e); }
  }

  render();
  exchangeMoney().then(()=>{if(!document.activeElement?.matches('input,textarea'))render();}).catch(e=>console.warn('[money sync]',e.message));

  // Top the ntfy queue up whenever the app is opened — this is what keeps
  // reminders arriving without any server of our own.

  // A new day while the tab sits open should redraw, not lie.
  let lastSeen = today();
  setInterval(() => {
    if (today() !== lastSeen) {
      lastSeen = today();
      viewDate = today();
      render();
    }
    const d=moneyDay();
    if(d&&!d.closed&&!d.sleep&&Date.now()>=d.wake+15*3600000&&!document.getElementById('checkin'))render();
  }, 60000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) exchangeMoney().catch(e=>console.warn('[money sync]',e.message));
  });
  window.addEventListener('online',()=>exchangeMoney().catch(e=>console.warn('[money sync]',e.message)));
  setInterval(()=>{if(!document.hidden)exchangeMoney().catch(e=>console.warn('[money sync]',e.message));},5*60000);
}

boot();
