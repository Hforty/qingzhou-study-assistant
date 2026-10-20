import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../web/lib/qz/engine.js';
import * as F from '../web/lib/qz/features.js';
import {Store,makeBackup,parseBackup} from '../web/js/store.js';
const today='2026-10-20';
const fresh=()=>E.createState(today);
const planned=()=>E.generateWeek(fresh(),today);
test('v1 record migration fills v2 fields without mutating or inventing old weeks',()=>{
  const old=planned();old.schemaVersion=1;delete old.weakPoints;delete old.weeklyPlans;delete old.adjustments;delete old.lastUndo;
  const bytes=JSON.stringify(old),next=E.validateState(old);assert.equal(JSON.stringify(old),bytes);assert.equal(next.schemaVersion,2);assert.deepEqual(next.tasks,old.tasks);assert.deepEqual(Object.keys(next.weeklyPlans),[old.defaultWeek.week]);
});
test('weekly originals survive creating another week and repeated regeneration',()=>{
  let state=planned(),week=E.monday(today),original=structuredClone(state.weeklyPlans[week]);state=E.generateWeek(state,'2026-10-26');state=E.replan(state,'2026-10-26');assert.deepEqual(state.weeklyPlans[week],original);
});
test('plan preview is pure and reports dates and additions',()=>{
  const state=planned(),bytes=JSON.stringify(state),id=state.tasks[0].id,result=F.evaluatePlan(state,{today,command:{type:'delay',id}});
  assert.equal(JSON.stringify(state),bytes);assert.ok(result.changes.some(c=>c.id===id&&c.from!==c.to));assert.ok(result.state.lastUndo);
});
test('undo preserves completion facts written after the adjustment',()=>{
  let state=planned(),id=state.tasks[0].id;state=F.evaluatePlan(state,{today,command:{type:'delay',id}}).state;state=E.toggleTask(state,id,today);
  const facts=structuredClone(state.completions),result=F.undoPlan(state,today);assert.deepEqual(result.state.completions,facts);assert.equal(result.state.tasks.find(t=>t.id===id).done,true);assert.ok(result.skipped>=1);
});
test('undo only touches the last operation and retains unrelated mastery and sessions',()=>{
  let state=planned(),id=state.tasks[0].id,date=state.tasks[0].date;state=F.evaluatePlan(state,{today,command:{type:'delay',id}}).state;state=E.setLevel(state,'math-0-0',3,today);state=F.saveManualSession(state,{subject:'english',date:today,minutes:20},null,today);
  const result=F.undoPlan(state,today);assert.equal(result.state.tasks.find(t=>t.id===id).date,date);assert.equal(result.state.sessions.length,1);assert.equal(result.state.progress['math-0-0'].level,3);assert.equal(result.state.lastUndo,null);
});
test('undo does not overwrite a more recent edit to the same task',()=>{
  let state=planned(),id=state.tasks[0].id;state=F.evaluatePlan(state,{today,command:{type:'delay',id}}).state;state=E.editTask(state,id,{title:'保留的新标题'});const result=F.undoPlan(state,today);assert.equal(result.state.tasks.find(t=>t.id===id).title,'保留的新标题');assert.ok(result.skipped);
});
test('pause undo removes just its own pause rule and restores eligible task',()=>{
  let state=planned(),task=state.tasks.find(t=>t.topicId);state=F.evaluatePlan(state,{today,command:{type:'pause',id:task.id}}).state;state=F.undoPlan(state,today).state;assert.equal(state.pausedTopics.length,0);assert.equal(state.tasks.find(t=>t.id===task.id).suspended,false);
});
test('marking weakness is independent of mastery and task completion',()=>{
  const state=F.markWeak(planned(),'math-0-0',{reason:'还需动手练',dueDate:today});assert.equal(E.progressPercent(state),0);assert.equal(state.completions.length,0);assert.equal(F.dueWeak(state,today).length,1);
});
test('adding the same review twice creates one task and no base-learning completion',()=>{
  let state=F.markWeak(fresh(),'math-0-0',{dueDate:today});state=F.addReview(F.addReview(state,'math-0-0',today),'math-0-0',today);assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].kind,'review');state=E.toggleTask(state,state.tasks[0].id,today);assert.equal(state.weakPoints['math-0-0'].status,'awaiting');assert.equal(state.completions[0].reviewKey,'math-0-0:1');
});
test('another review cycle is explicit and a resolved point stops outstanding automatic reviews',()=>{
  let state=F.markWeak(fresh(),'math-0-0',{dueDate:today});state=F.addReview(state,'math-0-0',today);state=E.toggleTask(state,state.tasks[0].id,today);state=F.markWeak(state,'math-0-0',{dueDate:E.addDays(today,7)});assert.equal(state.weakPoints['math-0-0'].cycle,2);state=F.addReview(state,'math-0-0',today);state=F.resolveWeak(state,'math-0-0');assert.ok(state.tasks.filter(t=>!t.done).every(t=>t.suspended));
});
test('due review receives budget before unfixed new content when regenerating',()=>{
  let state=planned();state=F.markWeak(state,'net-0-0',{dueDate:today});state=F.evaluatePlan(state,{today,command:{type:'generate'}}).state;const review=state.tasks.find(t=>t.reviewKey==='net-0-0:1');assert.ok(review);assert.ok(!review.queued);assert.ok(review.date<=E.weekEnd(today));
  for(const date of new Set(state.tasks.map(t=>t.date)))assert.ok(state.tasks.filter(t=>t.date===date&&!t.queued&&!t.suspended).reduce((n,t)=>n+t.minutes,0)<=240);
});
test('politics review obeys off/light and does not revive paused topics',()=>{
  let state=fresh();state.settings.politicsMode='off';state=F.markWeak(state,'politics-0-0',{dueDate:today});state=F.addReview(state,'politics-0-0',today);assert.equal(state.tasks[0].queued,true);
  state=fresh();state=F.markWeak(state,'politics-0-0',{dueDate:today});state=F.addReview(state,'politics-0-0',today);assert.equal(state.tasks[0].minutes,20);
  state=E.pauseTopic(state,state.tasks[0].id,today);state=F.evaluatePlan(state,{today,command:{type:'generate'}}).state;assert.ok(state.tasks.filter(t=>t.topicId==='politics-0-0'&&!t.done).every(t=>t.suspended));
});
test('mastery from another exam remains stored while inactive weakness is filtered out',()=>{
  let state=fresh();state.settings.mathExam='math1';const id=Object.values(E.topicById).find(t=>t.subject==='probability').id;state=F.markWeak(state,id,{dueDate:today});state.settings.mathExam='math2';assert.equal(F.dueWeak(state,today).length,0);assert.ok(state.weakPoints[id]);
});
test('manual study retains historical exam track when exams change',()=>{
  let state=F.saveManualSession(fresh(),{subject:'math',date:today,minutes:35},null,today),id=state.sessions[0].id;state.settings.mathExam='math1';state=F.saveManualSession(state,{subject:'math',date:today,minutes:40},id,today);assert.equal(state.sessions[0].examTrack,'math2');
});
test('manual records are editable and deletable while timer records are protected',()=>{
  let state=F.saveManualSession(fresh(),{subject:'english',date:today,minutes:25},null,today),id=state.sessions[0].id;state=F.deleteManualSession(state,id);assert.equal(state.sessions.length,0);state.sessions.push({id:'focus-original',subject:'math',date:today,seconds:10});assert.throws(()=>F.deleteManualSession(state,'focus-original'));assert.throws(()=>F.saveManualSession(state,{subject:'math',date:today,minutes:10},'focus-original',today));
});
test('manual records reject future dates and daily totals beyond 24 hours',()=>{
  assert.throws(()=>F.saveManualSession(fresh(),{subject:'english',date:E.addDays(today,1),minutes:25},null,today));let state=F.saveManualSession(fresh(),{subject:'math',date:today,minutes:960},null,today);assert.throws(()=>F.saveManualSession(state,{subject:'english',date:today,minutes:500},null,today));
});
test('weekly summary excludes suspended and queued tasks from completion denominator',()=>{
  let state=planned(),a=state.tasks[0],b=state.tasks[1];state=E.toggleTask(state,a.id,today);state.tasks.find(t=>t.id===b.id).queued=true;const expected=state.tasks.filter(t=>t.done||!t.queued&&!t.suspended).length;const summary=F.weeklySummary(state,E.monday(today));assert.equal(summary.total,expected);assert.equal(summary.queued,1);assert.equal(summary.done,1);
});
test('weekly course totals and manual time add up to exact seconds',()=>{
  let state=F.saveManualSession(fresh(),{subject:'math',date:today,minutes:20},null,today);state.sessions.push({id:'timer',subject:'math',examTrack:'math2',date:today,seconds:13});const summary=F.weeklySummary(state,E.monday(today));assert.equal(summary.seconds,1213);assert.equal(summary.manualSeconds,1200);assert.equal(summary.courses[0].seconds,1213);
});
test('automatic processing is idempotent and logs only actual movement',()=>{
  let state=planned();state.tasks[0].date=E.addDays(today,-2);state=F.reconcile(state,today);const count=state.adjustments.length;assert.ok(count);assert.deepEqual(F.reconcile(state,today),state);
});
test('v1 backups import and v2 backup round trips include weakness and originals',()=>{
  let state=F.markWeak(planned(),'math-0-0',{dueDate:today}),backup=makeBackup(state);assert.equal(JSON.parse(backup).version,2);assert.deepEqual(parseBackup(backup),state);
  const old=JSON.parse(backup);old.version=1;old.state.schemaVersion=1;delete old.state.weakPoints;delete old.state.weeklyPlans;delete old.state.adjustments;delete old.state.lastUndo;assert.equal(parseBackup(JSON.stringify(old)).schemaVersion,2);
});
test('failed persistence of a plan change keeps both old tasks and old undo record',()=>{
  const state=planned(),raw=JSON.stringify(state),disk={read:()=>raw,write(){throw new Error('disk full');}},store=new Store(disk);assert.throws(()=>store.update(s=>F.evaluatePlan(s,{today,command:{type:'delay',id:s.tasks[0].id}}).state));assert.deepEqual(store.state,state);
});
test('cross-week carryover cannot turn a missed old week into a perfect completion rate',()=>{
  let state=planned(),oldWeek=E.monday(today),count=E.weekStats(state,oldWeek).total;state=E.toggleTask(state,state.tasks[0].id,today);state=F.reconcile(state,'2026-10-26');const result=F.weeklySummary(state,oldWeek);assert.equal(result.total,count);assert.equal(result.done,1);assert.ok(result.percent<100);assert.deepEqual(F.reconcile(state,'2026-10-26'),state);
});
test('editing an open recall date moves its already scheduled review without duplication',()=>{
  let state=F.markWeak(fresh(),'math-0-0',{dueDate:today});state=F.addReview(state,'math-0-0',today);state=F.markWeak(state,'math-0-0',{dueDate:'2026-10-29'},today);assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].date,'2026-10-29');assert.equal(state.tasks[0].manualMoved,true);
});
test('restore default cannot reactivate a review marked resolved afterward',()=>{
  let state=F.markWeak(fresh(),'math-0-0',{dueDate:today});state=F.evaluatePlan(state,{today,command:{type:'generate'}}).state;state=F.resolveWeak(state,'math-0-0');state=E.restoreDefault(state,today);assert.ok(state.tasks.filter(t=>t.reviewKey&&!t.done).every(t=>t.suspended));
});
test('low budgets produce explained backlog without adding another oversized topic on every regeneration',()=>{
  let state=fresh();state.settings.dailyHours=.5;state.settings.politicsMode='off';state=F.evaluatePlan(state,{today,command:{type:'generate'}}).state;const count=state.tasks.length;assert.ok(count>0);assert.ok(state.tasks.every(t=>t.queued&&t.queueReason));state=F.evaluatePlan(state,{today,command:{type:'generate'}}).state;assert.equal(state.tasks.length,count);
});
test('full politics with a tiny daily share accumulates into valid ten-minute tasks',()=>{
  let state=fresh();state.settings.dailyHours=.5;state.settings.politicsMode='full';state=F.evaluatePlan(state,{today,command:{type:'generate'}}).state;const tasks=state.tasks.filter(t=>t.subject==='politics'&&!t.queued);assert.ok(tasks.length);assert.ok(tasks.every(t=>t.minutes===10));assert.ok(tasks.reduce((n,t)=>n+t.minutes,0)<=30);
});
