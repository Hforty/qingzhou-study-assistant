import {dateKey,addDays,uid,validateState,topicById} from './engine.js';
const clone=value=>JSON.parse(JSON.stringify(value));
export const validTime=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const validDate=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value)&&dateKey(value)===value;
export function saveTodo(state,fields,id=null){
  const next=validateState(state),old=id?next.todos.find(t=>t.id===id):null;
  if(id&&!old)throw new Error('事项已经变化，请返回后重试。');
  const title=String(fields.title||'').trim(),date=fields.date||null,time=fields.remindTime||null;
  if(!title||title.length>200)throw new Error('请填写200字以内的事项。');
  if(date&&!validDate(date)||time&&(!date||!validTime(time)))throw new Error('设置提醒前，请选择日期和有效时间。');
  const todo={...old,id:old?.id||uid('todo'),title,date,done:old?.done||false,createdAt:old?.createdAt||dateKey(),remindTime:time};
  if(old)next.todos[next.todos.indexOf(old)]=todo;else next.todos.push(todo);
  return validateState(next);
}
export function toggleTodo(state,id,today=dateKey()){
  const next=validateState(state),todo=next.todos.find(t=>t.id===id);if(!todo)throw new Error('没有找到该事项。');
  todo.done=!todo.done;if(todo.done)todo.completedDate=today;else delete todo.completedDate;
  return validateState(next);
}
export function deleteTodo(state,id){const next=validateState(state);next.todos=next.todos.filter(t=>t.id!==id);return next;}
export function saveReminder(state,fields,id=null){
  const next=validateState(state),old=id?next.reminders.find(r=>r.id===id):null;
  if(id&&!old)throw new Error('提醒已经变化，请重新打开。');
  const title=String(fields.title||'').trim(),days=fields.followStudyDays?[]:[...new Set(fields.days||[])].sort();
  if(!title||title.length>100||!validTime(fields.time)||days.some(d=>!Number.isInteger(d)||d<0||d>6)||!fields.followStudyDays&&!days.length)throw new Error('请填写提醒内容、时间和重复星期。');
  const reminder={id:old?.id||uid('reminder'),title,time:fields.time,days,followStudyDays:!!fields.followStudyDays,enabled:fields.enabled!==false};
  if(old)next.reminders[next.reminders.indexOf(old)]=reminder;else next.reminders.push(reminder);
  return validateState(next);
}
export function setTaskReminder(state,id,time){
  const next=validateState(state),task=next.tasks.find(t=>t.id===id);
  if(!task||task.done||task.suspended||task.queued)throw new Error('该任务当前无法设置提醒。');
  if(time&&!validTime(time))throw new Error('请选择有效的提醒时间。');
  if(time)next.taskReminders[id]=time;else delete next.taskReminders[id];
  return validateState(next);
}
export function cleanTaskReminders(state){
  const next=clone(state),ids=new Set(next.tasks.map(t=>t.id));
  for(const id of Object.keys(next.taskReminders||{}))if(!ids.has(id))delete next.taskReminders[id];
  return next;
}
export function nextReminder(state,nowMs=Date.now()){
  const now=new Date(nowMs),today=dateKey(now),candidates=[];
  const at=(date,time)=>new Date(date+'T'+time+':00').getTime();
  for(const r of state.reminders){if(!r.enabled)continue;const days=r.followStudyDays?state.settings.studyDays:r.days;
    for(let i=0;i<8;i++){const date=addDays(today,i),stamp=at(date,r.time);if(days.includes(new Date(date+'T12:00:00').getDay())&&stamp>nowMs){candidates.push({...r,date,at:stamp});break;}}
  }
  for(const task of state.tasks){const time=state.taskReminders[task.id];if(time&&!task.done&&!task.queued&&!task.suspended&&at(task.date,time)>nowMs)candidates.push({id:task.id,title:task.title,date:task.date,time,at:at(task.date,time)});}
  for(const todo of state.todos){if(!todo.done&&todo.date&&todo.remindTime&&at(todo.date,todo.remindTime)>nowMs)candidates.push({id:todo.id,title:todo.title,date:todo.date,time:todo.remindTime,at:at(todo.date,todo.remindTime)});}
  return candidates.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))[0]||null;
}
export function taskSeconds(state,id){return state.sessions.filter(s=>s.taskId===id).reduce((n,s)=>n+s.seconds,0);}
export function matchingResultTask(state,result=state.lastFocusResult){
  if(!result?.taskId)return null;
  return state.tasks.find(t=>t.id===result.taskId&&t.title===result.taskTitle&&(t.topicId||'')===(result.topicId||'')&&!t.suspended&&!t.queued)||null;
}
