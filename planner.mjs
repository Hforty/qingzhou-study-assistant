// All arrangement operations are calculated on a clone. The caller commits once.
import { topics, activeTopics, activeSubjects } from './curriculum.mjs';
import { today, addDays, dayDiff, uid, topicById, subjectById, timeBudget, isStudyDay, taskInCurriculum, dueTopics } from './core.mjs';
export function monday(date) { return addDays(date,-((new Date(`${date}T12:00:00`).getDay()+6)%7)); }
const copy = v => structuredClone(v);
const order = new Map(topics.map((t,i)=>[t.id,i]));
const sortTasks = (a,b) => a.date.localeCompare(b.date)||(order.get(a.topicId)??99999)-(order.get(b.topicId)??99999)||a.sequence-b.sequence;
export const defaultPlan = week => week?.baseline || week?.original || [];
function ensureSources(s) {
  const legacy=s.taskDefinitions===undefined;
  s.taskDefinitions ||= {};
  for (const w of Object.values(s.weeks)) {
    w.baseline ||= copy(w.original);
    w.baselineRevision ||= 1;
    for (const t of w.original) s.taskDefinitions[t.id] ||= copy(t);
  }
  for (const a of s.adjustments) if (a.type === 'add') s.taskDefinitions[a.task.id] ||= copy(a.task);
  if(legacy&&s.tasks.some(t=>!t.history&&!t.done))addAdjustment(s,{type:'allocation',automatic:true,legacy:true,moves:s.tasks.filter(t=>!t.history&&!t.done).map(t=>({id:t.id,date:t.date}))},s.lastEvaluated);
}
export const taskIdentity = t => JSON.stringify([t.id,t.title,t.subject,t.topicId??null,t.kind,t.minutes]);
function eligible(t,s) { return taskInCurriculum(t,s.settings)&& !(t.origin==='auto'&&t.subject==='politics'&&s.settings.politicsMode==='off'); }
function paused(s,id) { return s.adjustments.some(a=>a.active&&a.type==='pause'&&a.topicId===id); }
function facts(s, tasks) {
  const result=tasks.map(t=>{const f=s.completions.find(f=>f.identity===taskIdentity(t));return {...t,done:!!f,completedAt:f?.date,...(f?{date:f.task.date,queued:false}:{})};});
  for(const f of s.completions)if(!result.some(t=>taskIdentity(t)===f.identity))result.push({...copy(f.task),id:`history:${f.id}`,done:true,completedAt:f.date,history:true,queued:false});
  return result;
}
function definitions(s) {
  const map=new Map();
  const baselineIds = new Set(Object.values(s.weeks).flatMap(w => [...w.original, ...defaultPlan(w)]).map(t => t.id));
  for (const t of Object.values(s.taskDefinitions || {})) if (s.acceptedIds.includes(t.id) && (baselineIds.has(t.id) || !s.adjustments.some(a => a.type === 'add' && a.task.id === t.id) || s.adjustments.some(a => a.active && a.type === 'add' && a.task.id === t.id))) map.set(t.id, copy(t));
  for(const w of Object.values(s.weeks).sort((a,b)=>a.start.localeCompare(b.start)))for(const t of defaultPlan(w))if(s.acceptedIds.includes(t.id))map.set(t.id,copy(t));
  let tasks=[...map.values()];
  for(const a of s.adjustments.filter(a=>a.active)) {
    if(a.type==='add'&&!tasks.some(t=>t.id===a.task.id))tasks.push(copy(a.task));
    if(a.type==='edit'){const t=tasks.find(t=>t.id===a.taskId);if(t)Object.assign(t,copy(a.patch));}
    if(a.type==='delete')tasks=tasks.filter(t=>t.id!==a.taskId);
    if(a.type==='single') {const t=tasks.find(t=>t.id===a.taskId);if(t)t.date=a.to;}
    if(a.type==='course') {
      const list=tasks.filter(t=>t.subject===a.subject&&t.date>=a.from&&!s.completions.some(f=>f.identity===taskIdentity(t))).sort(sortTasks);
      let floor=a.from,previous=null,target=null;
      for(const t of list){const date=t.date;if(date!==previous){floor=nextStudy(s.settings,addDays(date>floor?date:floor,1))||addDays(s.settings.examDate,1);target=floor;previous=date;}t.date=target;}
    }
    if(a.type==='missed'||a.type==='allocation')for(const m of a.moves){const t=tasks.find(t=>t.id===m.id);if(t)t.date=m.date;}
  }
  return facts(s,tasks).filter(t=>t.done||eligible(t,s));
}
function nextStudy(settings, date) {
  if(!settings.studyDays.length)return null;
  for(let i=0;i<3700&&date<settings.examDate;i++,date=addDays(date,1))if(isStudyDay(settings,date))return date;
  return null;
}
function politicalCap(settings,date) {
  const b=timeBudget(settings);let credit=0;
  for(let d=monday(date);d<=date;d=addDays(d,1)){if(isStudyDay(settings,d))credit+=b.politics;if(credit>=10){if(d===date)return credit;credit=0;}}
  return 0;
}
function fit(s,t,date,tasks,limit=timeBudget(s.settings).full) {
  const list=tasks.filter(x=>!x.queued&&!x.suspended&&x.date===date);
  if(list.reduce((n,x)=>n+x.minutes,0)+t.minutes>limit)return false;
  if(t.origin==='auto'&&t.subject==='politics'){
    const political=list.filter(x=>x.subject==='politics'&&x.origin==='auto');
    if(s.settings.politicsMode==='light')return t.minutes===20&&!political.length&&tasks.filter(x=>!x.queued&&!x.suspended&&x.origin==='auto'&&x.subject==='politics'&&monday(x.date)===monday(date)).length<3;
    return s.settings.politicsMode==='full'&&political.reduce((n,x)=>n+x.minutes,0)+t.minutes<=politicalCap(s.settings,date);
  }
  return true;
}
function arrange(s, now) {
  const tasks=definitions(s), placed=tasks.filter(t=>t.done), pending=tasks.filter(t=>!t.done);
  for (const t of pending) t.desiredDate = t.date;
  while(pending.length){pending.sort((a,b)=>a.date.localeCompare(b.date)||(a.origin==='manual'?0:1)-(b.origin==='manual'?0:1)||sortTasks(a,b));const t=pending.shift();
    t.queued=false;delete t.queueReason;
    if(t.topicId&&paused(s,t.topicId)&&t.origin==='auto'){t.suspended=true;placed.push(t);continue;}delete t.suspended;
    const original=t.desiredDate||t.date;let date=nextStudy(s.settings,t.date);
    if(t.minutes>timeBudget(s.settings).full)date=null;
    while(date&&!fit(s,t,date,placed))date=nextStudy(s.settings,addDays(date,1));
    t.originalDate=original;
    if(!date){t.queued=true;t.queueReason=!s.settings.studyDays.length?'没有可学习日':t.minutes>timeBudget(s.settings).full?'任务时长超过每日预算，未缩短':'考试日前没有可容纳的日期';}
    else {const prior=t.date;t.date=date;if(date>prior){let previous=null,floor=date,target=null;for(const following of pending.filter(x=>x.subject===t.subject&&x.desiredDate!==t.desiredDate).sort(sortTasks)){const wanted=following.date;if(wanted!==previous){target=wanted<=floor?(nextStudy(s.settings,addDays(floor,1))||addDays(s.settings.examDate,1)):wanted;previous=wanted;floor=target;}following.date=target;}}if(date!==original)t.restrictionReason=!isStudyDay(s.settings,original)?'学习日变更重新规划':'预算或政治配额顺延';else delete t.restrictionReason;}
    placed.push(t);
  }
  s.tasks=placed;s.restrictions=placed.filter(t=>!t.done&&!t.suspended&&(t.restrictionReason||t.queued)).map(t=>({id:`restriction:${t.id}:${t.originalDate}:${t.date}`,taskId:t.id,week:t.planWeek||monday(now),from:t.originalDate,to:t.queued?null:t.date,reason:t.queueReason||t.restrictionReason}));
}
function addAdjustment(s, fields, now) {const a={id:`adjustment:${s.nextSequence++}`,week:monday(now),created:now,active:true,...fields};s.adjustments.push(a);return a;}
function missed(s, now) {
  // Persist destinations for each missed date. Completing A later cannot pull B back.
  arrange(s,now);
  const past=[...new Set(s.tasks.filter(t=>!t.done&&!t.queued&&!t.suspended&&t.date<now).map(t=>t.date))].sort();
  for(let day of past) {
    for(let steps=0;day<now&&steps<3700;steps++,day=addDays(day,1)) {
      const subjects=[...new Set(s.tasks.filter(t=>!t.done&&!t.queued&&!t.suspended&&t.date===day).map(t=>t.subject))];
      for(const subject of subjects) {
        const sourceIds=s.tasks.filter(t=>!t.done&&!t.queued&&!t.suspended&&t.date===day&&t.subject===subject).map(t=>t.id).sort();const hash=sourceIds.join('|').split('').reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261);const key=`${day}:${subject}:${hash}`;
        if(s.adjustments.some(a=>a.active&&a.type==='missed'&&a.sourceKey===key))continue;
        const list=s.tasks.filter(t=>!t.done&&!t.queued&&!t.suspended&&t.subject===subject&&t.date>=day).sort(sortTasks);
        let floor=day,previous=null,target=null;const moves=[];
        for(const t of list){const date=t.date;if(date!==previous){floor=nextStudy(s.settings,addDays(date>floor?date:floor,1))||addDays(s.settings.examDate,1);target=floor;previous=date;}moves.push({id:t.id,date:target});}
        addAdjustment(s,{type:'missed',sourceKey:key,sourceIds,from:day,subject,moves},now);
      }
      arrange(s,now);
    }
  }
}
function newContent(s,start,now, base) {
  const end=addDays(start,6), result=copy(base), represented=new Set(result.filter(t=>t.kind==='learn').map(t=>t.topicId));
  for(const f of s.completions)if(f.task.kind==='learn')represented.add(f.task.topicId);
  const subjects=activeSubjects(s.settings).filter(x=>x.id!=='politics');
  const tracks={math:['math','math1extra','linear','probability'],cs:['ds','co','os','net'],english:['english','english1extra']};
  function next(group,date) {for(const id of tracks[group]){const t=activeTopics(s.settings).find(t=>t.subject===id&&!represented.has(t.id)&&!paused(s,t.id));if(t&&(!date||!result.some(prior=>!prior.done&&!prior.suspended&&prior.kind==='learn'&&prior.subject===id&&(prior.queued||prior.date>date)&&!s.adjustments.some(a=>a.active&&a.type==='single'&&a.taskId===prior.id))))return t;}return null;}
  const make=(topic,date,kind='learn',minutes=topic.minutes)=>({id:`task:${start}:${s.nextSequence}`,baselineItemId:`original:${start}:${s.nextSequence}`,planWeek:start,sequence:s.nextSequence++,title:topic.title,topicId:topic.id,subject:topic.subject,minutes,kind,origin:'auto',date,done:false,queued:false});
  // Fill using existing later-week tasks from other courses before new catalogue entries.
  for(let date=now>start?now:start;date<=end&&date<s.settings.examDate;date=addDays(date,1)) {
    if(!isStudyDay(s.settings,date))continue;
    const budget=timeBudget(s.settings), mode=s.settings.politicsMode;
    const shiftedCourses=new Set(s.adjustments.filter(a=>a.active&&(a.type==='single'||a.type==='course')).filter(a=>(a.from||a.date)===date).map(a=>a.subject));
    const later=result.filter(t=>t.origin==='auto'&&!t.done&&!t.queued&&!t.suspended&&t.date>date&&t.date<=end&&!shiftedCourses.has(t.subject)&&!protectedTask(s,t)).sort(sortTasks);
    for(const t of later){const saved=t.date;const rest=result.filter(x=>x.id!==t.id);if(fit(s,t,date,rest,budget.normal)&&!rest.some(x=>x.date===date&&x.subject===t.subject&&!x.queued&&!x.suspended)){t.date=date;}else t.date=saved;}
    // At most one new item from each main group per pass; rotate by accumulated group time.
    for(let pass=0;pass<12;pass++) {
      const ratios={math:.42,cs:.36,english:.22};
      const groups=Object.keys(ratios).sort((a,b)=>result.filter(t=>t.date>=start&&t.date<=end&&subjectById[t.subject].group===a&&!t.queued).reduce((n,t)=>n+t.minutes,0)/ratios[a]-result.filter(t=>t.date>=start&&t.date<=end&&subjectById[t.subject].group===b&&!t.queued).reduce((n,t)=>n+t.minutes,0)/ratios[b]);
      let added=false;
      for(const g of groups){const topic=next(g,date);if(!topic||shiftedCourses.has(topic.subject))continue;const t=make(topic,date);const cap=budget.normal-(mode==='full'?politicalCap(s.settings,date):0);if(fit(s,t,date,result,cap)){result.push(t);represented.add(topic.id);added=true;break;}}
      if(!added)break;
    }
    if(mode!=='off'){
      const topic=activeTopics(s.settings).find(t=>t.subject==='politics'&&!represented.has(t.id)&&!paused(s,t.id));
      if(topic){const minutes=mode==='light'?20:politicalCap(s.settings,date);if(minutes>=10){const t=make(topic,date,'learn',minutes);if(fit(s,t,date,result)){result.push(t);represented.add(topic.id);}}}
    }
  }
  // An impossible new block is visible in backlog, rather than silently omitted.
  const remainingDays=Array.from({length:7},(_,i)=>addDays(start,i)).filter(d=>d>=now&&d<s.settings.examDate&&isStudyDay(s.settings,d));
  for(const group of ['math','cs','english']){const topic=next(group);if(topic&&!result.some(t=>!t.done&&t.kind==='learn'&&subjectById[t.subject].group===group)&&(topic.minutes>timeBudget(s.settings).full||!remainingDays.length)){const t=make(topic,now);t.queued=true;t.queueReason=topic.minutes>timeBudget(s.settings).full?'完整任务时长超过每日预算，可编辑时长':'本周没有剩余可学习日';result.push(t);represented.add(topic.id);}}
  if(s.settings.politicsMode!=='off'&&!remainingDays.length&&!result.some(t=>!t.done&&t.subject==='politics')){const topic=activeTopics(s.settings).find(t=>t.subject==='politics'&&!represented.has(t.id)&&!paused(s,t.id));if(topic){const t=make(topic,now,'learn',s.settings.politicsMode==='light'?20:Math.max(10,timeBudget(s.settings).politics));t.queued=true;t.queueReason='本周没有剩余可学习日';result.push(t);}}
  // Review and weak visits are distinct tasks and count toward the same full budget.
  const visits=[...dueTopics(s,now).map(t=>({t,kind:'review',minutes:20})),...activeTopics(s.settings).filter(t=>s.weakPoints[t.id]).map(t=>({t,kind:'practice',minutes:30}))];
  for(const {t:topic,kind,minutes}of visits){if(paused(s,topic.id)||result.some(t=>!t.done&&t.topicId===topic.id&&t.kind===kind)||topic.subject==='politics'&&s.settings.politicsMode!=='full')continue;for(let date=now>start?now:start;date<=end&&date<s.settings.examDate;date=addDays(date,1)){if(!isStudyDay(s.settings,date))continue;const t=make(topic,date,kind,minutes);if(fit(s,t,date,result)){result.push(t);break;}}}
  return result;
}
function protectedTask(s,t) {
  return s.adjustments.some(a=>a.active&&(a.taskId===t.id&&(a.type==='single'||a.type==='edit'&&(a.patch.date!==undefined||a.patch.minutes!==undefined))||a.type==='course'&&a.subject===t.subject&&t.date>=a.from||a.type==='missed'&&a.moves.some(m=>m.id===t.id)));
}
// One catalogue-ordered allocator is used for preview and learning-day replacement.
function layoutWeek(s, start, now) {
  const end=addDays(start,6), first=now>start?now:start, budget=timeBudget(s.settings);
  const scoped=t=>t.origin==='auto'&&!t.done&&!t.suspended&&(t.planWeek<=start||t.date<=end);
  const movable=s.tasks.filter(t=>scoped(t)&&!protectedTask(s,t)).map(copy);
  const result=s.tasks.filter(t=>!movable.some(x=>x.id===t.id)).map(copy);
  movable.sort((a,b)=>(a.kind==='learn'?0:1)-(b.kind==='learn'?0:1)||(order.get(a.topicId)??99999)-(order.get(b.topicId)??99999)||a.sequence-b.sequence);
  for(const t of movable){t.queued=false;delete t.queueReason;delete t.restrictionReason;}
  const weights={math:.42,cs:.36,english:.22};
  for(let date=first;date<=end&&date<s.settings.examDate;date=addDays(date,1)){
    if(!isStudyDay(s.settings,date))continue;
    for(let pass=0;pass<movable.length+30;pass++){
      const groups=Object.keys(weights).sort((a,b)=>result.filter(t=>t.date>=start&&t.date<=end&&!t.queued&&!t.suspended&&subjectById[t.subject].group===a).reduce((n,t)=>n+t.minutes,0)/weights[a]-result.filter(t=>t.date>=start&&t.date<=end&&!t.queued&&!t.suspended&&subjectById[t.subject].group===b).reduce((n,t)=>n+t.minutes,0)/weights[b]);
      let found=-1;
      for(const g of groups){const i=movable.findIndex(t=>t.kind==='learn'&&subjectById[t.subject].group===g);if(i>=0&&fit(s,movable[i],date,result,budget.normal-(s.settings.politicsMode==='full'?politicalCap(s.settings,date):0))){found=i;break;}}
      if(found<0)break;
      const [t]=movable.splice(found,1);t.date=date;t.desiredDate=date;t.originalDate=date;result.push(t);
    }
    for(let i=0;i<movable.length;i++){const t=movable[i];if((t.subject==='politics'||t.kind!=='learn')&&fit(s,t,date,result)){t.date=date;t.desiredDate=date;t.originalDate=date;result.push(t);movable.splice(i--,1);}}
  }
  for(const t of movable){let date=nextStudy(s.settings,end>=first?addDays(end,1):first);if(t.minutes>budget.full)date=null;while(date&&!fit(s,t,date,result))date=nextStudy(s.settings,addDays(date,1));if(date){t.date=date;t.originalDate=date;t.desiredDate=date;}else{t.date=first;t.queued=true;t.queueReason=!s.settings.studyDays.length?'没有可学习日':t.minutes>budget.full?'任务时长超过每日预算，未缩短':'考试日前没有可容纳的日期';}result.push(t);}
  return !s.settings.studyDays.length&&s.tasks.some(t=>!t.done)?result:newContent(s,start,now,result);
}
function registerTasks(s,tasks){for(const t of tasks)if(!t.history)s.taskDefinitions[t.id] ||= copy(t);}
function replaceDefault(s,week,now){
  for(const a of s.adjustments)if(a.type==='allocation')a.active=false;
  const base=copy(s);
  for(const a of base.adjustments)if(a.type!=='missed')a.active=false;
  arrange(base,now);
  const tasks=layoutWeek(base,week,now);
  s.nextSequence=base.nextSequence;
  registerTasks(s,tasks);
  const previous=s.weeks[week];
  const baseline=tasks.filter(t=>!t.history&&(t.done?monday(t.date)===week:t.planWeek<=week||monday(t.date)===week));
  s.weeks[week]={...(previous||{start:week,created:now,original:copy(baseline)}),baseline:copy(baseline),baselineRevision:(previous?.baselineRevision||0)+1,baselineUpdated:now,baselineSettings:copy(s.settings)};
  s.acceptedIds=[...new Set([...s.acceptedIds,...baseline.map(t=>t.id)])];
  arrange(s,now);
  const current=layoutWeek(s,week,now);
  registerTasks(s,current);
  for(const t of current)if(!t.history&&!s.acceptedIds.includes(t.id)){s.acceptedIds.push(t.id);addAdjustment(s,{type:'add',task:copy(t),automatic:true},now);}
  // Allocation is a system event after existing intent, never replayed as a delay.
  addAdjustment(s,{type:'allocation',automatic:true,moves:current.filter(t=>!t.history&&!t.done).map(t=>({id:t.id,date:t.date}))},now);
  arrange(s,now);s.draft=null;s.planNeedsReview=false;
}
function baseSignature(s) { return JSON.stringify([s.settings,s.tasks,s.adjustments,s.completions,s.progress,s.weakPoints,Object.values(s.weeks).map(w=>[w.start,w.baselineRevision])]); }
export function evaluatePlan(state,{today:now=today(),command={type:'tick'}}={}) {
  const s=copy(state), type=command.type, week=monday(command.week||now), summary=[];
  ensureSources(s);
  if(type==='settings'){
    const changedDays=JSON.stringify([...s.settings.studyDays].sort())!==JSON.stringify([...command.settings.studyDays].sort());
    const changed=JSON.stringify(s.settings)!==JSON.stringify(command.settings);
    if(changedDays)missed(s,now);
    s.settings=copy(command.settings);if(changed)s.planNeedsReview=true;
    if(changedDays){replaceDefault(s,monday(now),now);s.lastEvaluated=now;return {state:s,summary:['学习日已变更，本周默认计划与当前安排已重新规划。'],prompts:s.tasks.filter(t=>t.queued).map(t=>`${t.title}：${t.queueReason}`)};}
  }
  if(type==='cancel-adjustment'){const a=s.adjustments.find(a=>a.id===command.id);if(a&&a.type!=='missed'&&a.type!=='allocation'){a.active=false;for(const x of s.adjustments)if(x.type==='allocation')x.active=false;}}
  if(type==='restore'){
    const w=s.weeks[week];if(!w)throw new Error('本周尚未生成原版计划。');
    const count=s.adjustments.filter(a=>a.week===week&&a.active&&a.type!=='missed').length;
    for(const a of s.adjustments)if(a.week===week&&a.type!=='missed')a.active=false;
    s.acceptedIds=[...new Set([...s.acceptedIds,...defaultPlan(w).map(t=>t.id)])];s.draft=null;summary.push(`撤销本周 ${count} 项人为修改；保留 ${s.completions.length} 条完成记录。`);
  }
  if(['single','course','pause','edit','add','delete'].includes(type)){
    if(type==='add'){s.acceptedIds=[...new Set([...s.acceptedIds,command.task.id])];registerTasks(s,[command.task]);}
    const task=s.tasks.find(t=>t.id===command.taskId);if(task?.done)throw new Error('已完成任务不能移动或删除。');
    if(type==='delete'&&task?.origin!=='manual')throw new Error('自动任务请使用顺延或永久暂停。');
    const fields={...copy(command)};delete fields.week;
    if(type==='single'){fields.from=task.date;fields.subject=task.subject;fields.to=nextStudy(s.settings,addDays(task.date,1))||addDays(s.settings.examDate,1);}
    if(type==='course'){fields.from=command.from||task.date;fields.subject=command.subject||task.subject;}
    if(type==='pause'){fields.topicId=command.topicId||task?.topicId;if(!fields.topicId)throw new Error('自加任务可直接删除。');}
    addAdjustment(s,fields,command.week||now);
  }
  arrange(s,now);missed(s,now);
  if(type==='generate'||type==='regenerate') {
    const before=copy(s.tasks), tasks=layoutWeek(s,week,now);
    if(!s.weeks[week])s.weeks[week]={start:week,created:now,original:copy(tasks.filter(t=>!t.history&&t.date>=week&&t.date<=addDays(week,6)))};
    ensureSources(s);
    // First-generation original must exist without activating its new tasks.
    s.draft={week,created:now,tasks,adjustments:copy(s.adjustments),basedOn:baseSignature(s),intents:[],summary:[`新增 ${tasks.filter(t=>!before.some(x=>x.id===t.id)).length} 项；原版保持不变。`]};
    s.tasks=before;
  }
  if(type==='draft-command'){
    if(!s.draft)throw new Error('没有计划草案。');
    const working=copy(s);working.tasks=copy(s.draft.tasks);working.adjustments=copy(s.draft.adjustments);
    // Seed draft-only task definitions for evaluating editing intent.
    registerTasks(working,s.draft.tasks);working.acceptedIds=[...new Set([...working.acceptedIds,...s.draft.tasks.filter(t=>!t.history).map(t=>t.id)])];working.draft=null;
    const result=evaluatePlan(working,{today:now,command:command.intent});
    s.nextSequence=result.state.nextSequence;s.draft.tasks=result.state.tasks;s.draft.adjustments=result.state.adjustments;s.draft.intents.push({...copy(command.intent),reference:copy(working.tasks.find(t=>t.id===command.intent.taskId)||null)});
  }
  if(type==='recheck-draft') {
    const intents=copy(s.draft?.intents||[]);const result=evaluatePlan({...s,draft:null},{today:now,command:{type:'regenerate',week}});Object.assign(s,result.state);
    const remapped=new Map();for(const prior of intents){const intent=copy(prior);if(intent.taskId){let target=s.draft.tasks.find(t=>t.id===(remapped.get(intent.taskId)||intent.taskId));if(!target&&intent.reference)target=s.draft.tasks.find(t=>t.topicId===intent.reference.topicId&&t.kind===intent.reference.kind);if(!target){s.draft.summary.push('保留未匹配的编辑：'+(intent.reference?.title||intent.taskId));s.draft.intents.push(prior);continue;}remapped.set(prior.taskId,target.id);intent.taskId=target.id;}const r=evaluatePlan(s,{today:now,command:{type:'draft-command',week,intent}});Object.assign(s,r.state);}
  }
  if(type==='confirm'){
    const d=s.draft;if(!d)throw new Error('没有计划草案。');
    if(d.created!==now||d.basedOn!==baseSignature(s))throw new Error('草案需要重新核对，编辑意图已保留。');
    const known=new Set(definitions(s).map(t=>t.id));
    s.adjustments=copy(d.adjustments);s.acceptedIds=[...new Set([...s.acceptedIds,...d.tasks.filter(t=>!t.history).map(t=>t.id)])];
    registerTasks(s,d.tasks);
    for(const t of d.tasks)if(!t.history&&!known.has(t.id)&&!Object.values(s.weeks).some(w=>w.original.some(x=>x.id===t.id))&&!s.adjustments.some(a=>a.type==='add'&&a.task.id===t.id))addAdjustment(s,{type:'add',task:copy(t)},now);
    addAdjustment(s,{type:'allocation',automatic:true,moves:d.tasks.filter(t=>!t.history&&!t.done).map(t=>({id:t.id,date:t.date}))},now);
    s.draft=null;s.planNeedsReview=false;arrange(s,now);
  }
  if(type==='cancel-draft')s.draft=null;
  if(type==='tick'&&s.onboardingCompleted&&!s.weeks[monday(now)]&&!s.draft){return evaluatePlan(s,{today:now,command:{type:'generate'}});}
  s.lastEvaluated=now;
  return {state:s,summary,prompts:s.tasks.filter(t=>t.queued).map(t=>`${t.title}：${t.queueReason}`)};
}
export function draftStale(s,now=today()){return !!s.draft&&(s.draft.created!==now||s.draft.basedOn!==baseSignature(s));}
