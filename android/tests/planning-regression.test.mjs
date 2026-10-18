import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../web/lib/qz/engine.js';
const day='2026-10-05';
function chain(){
  const s=E.createState(day);s.settings.politicsMode='off';s.settings.dailyHours=1;
  for(let i=0;i<3;i++)s.tasks.push({id:`task-${s.nextId++}`,topicId:`math-0-${i}`,subject:'math',title:`ABC`[i],date:E.addDays(day,i),minutes:60,kind:'learn',origin:'auto',done:false});
  s.onboardingCompleted=true;s.defaultWeek={week:day,tasks:structuredClone(s.tasks)};return s;
}
test('course chain releases its old slots before cascading A/B/C one day forward',()=>{
  const s=E.delayCourse(chain(),'task-1');assert.deepEqual(s.tasks.map(t=>t.date),['2026-10-06','2026-10-07','2026-10-08']);
});
test('missing several days preserves A/B/C order without duplicate postponement',()=>{
  const s=E.processMissed(chain(),'2026-10-07');assert.deepEqual(s.tasks.map(t=>t.date),['2026-10-07','2026-10-08','2026-10-09']);assert.deepEqual(E.processMissed(s,'2026-10-07'),s);
});
test('multiple paused knowledge points resume in catalog order regardless of restore order',()=>{
  let s=E.pauseTopic(E.pauseTopic(chain(),'task-1',day),'task-2',day);
  const a=E.resumeTopic(E.resumeTopic(s,'math-0-0',day),'math-0-1',day);
  const b=E.resumeTopic(E.resumeTopic(s,'math-0-1',day),'math-0-0',day);
  assert.deepEqual(a.tasks.map(t=>[t.id,t.date,t.queued,t.suspended]),b.tasks.map(t=>[t.id,t.date,t.queued,t.suspended]));
});
test('replanning counts already completed time against the daily budget',()=>{
  let s=chain();s=E.toggleTask(s,'task-1',day);s=E.replan(s,day);
  const used=s.tasks.filter(t=>t.date===day&&!t.suspended&&!t.queued).reduce((n,t)=>n+t.minutes,0);assert.ok(used<=60);
});
test('time reduction and an expired target queue work without shrinking or losing tasks',()=>{
  const s=chain(),next=E.updateSettings(s,{...s.settings,dailyHours:.5,examDate:'2026-10-04',examDateMode:'manual'},day);
  assert.equal(next.tasks.length,3);assert.ok(next.tasks.every(t=>t.queued&&t.minutes===60&&t.queueReason));
});
test('restoring an edited completed B keeps B history and never marks original A complete',()=>{
  let s=chain();s=E.editTask(s,'task-1',{title:'编辑后的 B'});s=E.toggleTask(s,'task-1',day);s=E.restoreDefault(s,day);
  assert.ok(s.tasks.some(t=>t.title==='编辑后的 B'&&t.done));assert.ok(s.tasks.some(t=>t.title==='A'&&!t.done));assert.equal(s.completions[0].title,'编辑后的 B');
});
test('learning-day changes rebuild a clean default while retaining manual edits in current tasks',()=>{
  let s=chain();s=E.editTask(s,'task-1',{title:'人工安排'});s=E.updateSettings(s,{...s.settings,studyDays:[2,4,6]},day);
  assert.ok(s.tasks.some(t=>t.title==='人工安排'));assert.ok(!s.defaultWeek.tasks.some(t=>t.title==='人工安排'));
  assert.ok(s.tasks.filter(t=>!t.done&&!t.suspended&&!t.queued).every(t=>E.isStudyDay(s.settings,t.date)));
});
test('no learning days queues every unfinished task without deleting content',()=>{
  const s=chain(),next=E.updateSettings(s,{...s.settings,studyDays:[]},day);
  for(const t of s.tasks){const found=next.tasks.find(n=>n.id===t.id);assert.ok(found);assert.ok(found.queued);assert.equal(found.minutes,t.minutes);}
});
