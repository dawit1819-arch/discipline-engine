/* Focused v2 surface; original views remain reachable under Later. */
const legacyHUD = renderHUD;
let laterTab = 'habits', laterOpen = false;
let showInactiveProjects = false;
function projectPicker(id, selected='', label='Project (optional)', disabled=false) {
  const projects=S.money.projects.filter(p=>p.status==='active'||p.id===selected);
  return `<label class="fld"><span>${label}</span><select id="${id}" data-plan-project ${disabled?'disabled':''}>
    <option value="">None</option>${projects.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name)}${p.status==='active'?'':' ('+p.status+')'}</option>`).join('')}
    ${selected&&!projectById(selected)?`<option selected value="${esc(selected)}">${esc(selected)} (from coach)</option>`:''}</select></label>`;
}
function longFocusPanel() {
  const d=moneyDay(),current=S.money.longFocus,f=d&&!d.closed&&d.longFocus?d.longFocus:current;
  if(!f)return `<section class="card framed"><div class="gate-tag">THE LONG FOCUS</div><p>One project. A small action every day, for months or years.</p><button class="btn wide" data-tab="quests">Choose a Long Focus</button></section>`;
  const n=f.day||focusDayNumber(f,today()),calendar=focusCalendar(f),done=calendar.filter(x=>x.status==='done').length;
  const retained=d&&!d.closed&&d.longFocus&&current?.id!==f.id;
  const start=Math.max(0,Math.min(f.length-90,n-45));
  return `<section class="card framed long-focus"><div class="gate-tag">THE LONG FOCUS</div><h2>${esc(f.projectName)}</h2>
    <p><b>${n<1?'Starts '+esc(f.startDate):n>f.length?'Completed '+f.length+' day commitment':`Day ${n} of ${f.length}`}</b> · ${done} days done</p>
    <p>Minimum every day: <strong>${esc(f.minimum)}</strong></p>
    ${d&&!d.closed&&d.longFocus?.id===f.id?`<button class="btn ${d.longFocus.done?'jade':'gold'} wide" data-act="focusdone" aria-pressed="${d.longFocus.done}">${d.longFocus.done?'✓ Minimum done · undo':'I did the minimum'}</button>`:''}
    ${retained?'<div class="hint">Today’s commitment stays required. Your changed Long Focus applies to the next awake day.</div>':''}
    <div class="focus-chain" aria-label="Long Focus day calendar">${calendar.slice(start,start+90).map(x=>`<span class="focus-day ${x.status}" title="${x.date}: ${x.status}" aria-label="${x.date}: ${x.status}">${x.day}</span>`).join('')}</div>
    <div class="hint">Green: done · red: missed · gold: open · muted: future. Calendar shows up to 90 days near today; ${esc(f.startDate)} through ${shiftDate(f.startDate,f.length-1)}.</div>
    <button class="btn sm" data-tab="quests">Manage Long Focus & change log</button></section>`;
}
viewQuests = function () {
  const f=S.money.longFocus,projects=S.money.projects.filter(p=>showInactiveProjects||p.status==='active');
  const linkMarkup=p=>/^https?:\/\//i.test(p.link)?`<a href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">Open project link</a>`:esc(p.link);
  return `<div class="sect">Projects you control</div><section class="card"><div class="hint">Pick a main project each day. Keep one Long Focus going even when other work comes up.</div>
    <button class="btn wide" data-act="showprojects">${showInactiveProjects?'Hide paused / done':'Show paused / done (includes old projects)'}</button></section>
    ${projects.map(p=>`<section class="card"><h2>${esc(p.name)}</h2><p>${esc(p.goal||'No goal set yet.')}</p><div class="hint">${p.status}${f?.projectId===p.id?' · Long Focus':''}</div>
      ${p.link?`<p class="project-link">${linkMarkup(p)}</p>`:''}
      <div class="btn-row"><button class="btn sm" data-act="moveproject" data-id="${esc(p.id)}" data-direction="-1" aria-label="Move ${esc(p.name)} up">↑ Up</button><button class="btn sm" data-act="moveproject" data-id="${esc(p.id)}" data-direction="1" aria-label="Move ${esc(p.name)} down">↓ Down</button></div>
      <details><summary>Edit project / status</summary>
        <div class="hint">Project ID for coach plans: ${esc(p.id)}</div>
        <label class="fld"><span>Name</span><input id="pn-${esc(p.id)}" maxlength="120" value="${esc(p.name)}"></label>
        <label class="fld"><span>One-line goal</span><input id="pg-${esc(p.id)}" maxlength="300" value="${esc(p.goal)}"></label>
        <label class="fld"><span>Link or folder (optional)</span><input id="pl-${esc(p.id)}" maxlength="500" value="${esc(p.link)}"></label>
        <label class="fld"><span>Status</span><select id="ps-${esc(p.id)}">${['active','paused','done'].map(s=>`<option ${p.status===s?'selected':''}>${s}</option>`).join('')}</select></label>
        <button class="btn wide" data-act="saveproject" data-id="${esc(p.id)}">Save project</button></details></section>`).join('')}
    <section class="card"><h2>Add a project</h2>
      <label class="fld"><span>Name</span><input id="pn-new" maxlength="120" placeholder="Project name"></label>
      <label class="fld"><span>One-line goal</span><input id="pg-new" maxlength="300" placeholder="What are you building toward?"></label>
      <label class="fld"><span>Link or folder (optional)</span><input id="pl-new" maxlength="500" placeholder="https://… or a folder path"></label>
      <button class="btn gold wide" data-act="saveproject" data-id="new">Add project</button></section>
    ${longFocusPanel()}
    <section class="card" id="focus-settings"><h2>${f?'Change':'Set'} the Long Focus</h2>
      ${projectPicker('lf-project',f?.projectId||'','Long Focus project')}
      <label class="fld"><span>Start date</span><input id="lf-start" type="date" value="${f?.startDate||today()}"></label>
      <label class="fld"><span>Length</span><select id="lf-length">${[30,60,90,180,365].map(n=>`<option value="${n}" ${(f?.length||30)===n?'selected':''}>${n} days</option>`).join('')}<option value="custom" ${f&&![30,60,90,180,365].includes(f.length)?'selected':''}>Custom</option></select></label>
      <label class="fld"><span>Custom days (when Custom is selected)</span><input id="lf-custom" type="number" min="1" max="36500" value="${f?.length||''}"></label>
      <label class="fld"><span>Minimum daily action</span><input id="lf-minimum" maxlength="180" placeholder="1 chapter scene / 1 YouTube upload step" value="${esc(f?.minimum||'')}"></label>
      ${f?'<label class="fld"><span>Reason for changing / ending early (required)</span><textarea id="lf-reason" maxlength="400" rows="2" placeholder="Why am I switching or stopping?"></textarea></label>':''}
      <button class="btn gold wide" data-act="savefocus">${f?'Save changed commitment':'Start commitment'}</button>
      ${f?'<button class="btn wide" data-act="endfocus">End Long Focus</button>':''}
      <div class="hint">The minimum is an extra MET condition. Pausing a project keeps its Long Focus commitment; change or end it here with a reason. An existing minimum stays required for today.</div></section>
    <section class="card"><h2>Long Focus change log</h2>${S.money.focusLog.length?S.money.focusLog.slice().reverse().map(e=>`<p>${esc(e.date)} · ${e.from?`${e.to?'You switched':'You ended'} on day ${e.day} of ${e.from.length}: ${esc(e.from.projectName)}${e.to?' → '+esc(e.to.projectName):''}`:'Started '+esc(e.to.projectName)}${e.reason?' because '+esc(e.reason):''}</p>`).join(''):'<p>No changes yet. You pick the first commitment.</p>'}
      ${S.money.focusHistory.length?`<details><summary>Past commitments and calendars</summary>${S.money.focusHistory.map(old=>`<h3>${esc(old.projectName)} · ${esc(old.startDate)}</h3><div class="focus-chain">${focusCalendar(old,old.endedOn).filter(x=>x.date<=old.endedOn).slice(-90).map(x=>`<span class="focus-day ${x.status}" title="${x.date}: ${x.status}">${x.day}</span>`).join('')}</div>`).join('')}</details>`:''}</section>`;
};
const dollars = n => '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
renderHUD = function () {
  const d = moneyDay();
  return `<header class="money-head"><div class="gate-tag">Discipline Engine · v2</div>
    <h1>Money Mode</h1><div class="money-status"><span>${d && !d.closed ? `Awake since ${esc(new Date(d.wake).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))}` : 'Your day starts when you say so.'}</span>
    <b>${moneyStreak()} MET day${moneyStreak() === 1 ? '' : 's'} in a row</b></div>
    ${persistenceError?`<div class="warn" role="alert">${esc(persistenceError)}</div>`:''}</header>`;
};
renderTabs = function () {
  return `<nav class="tabbar money-tabs" aria-label="Main navigation">${[['today','◉','Today'],['quests','↗','Projects'],['codex','⚙','Setup']].map(([id,g,l])=>
    `<button class="tab ${TAB===id?'on':''}" data-tab="${id}"><span class="tg">${g}</span><span class="tl">${l}</span></button>`).join('')}</nav>`;
};
function taskEditor(tasks, disabled = false) {
  return Array.from({length:3},(_,i)=>{
    const t=tasks[i]||{};
    return `<div class="money-task-edit"><label class="fld"><span>Money / work task ${i+1}</span>
      <input type="text" id="mt-${i}" data-money-draft="${i}" maxlength="180" placeholder="One action that moves money or work forward" value="${esc(t.title||'')}" ${disabled?'disabled':''}></label>
      <label class="fld"><span>Deadline, hours after I’M UP (optional)</span>
      <input type="number" id="md-${i}" data-money-hours="${i}" min="0.01" max="72" step="0.25" placeholder="e.g. 6" value="${t.afterHours??''}" ${disabled?'disabled':''}></label>
      ${projectPicker('mp-'+i,t.projectId||t.project?.id||'','Task project (optional)',disabled)}</div>`;
  }).join('');
}
function monthlyPanel() {
  const earned=monthEarned(),b=S.money.bills,r=S.money.recover;
  const targets=[['First $40',40],['All monthly AI bills',b.claude+b.chatgpt+b.api],['Loss 1 to earn back',r.kalshi],['Loss 2 to earn back',r.polymarket],['Debt to earn back',r.credit]];
  return `<div class="sect">${today().slice(0,7)} · Money</div><section class="card"><div class="fuel-head"><strong class="fuel-big">${dollars(earned)}</strong><span class="fuel-of">earned this month</span></div>
    ${targets.map(([label,target])=>`<div class="money-target"><div class="money-status"><span>${label}</span><span>${dollars(earned)} / ${dollars(target)}</span></div>
      <progress aria-label="${label}" max="${Math.max(target,1)}" value="${Math.min(earned,Math.max(target,1))}"></progress></div>`).join('')}
    <div class="hint">All bars compare this month’s earnings with each target independently. Recovery amounts are goals, not a repayment ledger.</div>
    <details><summary>Edit bills and money to earn back</summary><div class="money-grid">
    ${[['claude','Claude',b.claude],['chatgpt','ChatGPT Plus',b.chatgpt],['api','API estimate',b.api],['kalshi','Loss 1',r.kalshi],['polymarket','Loss 2',r.polymarket],['credit','Debt',r.credit]].map(([key,label,value])=>`<label class="fld"><span>${label} ($)</span><input type="number" id="money-${key}" min="0" step="0.01" value="${value}"></label>`).join('')}</div>
    <button class="btn wide" data-act="savemoneytargets">Save money targets</button></details></section>`;
}
function checkinForm(d) {
  const c=d.checkin;
  return `<div class="sect">Night check-in</div><section class="card" id="checkin">
    <div class="${moneyMet(d)?'ok-box':'warn'}">${moneyMet(d)?'MET':'Not MET yet'} · Gate ${d.gateDone?'done':'open'} · ${d.tasks.filter(t=>t.done).length}/2 work tasks done${d.longFocus?' · Long Focus minimum '+(d.longFocus.done?'done':'open'):''}</div>
    <div class="hint">Write this before sleeping. Saved on this device as you type.</div>
    ${[['done','What got done'],['blocked','What blocked me'],['tomorrow','Tomorrow’s money task']].map(([key,label])=>`<label class="fld"><span>${label}</span><textarea id="ci-${key}" data-checkin="${key}" maxlength="${key==='tomorrow'?180:400}" rows="2">${esc(c[key])}</textarea></label>`).join('')}
    <button class="btn gold wide" data-act="savecheckin">${d.closed?'Update saved check-in':'Save check-in & close day'}</button>
    <div class="hint">$ earned above is included. MET requires the Gate AND at least 2 tasks${d.longFocus?' AND the Long Focus minimum':''}. Saving keeps a local copy and syncs to ntfy / your laptop vault.</div></section>`;
}
function laterSection() {
  const views={habits:()=>`<div class="hint">Back burner. These habits do not affect Money Mode’s MET goal or schedule.</div>${S.schedule.map(b=>`<button class="block ${day(today()).blocks[b.id]?'done':''}" data-act="block" data-id="${esc(b.id)}"><span class="block-label">${esc(b.label)}</span><span class="tick">✓</span></button>`).join('')}
    <button class="btn wide" data-act="posture">${day(today()).posture?'✓ ':''}Posture block</button>`,body:viewBody,fuel:viewFuel,xp:legacyHUD,
    settings:()=>`<section class="card"><label class="fld"><span>Food camera · Gemini key</span><input type="password" id="gk" value="${esc(S.settings.geminiKey)}"></label>
      <label class="fld"><span>Gemini model</span><input type="text" id="gm" value="${esc(S.settings.geminiModel)}"></label><button class="btn wide" data-act="savegemini">Save camera key</button>
      <div class="hint">Optional free key from aistudio.google.com/apikey. Stored only on this device and sent only to Google.</div>
      ${[['t-kcal','Calories',S.targets.kcal],['t-pro','Protein (g)',S.targets.protein],['t-gw','Goal weight (lb)',S.targets.goalWeightLb]].map(([id,label,v])=>`<label class="fld"><span>${label}</span><input type="number" id="${id}" value="${v}"></label>`).join('')}
      <label class="fld"><span>Training split</span><select id="t-split"><option value="4day" ${S.settings.split==='4day'?'selected':''}>4-day upper/lower</option><option value="3day" ${S.settings.split==='3day'?'selected':''}>3-day full body</option></select></label>
      <button class="btn wide" data-act="savetargets">Save back-burner targets</button></section>`};
  return `<details class="later" id="later" ${laterOpen?'open':''}><summary>Later (back burner)</summary><div class="btn-row later-nav">${[['habits','Habits'],['body','Workout'],['fuel','Food'],['xp','XP'],['settings','Settings']].map(([id,label])=>`<button class="btn sm" data-act="later" data-id="${id}">${label}</button>`).join('')}</div>${views[laterTab]()}</details>`;
}
viewToday = function () {
  const d=moneyDay(),live=d&&!d.closed,plan=live?{tasks:d.tasks,gate:d.gate,mainProject:d.mainProject?.id||'',gateProjectId:d.gateProject?.id||''}:(S.money.planDraft||S.money.nextPlan||{tasks:S.money.draft||[]}),editing=plan.tasks;
  const pending=Object.values(S.money.records).filter(x=>!x.ack).length;
  let h=longFocusPanel()+`<section class="card framed"><button class="btn gold wide wake-btn" data-act="wake" ${live?'disabled':''}>I’M UP</button>
    ${live?`<button class="btn wide sleep-btn" data-act="sleep" ${d.sleep?'disabled':''}>${d.sleep?'Sleep recorded · finish check-in below':'GOING TO SLEEP'}</button>`:''}
    <div class="hint">Wake +0: plan · every 2 hours: next task · deadline −60 / −15 minutes · wake +15 hours: check-in. No fixed wake or bedtime.</div></section>`;
  if(S.money.syncError)h+=`<div class="warn" role="status">${esc(S.money.syncError)} <button class="btn sm" data-act="syncmoney">Retry sync</button></div>`;
  if(!S.settings.ntfyTopic)h+=`<div class="warn">Phone reminders need a one-time connection. <button class="btn sm" data-tab="codex">Open Setup</button></div>`;
  h+=`<section class="card">${projectPicker('main-project',plan.mainProject,'Main project today (pick one)')}
    <label class="fld"><span>THE GATE · today’s send-it step</span><input id="money-gate" data-money-gate maxlength="300" placeholder="send 5 DMs / post the video / call CHA" value="${esc(plan.gate||'')}"></label>
    ${projectPicker('gate-project',plan.gateProjectId,'Gate project (optional)')}
    <button class="btn wide" data-act="savemoneyplan">Save main project & Gate</button>
    <div class="hint">Write your own real-world send. No project chooses the Gate for you. Editing the step reopens the Gate.</div></section>`;
  h+=`<div class="sect">Today’s money / work · up to 3</div><section class="card">
    ${live?d.tasks.map(t=>`<button class="block ${t.done?'done':''}" data-act="moneytask" data-id="${t.id}" aria-pressed="${t.done}"><span class="block-label">${esc(t.title)}${t.project?`<small class="hint">${esc(t.project.name)}</small>`:''}${t.afterHours!=null?`<small class="hint">Due ${esc(new Date(d.wake+t.afterHours*3600000).toLocaleString())} · wake +${t.afterHours}h</small>`:''}</span><span class="tick">✓</span></button>`).join(''):''}
    ${live&&d.tasks.length?'<details><summary>Edit today’s plan</summary>':''}
    ${taskEditor(editing)}<button class="btn wide" data-act="savemoneyplan">${live?'Save plan & queue deadlines':'Save wake-up plan'}</button>
    ${live&&d.tasks.length?'</details>':''}<div class="hint">Choose at least 2 tasks to qualify for MET. Save the plan to queue named task nudges. Deadlines are relative to the moment you wake.</div></section>`;
  if(d)h+=`<section class="gate ${d.gateDone?'cleared':''}"><div class="gate-tag">THE GATE · one real-world send</div><h2 class="gate-quest">${esc(d.gateProject?.name||'Today’s send-it step')}</h2><div class="gate-do">${esc(d.gate||'Write today’s send-it step above.')}</div>
    ${d.gateDone?'<div class="gate-done-mark">✓ A real person has seen it.</div>':`<button class="gate-btn" data-act="moneygate" ${d.closed||!d.gate.trim()?'disabled':''}>I SENT IT</button>`}
    <div class="hint">A DM, post, offer, or call that another human can see. Building alone doesn’t clear the Gate.</div></section>`;
  if(d)h+=`<section class="card"><label class="fld"><span>$ earned this awake day</span><input type="number" min="0" max="1000000000" step="0.01" id="money-earned" data-money-earned value="${d.earned}"></label>
    <div class="${d.closed?(moneyMet(d)?'ok-box':'warn'):'hint'}">${d.closed?(moneyMet(d)?'Day closed: MET':'Day closed: MISSED'):'Daily goal: Gate done + 2 money/work tasks done'+(d.longFocus?' + Long Focus minimum.':'.')} · ${d.date} wake date</div></section>`;
  if(d&&(d.sleep||d.closed||Date.now()>=d.wake+15*3600000))h+=checkinForm(d);
  h+=monthlyPanel();
  h+=`<section class="card"><div class="hint">${pending} check-in${pending===1?'':'s'} awaiting coach acknowledgement. ${S.money.lastSync?'Last reminder sync: '+esc(new Date(S.money.lastSync).toLocaleString()):'No reminders queued yet.'}</div>
    <button class="btn wide" data-act="syncmoney">Sync phone / coach now</button><div class="hint">Queued reminders use a plan snapshot. They may still arrive after completion or early sleep; this app cannot reliably retract them.</div></section>`;
  return h+laterSection();
};
viewCodex = function () {
  const topic=S.settings.ntfyTopic;
  return `<section class="card framed"><div class="gate-tag">Phone connection · about 5 minutes</div>
    <ol class="setup-list"><li>Install <b>ntfy</b> from the Android Play Store.</li><li>Generate a topic below.</li><li>In ntfy, tap <b>+</b> and subscribe to that topic on <b>ntfy.sh</b>.</li><li>Allow ntfy notifications and unrestricted background battery use.</li><li>Send a test. Close this PWA and wait for the second buzz in 90 seconds.</li></ol>
    <label class="fld"><span>Your secret ntfy topic (use the same on phone and laptop)</span><input type="password" id="ntfy-topic" autocomplete="off" value="${esc(topic)}"></label>
    <div class="btn-row"><button class="btn" data-act="gentopic">${topic?'Replace topic':'Generate topic'}</button><button class="btn" data-act="copytopic" ${topic?'':'disabled'}>Copy topic</button><button class="btn" data-act="saventfy">Save topic</button></div>
    <button class="btn jade wide" data-act="testnotify" ${topic?'':'disabled'}>Send immediate + 90-second test</button>
    <div class="warn">Topics are secret addresses, not authenticated private storage. Anyone with this topic can read check-ins, send reminders, and publish plans. Keep it private; don’t put credentials or sensitive financial details in check-ins.</div></section>
    <div class="sect">Laptop → your vault</div><section class="card"><p>Pick this folder once in Chrome or Edge:</p><p class="vault-path">C:\\Users\\Dawit\\Second Brain\\Logs\\Discipline\\</p>
    <button class="btn gold wide" data-act="choosevault">Choose Discipline folder</button><button class="btn wide" data-act="allowvault">Allow vault writes & sync</button>
    <div class="hint">The folder handle is remembered. Chrome may ask for permission again after a restart. Phone check-ins are pulled while this page is open, or by the coach command.</div></section>
    <div class="sect">Claude / Codex helper</div><section class="card"><p>Save the local config once so Claude can read check-ins and send reminders.</p>
    <button class="btn wide" data-act="coachconfig" ${topic?'':'disabled'}>Save coach-config.json</button><div class="hint">Save as <b>tools/coach-config.json</b> in this project. It contains your secret topic and is git-ignored. Then: <code>python tools/coach.py read</code>. Without this file the helper cannot connect to your phone.</div>
    <button class="btn wide" data-act="syncmoney">Sync phone / coach now</button><div class="hint">ntfy caches messages for about 12 hours. The phone keeps every check-in locally and re-sends unacknowledged ones when reopened. If a cache has expired, open the phone app and tap Sync, then run coach read.</div></section>
    ${S.money.nextPlan?`<section class="card"><div class="gate-tag">Next wake-up plan received</div><ul>${S.money.nextPlan.tasks.map(t=>`<li>${esc(t.title)}</li>`).join('')}</ul><div class="hint">Applied on the next I’M UP. Your active day stays intact.</div></section>`:''}
    <div class="sect">Backup</div><section class="card"><div class="warn">Backups include secret topics and any saved API key. Store privately.</div><div class="btn-row"><button class="btn" data-act="export">Export app backup</button><button class="btn" data-act="importbtn">Restore</button></div><input type="file" id="importfile" accept=".json,application/json" hidden></section>
    <div class="hint">Calendar backup and exact setup steps: see SETUP.md in the project.</div>`;
};
