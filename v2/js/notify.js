/* ntfy queues on its server. Accepted reminders are immutable plan snapshots. */
const NTFY='https://ntfy.sh';
function asciiSafe(s){return String(s).replace(/[^\x20-\x7E]/g,' ').trim();}
function randomTopic(){return 'de-'+Array.from(crypto.getRandomValues(new Uint8Array(20)),b=>b.toString(16).padStart(2,'0')).join('');}
function validTopic(topic){return /^[a-zA-Z0-9_-]{1,64}$/.test(topic);}
async function ntfySend({topic,title,message,at,priority=3,click}){
  if(!validTopic(topic))throw new Error('Topic must contain only letters, numbers, _ or -, at most 64 characters.');
  const headers={Title:asciiSafe(title||'Money Mode').slice(0,180),Priority:String(priority)};
  if(at)headers.At=String(at);if(click)headers.Click=click;
  if(new TextEncoder().encode(message).length>4096)throw new Error('Message exceeds ntfy’s 4096-byte limit.');
  const res=await fetch(`${NTFY}/${encodeURIComponent(topic)}`,{method:'POST',headers,body:message,signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw new Error(`ntfy rejected the request (${res.status}). Try again when online.`);return res.json();
}
function nextMoneyTask(d){return d.tasks.find(t=>!t.done);}
function reminderQueue(d){
  if(!d||d.closed||d.sleep)return [];
  const next=nextMoneyTask(d),context=next?`Next: ${next.title}`:d.gateDone?'Tasks complete. Log today’s earnings.':`THE GATE: ${d.gate}`;
  const snapshot='\nPlan snapshot when queued; open Today for current progress.';
  const remaining=d.tasks.filter(t=>!t.done).slice(1);
  const nudge=context+(remaining.length?'\nIf already done, move to: '+remaining.map(t=>t.title).join(' → '):'')+snapshot;
  const focus=d.longFocus,focusText=focus?`\nLONG FOCUS: ${focus.projectName} — Day ${focus.day} of ${focus.length}. Minimum: ${focus.minimum}`:'';
  const q=[{key:`${d.id}|wake`,time:d.wake,title:'You’re up — today’s money plan',message:(d.tasks.length?d.tasks.map(t=>`- ${t.title}`).join('\n'):'Add up to 3 money/work tasks in Today.')+`\nTHE GATE: ${d.gate||'Write today’s send-it step in Today.'}`+(d.mainProject?'\nMain project: '+d.mainProject.name:'')+focusText}];
  if(focus&&!focus.done)q.push({key:`${d.id}|focus-${focus.id}`,time:d.wake+7*3600000,title:'Mid-day — keep the Long Focus going',message:focusText.trim()+snapshot});
  if(d.tasks.length)for(let h=2;h<15;h+=2)q.push({key:`${d.id}|nudge-${h}`,time:d.wake+h*3600000,title:`Wake +${h}h — move the money task`,message:nudge});
  for(const t of d.tasks){
    if(t.done||t.afterHours==null)continue;
    for(const minutes of [60,15]){
      const time=d.wake+t.afterHours*3600000-minutes*60000;if(time<=d.wake)continue;
      q.push({key:`${d.id}|${t.id}|${t.afterHours}|${minutes}`,time,title:`${minutes} min before deadline`,message:`${t.title}\nDeadline: ${new Date(time+minutes*60000).toLocaleString()}`+snapshot});
    }
  }
  q.push({key:`${d.id}|night`,time:d.wake+15*3600000,title:'Night check-in — did we meet the goal?',message:'Gate done AND 2 money/work tasks done'+(focus?' AND Long Focus minimum done':'')+' = MET. Open Today, log $ earned, blockers, and tomorrow’s money task.'});
  return q.sort((a,b)=>a.time-b.time);
}
let syncing=null;
async function syncPush(){if(syncing)return syncing;syncing=queuePushes().finally(()=>{syncing=null;});return syncing;}
async function queuePushes(){
  const topic=S.settings.ntfyTopic;if(!topic)throw new Error('Connect ntfy in Setup first.');
  let sent=0;const failures=[],d=moneyDay(),queue=reminderQueue(d);
  for(const item of queue){
    if(d.sleep||d.closed)break;
    const key=`${topic}|${item.key}`;if(S.money.queue[key])continue;
    const now=Date.now();if(item.time<now&&!item.key.endsWith('|wake'))continue;if(item.time>now+72*3600000)continue;
    try{
      const res=await ntfySend({topic,title:item.title,message:item.message,at:item.time>now+1000?Math.ceil(item.time/1000):null,priority:4,click:location.href.split('#')[0]});
      S.money.queue[key]={id:res.id,at:item.time};sent++;saveNow();
    }catch(e){failures.push(e.message);break;}
  }
  S.money.lastSync=new Date().toISOString();S.money.syncError=failures[0]||'';saveNow();return {sent,failures};
}
function isCheckinRecord(r){
  return r&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&typeof r.id==='string'&&/^\d{4}-\d{2}-\d{2}-\d+$/.test(r.id)
    &&Number.isFinite(r.wake)&&Number.isFinite(r.earned)&&r.earned>=0&&Array.isArray(r.tasks)&&r.tasks.length<=3
    &&r.tasks.every(t=>t&&typeof t.title==='string'&&t.title.length<=180)&&typeof r.gate==='string'&&r.gate.length<=300&&r.checkin
    &&['done','blocked','tomorrow'].every(k=>typeof r.checkin[k]==='string')&&typeof r.updated==='string'&&Number.isFinite(Date.parse(r.updated))
    &&validProjectRef(r.mainProject)&&validProjectRef(r.gateProject)&&r.tasks.every(t=>validProjectRef(t.project))&&validFocusRecord(r.longFocus);
}
function validProjectRef(p){return p==null||!!(p&&typeof p.id==='string'&&p.id.length<=120&&typeof p.name==='string'&&p.name.length<=120);}
function validFocusRecord(f){
  return f==null||!!(f&&typeof f.id==='string'&&f.id.length<=120&&typeof f.projectId==='string'&&f.projectId.length<=120
    &&typeof f.projectName==='string'&&f.projectName.length<=120&&/^\d{4}-\d{2}-\d{2}$/.test(f.startDate)
    &&Number.isInteger(f.length)&&f.length>=1&&f.length<=36500&&Number.isInteger(f.day)&&f.day>=1&&f.day<=f.length
    &&typeof f.minimum==='string'&&f.minimum.length>0&&f.minimum.length<=180&&typeof f.done==='boolean');
}
async function pullCoach(){
  const topic=S.settings.ntfyTopic;if(!topic)return 0;
  const res=await fetch(`${NTFY}/${encodeURIComponent(topic)}/json?poll=1&since=all`,{signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw new Error(`ntfy pull failed (${res.status}).`);let count=0;
  for(const line of (await res.text()).split('\n').filter(Boolean)){
    try{
      const event=JSON.parse(line);if(event.event!=='message')continue;const msg=JSON.parse(event.message);
      if(msg.type==='de-plan'&&typeof msg.id==='string'&&/^[a-f0-9]{32}$/.test(msg.id)&&!S.money.seenPlans.includes(msg.id)){
        S.money.nextPlan=normalizePlan(msg.plan);S.money.draft=null;S.money.planDraft=null;S.money.seenPlans.push(msg.id);count++;
      }
      if(msg.type==='de-plan'&&S.money.seenPlans.includes(msg.id)){
        S.money.planAcks=S.money.planAcks||[];if(!S.money.planAcks.includes(msg.id))S.money.planAcks.push(msg.id);
      }
      if(msg.type==='de-ack'&&Array.isArray(msg.records))for(const a of msg.records){const local=S.money.records[a.id];if(local&&local.record.updated===a.updated)local.ack=true;}
      if(msg.type==='de-checkin'&&isCheckinRecord(msg.record)){
        const r=msg.record,prev=S.money.records[r.id];
        if(!prev||Date.parse(r.updated)>Date.parse(prev.record.updated)){
          S.money.records[r.id]={record:r,ack:false,sentAt:event.time*1000,vaultAt:null};S.money.days[r.id]=r;count++;
        }
      }
    }catch(_){/* Ordinary reminders and invalid payloads are not commands. */}
  }saveNow();return count;
}
async function syncCheckins(force=false){
  if(!S.settings.ntfyTopic)return 0;let sent=0;
  for(const id of S.money.planAcks||[]){
    await ntfySend({topic:S.settings.ntfyTopic,title:'Coach plan received',message:JSON.stringify({type:'de-plan-ack',id}),priority:1});
  }S.money.planAcks=[];saveNow();
  for(const x of Object.values(S.money.records)){
    if((x.ack&&!force)||(!force&&x.sentAt&&Date.now()-x.sentAt<4*3600000))continue;
    await ntfySend({topic:S.settings.ntfyTopic,title:'Money Mode check-in',message:JSON.stringify({type:'de-checkin',v:2,record:x.record}),priority:1});
    x.sentAt=Date.now();saveNow();sent++;
  }return sent;
}
let exchanging=null;
async function exchangeMoney(force=false){
  if(exchanging)return exchanging;
  exchanging=(async()=>{
    const errors=[];
    if(S.settings.ntfyTopic){
      try{await pullCoach();}catch(e){errors.push(e.message);}
      try{await syncCheckins(force);}catch(e){errors.push(e.message);}
      try{const r=await syncPush();errors.push(...r.failures);}catch(e){errors.push(e.message);}
    }
    try{await writeVault();}catch(e){errors.push(e.message);}
    S.money.syncError=errors.join(' ');saveNow();return errors;
  })().finally(()=>{exchanging=null;});return exchanging;
}
function armLocalTimers(){}
async function scheduleGateWarning(){}
async function ensureLocalPermission(){return false;}
async function testNotification(){
  try{
    await ntfySend({topic:S.settings.ntfyTopic,title:'Money Mode connected',message:'Immediate phone test. Next comes a test in 90 seconds.',priority:4});
    await ntfySend({topic:S.settings.ntfyTopic,title:'Closed-app test',message:'This was queued 90 seconds ago. If the phone buzzed with the PWA closed, server delivery works.',at:Math.ceil(Date.now()/1000)+90,priority:4});
    return {ntfy:true};
  }catch(e){return {error:e.message};}
}
