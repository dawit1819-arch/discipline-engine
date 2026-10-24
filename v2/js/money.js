/* Money Mode keeps the v1 training/XP ledger intact. */
const MONEY_DEFAULTS = () => ({ active: null, days: {}, records: {}, nextPlan: null, seenPlans: [],
  projects: null, longFocus: null, focusHistory: [], focusLog: [],
  bills: { claude: 0, chatgpt: 0, api: 0 }, recover: { kalshi: 0, polymarket: 0, credit: 0 },
  queue: {}, lastSync: null, syncError: '' });
function initMoney() {
  const base = MONEY_DEFAULTS(); S.money = { ...base, ...S.money };
  S.money.bills = { ...base.bills, ...S.money.bills }; S.money.recover = { ...base.recover, ...S.money.recover }; saveNow();
  if (!S.money.projects) {
    const seeded = new Set(SEED_QUESTS.map(q => q.id));
    S.money.projects = S.quests.map(q => ({ id:q.id, name:q.name, goal:q.blurb || '', link:'',
      status:q.shipped || q.status === 'done' ? 'done' : seeded.has(q.id) ? 'paused' : q.status === 'active' ? 'active' : 'paused' }));
    S.money.projects.unshift(
      {id:'river-novel', name:'Novel', goal:'', link:'', status:'active'},
      {id:'youtube', name:'YouTube', goal:'', link:'', status:'active'});
  }
  saveNow();
}
initMoney();
function moneyDay() { return S.money.days[S.money.active] || null; }
function moneyMet(d) { return !!d.gateDone && d.tasks.filter(t => t.done).length >= 2 && (!d.longFocus || !!d.longFocus.done); }
function projectById(id) { return S.money.projects.find(p => p.id === id); }
function projectName(id) { return projectById(id)?.name || id || ''; }
function projectRef(id) { return id ? {id, name:projectName(id)} : null; }
function projectInput(raw) {
  const name=String(raw.name || '').trim(), goal=String(raw.goal || '').trim(), link=String(raw.link || '').trim();
  if (!name || name.length>120 || goal.length>300 || link.length>500) throw new Error('Use a name (120 max), goal (300 max), and optional link/folder (500 max).');
  if (!['active','paused','done'].includes(raw.status)) throw new Error('Choose active, paused, or done.');
  return {name,goal,link,status:raw.status};
}
function saveProject(id, raw) {
  const fields=projectInput(raw), p=projectById(id);
  if(p)Object.assign(p,fields);
  else S.money.projects.push({id:'p-'+crypto.randomUUID(),...fields});
  saveNow();
}
function moveProject(id, direction, includeInactive=true) {
  const list=S.money.projects,i=list.findIndex(p=>p.id===id),visible=list.filter(p=>includeInactive||p.status==='active');
  const neighbor=visible[visible.findIndex(p=>p.id===id)+direction],j=neighbor?list.indexOf(neighbor):-1;
  if(i<0||j<0||j>=list.length)return;
  [list[i],list[j]]=[list[j],list[i]];saveNow();
}
// Calendar arithmetic uses UTC day numbers so DST never changes Day N.
function focusDayNumber(f, date) { return Math.floor((Date.parse(date+'T00:00:00Z')-Date.parse(f.startDate+'T00:00:00Z'))/86400000)+1; }
function focusForDate(date) {
  const f=S.money.longFocus;if(!f)return null;
  const n=focusDayNumber(f,date),done=Object.values(S.money.days).some(d=>d.date===date&&d.longFocus?.id===f.id&&d.longFocus.done);
  return n>=1&&n<=f.length?{...f,day:n,done}:null;
}
function changeLongFocus(raw, reason='', date=today()) {
  const old=S.money.longFocus;
  let next=null;
  if(raw){
    const p=projectById(raw.projectId),length=Number(raw.length),minimum=String(raw.minimum||'').trim(),startDate=raw.startDate;
    if(!p || p.status!=='active')throw new Error('Choose an active project for the Long Focus.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate||'') || !Number.isFinite(Date.parse(startDate+'T00:00:00Z')) || new Date(startDate+'T00:00:00Z').toISOString().slice(0,10)!==startDate)
      throw new Error('Choose a valid start date.');
    if(!Number.isSafeInteger(length)||length<1||length>36500||!minimum||minimum.length>180)throw new Error('Use 1–36500 days and a minimum daily action (180 characters max).');
    if(old && old.projectId===p.id && old.startDate===startDate && old.length===length && old.minimum===minimum)return;
    next={id:'lf-'+crypto.randomUUID(),projectId:p.id,projectName:p.name,startDate,length,minimum};
  }
  if(!old&&!next)return;
  const dayN=old?Math.max(0,focusDayNumber(old,date)):0;
  if(old && dayN<=old.length && !reason.trim())throw new Error('Type a reason to change or end the Long Focus before it finishes.');
  if(reason.length>400)throw new Error('Keep the reason within 400 characters.');
  if(old)S.money.focusHistory.push({...old,endedOn:date});
  S.money.focusLog.push({date,day:dayN,from:old?{...old}:null,to:next?{...next}:null,reason:reason.trim()});
  S.money.longFocus=next;
  const d=moneyDay();
  // Once required, today's minimum stays required even after a switch/end.
  if(d&&!d.closed&&!d.longFocus)d.longFocus=focusForDate(d.date);
  saveNow();
}
function focusCalendar(f, date=today()) {
  const byDate=new Map();
  for(const d of Object.values(S.money.days))if(d.longFocus?.id===f.id){
    const state=byDate.get(d.date)||{done:false,open:false};
    state.done=state.done||d.longFocus.done;state.open=state.open||!d.closed;byDate.set(d.date,state);
  }
  return Array.from({length:f.length},(_,i)=>{
    const key=shiftDate(f.startDate,i),state=byDate.get(key);
    return {date:key,day:i+1,status:state?.done?'done':key>date?'future':state?.open||key===date?'open':'missed'};
  });
}
function moneyStreak(now = today()) {
  const dates = [...new Set(Object.values(S.money.days).filter(d => d.closed && moneyMet(d)).map(d => d.date))];
  let current = dates.includes(now) ? now : shiftDate(now, -1), streak = 0;
  while (dates.includes(current)) { streak++; current = shiftDate(current, -1); } return streak;
}
function monthEarned(month = today().slice(0, 7)) {
  return Object.values(S.money.days).filter(d => d.date.startsWith(month)).reduce((sum,d) => sum+(Number(d.earned)||0),0);
}
function normalizePlan(plan) {
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length > 3 || !plan.tasks.length) throw new Error('Plan needs 1–3 tasks.');
  const tasks = plan.tasks.map((t,i) => {
    const title = (typeof t === 'string' ? t : t.title || '').trim();
    const afterHours = typeof t === 'string' || t.afterHours == null ? null : Number(t.afterHours);
    if (!title || title.length > 180 || (afterHours != null && (!Number.isFinite(afterHours) || afterHours <= 0 || afterHours > 72)))
      throw new Error('Tasks need a title (180 characters max) and an optional deadline 0–72 hours after wake.');
    const projectId=typeof t==='string'?'':t.projectId||'';
    if(typeof projectId!=='string'||projectId.length>120)throw new Error('Task projectId must be text, 120 characters max.');
    return { id: `task-${i}`, title, afterHours, done: false, projectId };
  });
  if (plan.gate && (typeof plan.gate !== 'string' || plan.gate.length > 300)) throw new Error('Gate must be text, 300 characters max.');
  for(const key of ['mainProject','gateProjectId'])if(plan[key]!=null&&(typeof plan[key]!=='string'||plan[key].length>120))throw new Error(`${key} must be a project ID, 120 characters max.`);
  return { tasks, gate: (plan.gate || '').trim(), mainProject:plan.mainProject||'', gateProjectId:plan.gateProjectId||'' };
}
function startMoneyDay(now = Date.now()) {
  const active = moneyDay(); if (active && !active.closed) return active;
  const date = dateKey(new Date(now)), plan = S.money.nextPlan, id = `${date}-${now}`;
  const d = { id, date, wake: now, sleep: null, closed: false, tasks: [], earned: 0,
    gate:'', gateProject:null, mainProject:null, longFocus:focusForDate(date),
    gateDone: false, checkin: { done: '', blocked: '', tomorrow: '' } };
  if (plan) {
    const clean=plan.tasks.length?normalizePlan(plan):plan;
    d.tasks=clean.tasks.map(t=>({...t,project:projectRef(t.projectId)}));d.gate=clean.gate;
    d.mainProject=projectRef(clean.mainProject);d.gateProject=projectRef(clean.gateProjectId);S.money.nextPlan=null;
  }
  S.money.days[id] = d; S.money.active = id; S.money.draft = null; S.money.planDraft=null; saveNow(); return d;
}
function sleepMoneyDay(now = Date.now()) {
  const d = moneyDay(); if (!d || d.closed) return d; d.sleep = now; saveNow(); return d;
}
function finishMoneyDay(checkin) {
  const d = moneyDay(); if (!d) throw new Error('Tap I’M UP first.');
  d.checkin = checkin; d.sleep = d.sleep || Date.now(); d.closed = true;
  const record = JSON.parse(JSON.stringify(d)); record.updated = new Date().toISOString();
  S.money.records[d.id] = { record, ack: false, sentAt: null, vaultAt: null };
  if (checkin.tomorrow && !S.money.nextPlan) S.money.nextPlan = normalizePlan({ tasks: [checkin.tomorrow] });
  if (!saveNow()) throw new Error(persistenceError); return record;
}
function recordMarkdown(r) {
  return [`<!-- money-session:${r.id} -->`, `## Wake ${new Date(r.wake).toLocaleString()} — ${moneyMet(r) ? 'MET' : 'MISSED'}`,
    `Sleep: ${r.sleep ? new Date(r.sleep).toLocaleString() : 'still awake'}`, '',
    `Main project today: ${r.mainProject?.name || '(not picked)'}${r.mainProject?' (project ID: '+r.mainProject.id+')':''}`,
    ...(r.longFocus?[`Long Focus: ${r.longFocus.projectName} · Day ${r.longFocus.day} of ${r.longFocus.length}`,
      `Start: ${r.longFocus.startDate} · Minimum: [${r.longFocus.done?'x':' '}] ${r.longFocus.minimum}`]:['Long Focus: (not set)']), '',
    `Gate: [${r.gateDone ? 'x' : ' '}] ${r.gate}${r.gateProject?' · '+r.gateProject.name:''}`, '',
    '### Money / work', ...r.tasks.map(t => `- [${t.done ? 'x' : ' '}] ${t.title}${t.project?' · '+t.project.name:''}${t.afterHours == null ? '' : ` (wake +${t.afterHours}h)`}`),
    '', `Earned: $${Number(r.earned).toFixed(2)}`, '', '### What got done', r.checkin.done || '(see tasks)', '',
    '### What blocked me', r.checkin.blocked || '(none recorded)', '', '### Tomorrow’s money task', r.checkin.tomorrow || '(not set)', `<!-- /money-session:${r.id} -->`, ''].join('\n');
}
function mergeMoneyMarkdown(existing, records, date) {
  let text = existing || `---\ndate: ${date}\ntype: discipline-money-log\n---\n\n# ${date} — Money Mode\n`;
  for (const r of records) {
    const block = recordMarkdown(r);
    const pattern = new RegExp(`<!-- money-session:${r.id} -->[\\s\\S]*?<!-- /money-session:${r.id} -->\\n?`);
    text = pattern.test(text) ? text.replace(pattern, () => block) : text + '\n' + block;
  }
  return text;
}
function moneyMarkdown(date) {
  const records = Object.values(S.money.records).map(x=>x.record).filter(r=>r.date===date).sort((a,b)=>a.wake-b.wake);
  const earned = records.reduce((n,r)=>n+Number(r.earned),0);
  return `---\ndate: ${date}\ntype: discipline-money-log\nearned: ${earned.toFixed(2)}\nmet: ${records.some(moneyMet)}\n---\n\n# ${date} — Money Mode\n\n` + records.map(recordMarkdown).join('\n');
}
/* Directory handles persist in IndexedDB; Chrome can require renewed permission. */
function vaultDB() {
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open('discipline-vault',1); req.onupgradeneeded=()=>req.result.createObjectStore('handles');
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
async function vaultHandle(value) {
  const db = await vaultDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('handles',value?'readwrite':'readonly');
    const req=value?tx.objectStore('handles').put(value,'vault'):tx.objectStore('handles').get('vault');
    let result; req.onsuccess=()=>{result=value||req.result;};
    tx.oncomplete=()=>{db.close();resolve(result);}; tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
async function chooseVault() {
  if (!window.showDirectoryPicker) throw new Error('Choose the vault in desktop Chrome or Edge. Phone check-ins use ntfy.');
  const handle=await window.showDirectoryPicker({mode:'readwrite',id:'discipline-vault'});
  await vaultHandle(handle); S.settings.vaultConnected=true;saveNow();await writeVault(false);
}
async function writeVault(ask=false) {
  const handle=await vaultHandle();if(!handle)return 0;
  let permission=await handle.queryPermission({mode:'readwrite'});
  if(permission!=='granted'&&ask)permission=await handle.requestPermission({mode:'readwrite'});
  if(permission!=='granted')throw new Error('Vault needs permission: tap Allow vault writes on this laptop.');
  const pending=Object.values(S.money.records).filter(x=>x.vaultAt!==x.record.updated);
  const dates=[...new Set(pending.map(x=>x.record.date))];
  for(const date of dates){
    const f=await handle.getFileHandle(`${date}.md`,{create:true});
    const existing = await (await f.getFile()).text();
    const writer=await f.createWritable();
    await writer.write(mergeMoneyMarkdown(existing, Object.values(S.money.records).map(x=>x.record).filter(r=>r.date===date), date));await writer.close();
    pending.filter(x=>x.record.date===date).forEach(x=>{x.vaultAt=x.record.updated;});saveNow();
  }return dates.length;
}
