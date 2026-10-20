import * as E from './engine.js';
import {activeTopics} from './curriculum.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
export const REASONS=['时间不足','内容较难','临时事务','其他'];

export function markWeak(state,topicId,{reason='',dueDate=E.addDays(E.dateKey(),7),resolved=false}={},now=E.dateKey()) {
  const next=E.validateState(state);
  if(!E.topicById[topicId]||typeof reason!=='string'||reason.length>500||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||E.dateKey(dueDate)!==dueDate)throw new Error('请填写有效的回顾日期和原因（最多500字）。');
  const old=next.weakPoints[topicId];
  next.weakPoints[topicId]={reason:reason.trim(),dueDate,status:resolved?'resolved':'open',cycle:old?old.cycle+(old.status==='awaiting'||old.status==='resolved'?1:0):1};
  if(old?.status==='open'&&old.dueDate!==dueDate)for(const task of next.tasks.filter(t=>!t.done&&t.reviewKey===`${topicId}:${old.cycle}`)){task.manualMoved=true;E.placeTask(next,task,dueDate<now?now:dueDate);}
  return E.validateState(next);
}
export function resolveWeak(state,id) {
  const next=E.validateState(state);if(!next.weakPoints[id])throw new Error('查漏条目不存在。');
  next.weakPoints[id].status='resolved';
  for(const task of next.tasks)if(task.reviewKey&&task.topicId===id&&!task.done){task.suspended=true;task.queueReason='本次查漏已解决';}
  return E.validateState(next);
}
export function dueWeak(state,date=E.dateKey()) {
  const active=new Set(activeTopics(state.settings).map(t=>t.id));
  return Object.entries(state.weakPoints||{}).filter(([id,w])=>active.has(id)&&w.status==='open'&&w.dueDate<=date).map(([id,w])=>({id,...w,topic:E.topicById[id]})).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.id.localeCompare(b.id));
}
export function addReview(state,id,now=E.dateKey()) {
  const next=E.validateState(state),w=next.weakPoints[id],topic=E.topicById[id];
  if(!w||!topic||w.status!=='open')throw new Error('该知识点当前不需要新建回顾。');
  const key=`${id}:${w.cycle}`;
  if(next.tasks.some(t=>t.reviewKey===key)||next.completions.some(t=>t.reviewKey===key))return next;
  const task={id:`task-${next.nextId++}`,topicId:id,reviewKey:key,subject:topic.subject,title:topic.title,date:w.dueDate<now?now:w.dueDate,minutes:topic.subject==='politics'&&next.settings.politicsMode==='light'?20:25,kind:'review',origin:'auto',done:false,examTrack:E.trackFor(topic.subject,next.settings),createdWeek:E.monday(now)};
  E.placeTask(next,task,task.date);next.tasks.push(task);return E.validateState(next);
}
function generateWithReviews(state,now) {
  let next=E.validateState(state);
  for(const task of next.tasks)if(!task.done&&!task.suspended&&task.origin==='auto'&&!task.manualEdited&&!task.manualMoved&&task.date>=now&&task.date<=E.weekEnd(now))task.queued=true;
  for(const item of dueWeak(next,E.weekEnd(now)))next=addReview(next,item.id,now);
  return E.generateWeek(next,now,true);
}
export function summarize(before,after) {
  const previous=new Map(before.tasks.map(t=>[t.id,t])),following=new Map(after.tasks.map(t=>[t.id,t]));
  const changes=[];
  for(const id of new Set([...previous.keys(),...following.keys()])){
    const a=previous.get(id),b=following.get(id);
    if(same(a,b))continue;
    changes.push({id,title:b?.title||a.title,subject:b?.subject||a.subject,from:a?.date||null,to:b?.date||null,minutes:b?.minutes||a.minutes,type:!a?'added':!b?'removed':b.suspended&&!a.suspended?'paused':a.suspended&&!b.suspended?'resumed':a.date!==b.date?'moved':'edited',queued:!!b?.queued,reason:b?.queueReason||'',before:a||null,after:b||null});
  }
  return changes;
}
export function applyPlanChange(state,candidate,label,now=E.dateKey()) {
  const before=E.validateState(state),next=E.validateState(candidate),changes=summarize(before,next);
  const rules=[];
  const a=new Map(before.pausedTopics.map(p=>[p.topicId,p])),b=new Map(next.pausedTopics.map(p=>[p.topicId,p]));
  for(const id of new Set([...a.keys(),...b.keys()]))if(!same(a.get(id),b.get(id)))rules.push({id,before:a.get(id)||null,after:b.get(id)||null});
  if(!changes.length&&!rules.length)return next;
  const id=E.uid('adjust');
  next.lastUndo={id,label,week:E.monday(now),tasks:changes.map(c=>({id:c.id,before:c.before,after:c.after})),rules};
  next.adjustments.push({id,date:now,label,changes:changes.map(({before,after,...c})=>c),source:'manual'});
  next.adjustments=next.adjustments.slice(-100);
  return E.validateState(next);
}
export function evaluatePlan(state,{today=E.dateKey(),command}={}) {
  const base=E.validateState(state);let next,label;
  switch(command.type){
    case 'generate':next=generateWithReviews(reconcile(base,today),today);label=base.defaultWeek?.week===E.monday(today)?'重新安排本周':'生成本周计划';break;
    case 'delay':next=E.delayOne(base,command.id);label='顺延单个知识点';break;
    case 'course':next=E.delayCourse(base,command.id);label='整门课程顺延';break;
    case 'pause':next=E.pauseTopic(base,command.id,today);label='永久暂停知识点';break;
    case 'resume':next=E.resumeTopic(base,command.id,today);label='恢复知识点安排';break;
    case 'restore':next=E.restoreDefault(base,today);label='恢复默认计划';break;
    case 'edit':next=E.editTask(base,command.id,command.fields);label='修改任务';break;
    case 'add':next=E.addManualTask(base,command.fields);label='添加学习内容';break;
    case 'delete':next=E.deleteManualTask(base,command.id);label='删除自加任务';break;
    case 'review':next=addReview(base,command.id,today);label='加入查漏回顾';break;
    default:throw new Error('未知的计划操作。');
  }
  const changes=summarize(base,next);
  return {state:applyPlanChange(base,next,label,today),label,changes};
}
export function undoPlan(state,now=E.dateKey()) {
  const next=E.validateState(state),undo=next.lastUndo;if(!undo)throw new Error('没有可撤销的计划调整。');
  let skipped=0;
  for(const patch of undo.tasks){
    const current=next.tasks.find(t=>t.id===patch.id);
    if(current?.done||!same(current,patch.after)){skipped++;continue;}
    next.tasks=next.tasks.filter(t=>t.id!==patch.id);
    if(patch.before)next.tasks.push(clone(patch.before));
  }
  for(const patch of undo.rules){
    const current=next.pausedTopics.find(p=>p.topicId===patch.id);
    if(!same(current,patch.after)){skipped++;continue;}
    next.pausedTopics=next.pausedTopics.filter(p=>p.topicId!==patch.id);if(patch.before)next.pausedTopics.push(clone(patch.before));
  }
  next.lastUndo=null;
  next.adjustments.push({id:E.uid('undo'),date:now,label:'撤销：'+undo.label,changes:[],source:'undo',skipped});
  return {state:E.enforceBudget(next,now),skipped};
}
export function reconcile(state,now=E.dateKey()) {
  const base=E.refreshAutoExamDate(E.validateState(state),now);
  if(E.monday(base.lastProcessedDate)<E.monday(now)){
    const weeks=new Set(base.tasks.filter(t=>t.date< E.monday(now)).map(t=>E.monday(t.date)));
    for(const week of weeks)if(!base.weekReports[week]){const items=base.tasks.filter(t=>t.date>=week&&t.date<=E.weekEnd(week));base.weekReports[week]={planned:clone(items.filter(t=>t.done||!t.queued&&!t.suspended)),queued:items.filter(t=>!t.done&&t.queued&&!t.suspended).length,paused:items.filter(t=>!t.done&&t.suspended).length};}
  }
  const next=E.processMissed(base,now),changes=summarize(base,next);
  if(changes.length){next.adjustments.push({id:E.uid('auto'),date:now,label:'漏学自动顺延',changes:changes.map(({before,after,...c})=>c),source:'system'});next.adjustments=next.adjustments.slice(-100);}
  return E.validateState(next);
}
export function setMissReason(state,id,reason) {
  const next=E.validateState(state),task=next.tasks.find(t=>t.id===id);if(!task)throw new Error('任务不存在。');
  if(reason!==''&&!REASONS.includes(reason))throw new Error('未完成原因不正确。');task.missReason=reason;return next;
}
export function saveManualSession(state,fields,id=null,now=E.dateKey()) {
  const next=E.validateState(state),old=id?next.sessions.find(s=>s.id===id):null;
  if(id&&old?.source!=='manual')throw new Error('只能编辑手动补记。');
  const minutes=Number(fields.minutes);
  if(!E.subjectById[fields.subject]||!Number.isInteger(minutes)||minutes<1||minutes>960||!fields.date||E.dateKey(fields.date)!==fields.date||fields.date>now)throw new Error('请选择课程、过去或今天的日期，以及1–960分钟。');
  const total=next.sessions.filter(s=>s.id!==id&&s.date===fields.date).reduce((sum,s)=>sum+s.seconds,0)+minutes*60;
  if(total>86400)throw new Error('这一天的累计记录超过24小时，请核对时长。');
  const item={id:id||E.uid('manual'),source:'manual',subject:fields.subject,examTrack:old?.subject===fields.subject?old.examTrack:E.trackFor(fields.subject,next.settings),date:fields.date,seconds:minutes*60,note:String(fields.note||'').slice(0,200)};
  if(id)next.sessions=next.sessions.map(s=>s.id===id?item:s);else next.sessions.push(item);
  return E.validateState(next);
}
export function deleteManualSession(state,id) {
  const next=E.validateState(state);if(next.sessions.find(s=>s.id===id)?.source!=='manual')throw new Error('计时记录不支持删除。');next.sessions=next.sessions.filter(s=>s.id!==id);return next;
}
export function weeklySummary(state,week=E.monday(E.dateKey())) {
  let stats=E.weekStats(state,week);const end=E.weekEnd(week),report=state.weekReports?.[week];
  if(report){const done=report.planned.filter(t=>state.completions.some(c=>c.taskId===t.id&&c.title===t.title&&c.topicId===t.topicId&&c.minutes===t.minutes&&c.date>=week&&c.date<=end)).length;stats={total:report.planned.length,done,percent:report.planned.length?Math.round(done/report.planned.length*100):0,queued:report.queued,paused:report.paused};}
  const sessions=state.sessions.filter(s=>s.date>=week&&s.date<=end),courses=new Map(),reasons={};
  for(const s of sessions){const key=`${s.subject}:${s.examTrack||''}`;const old=courses.get(key)||{subject:s.subject,examTrack:s.examTrack,seconds:0};old.seconds+=s.seconds;courses.set(key,old);}
  for(const t of (report?report.planned:state.tasks.filter(t=>!t.done&&t.date>=week&&t.date<=end||!t.done&&t.missReason&&t.createdWeek===week)))if(t.missReason)reasons[t.missReason]=(reasons[t.missReason]||0)+1;
  const seconds=sessions.reduce((sum,s)=>sum+s.seconds,0);
  return {...stats,week,seconds,courses:[...courses.values()].sort((a,b)=>b.seconds-a.seconds),reasons,manualSeconds:sessions.filter(s=>s.source==='manual').reduce((n,s)=>n+s.seconds,0),advice:!stats.total?'还没有安排，先从适合自己的小计划开始。':stats.percent<50?'本周未完成内容较多，下周可以适当减少每日安排。':'把适合自己的节奏继续保持，留出回顾和休息的时间。'};
}
export function streak(state,now=E.dateKey()) {
  const dates=new Set([...state.completions,...state.sessions].map(s=>s.date));let n=0,date=dates.has(now)?now:E.addDays(now,-1);
  while(dates.has(date)){n++;date=E.addDays(date,-1);}return n;
}
