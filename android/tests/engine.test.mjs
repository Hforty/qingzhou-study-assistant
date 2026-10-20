import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, createState, validateState, save, load, generateWeek, replan, monday, autoExamDate, refreshAutoExamDate,
  toggleTask, editTask, delayOne, delayCourse, pauseTopic, resumeTopic, restoreDefault,
  processMissed, updateSettings, setLevel, startTimer, pauseTimer, resumeTimer, finishTimer,
  syncTimer, addManualTask, deleteManualTask, weekStats, progressPercent
} from '../web/lib/qz/engine.js';

const NOW = '2026-10-07';
const memory = () => { const map = new Map(); return { getItem:k=>map.has(k)?map.get(k):null, setItem:(k,v)=>map.set(k,v), removeItem:k=>map.delete(k), map }; };
const planned = (settings = {}) => generateWeek(Object.assign(createState(NOW), { settings: { ...createState(NOW).settings, ...settings, examDate: '2027-12-20' } }), NOW);

test('new record validates and transaction round-trips', () => {
  const storage = memory(), state = createState(NOW);
  assert.equal(load(storage, NOW).schemaVersion, 2);
  assert.deepEqual(save(storage, state), state);
  assert.equal(JSON.stringify(state), storage.getItem(STORAGE_KEY));
});

test('failed write restores previous bytes', () => {
  const base = memory(), state = createState(NOW); save(base, state);
  const previous = base.getItem(STORAGE_KEY), broken = { ...base, setItem(k,v){ base.map.set(k,v); throw new Error('disk full'); } };
  assert.throws(() => save(broken, { ...state, nextId: 2 }), /disk full/);
  assert.equal(base.getItem(STORAGE_KEY), previous);
});

test('four exam combinations generate correct track snapshots without duplicate topics', () => {
  for (const mathExam of ['math1','math2']) for (const englishExam of ['english1','english2']) {
    const state = planned({ mathExam, englishExam });
    const math = state.tasks.filter(t => ['math','linear','probability'].includes(t.subject));
    const english = state.tasks.filter(t => t.subject === 'english');
    assert.ok(math.length && english.length);
    assert.ok(math.every(t => t.examTrack === mathExam));
    assert.ok(english.every(t => t.examTrack === englishExam));
    const ids = state.tasks.map(t => t.topicId).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('politics modes obey off, light and full allocation', () => {
  const off = planned({ politicsMode:'off' }), light = planned({ politicsMode:'light' }), full = planned({ politicsMode:'full' });
  assert.equal(off.tasks.filter(t=>t.subject==='politics').length, 0);
  assert.ok(light.tasks.filter(t=>t.subject==='politics').length <= 3);
  assert.ok(light.tasks.filter(t=>t.subject==='politics').every(t=>t.minutes===20));
  assert.ok(full.tasks.filter(t=>t.subject==='politics').some(t=>t.minutes>20));
});

test('midweek generation starts today and stays within daily budget', () => {
  const state = planned();
  assert.ok(state.tasks.every(t => t.date >= NOW));
  for (const date of new Set(state.tasks.map(t=>t.date))) assert.ok(state.tasks.filter(t=>t.date===date).reduce((n,t)=>n+t.minutes,0) <= 240);
  assert.equal(state.defaultWeek.week, monday(NOW));
});

test('direct edit and replan keep manual changes and avoid duplicate topics', () => {
  let state = planned(), task = state.tasks[0];
  state = editTask(state, task.id, { title:'我的重点', minutes:35 });
  state = replan(state, NOW);
  assert.equal(state.tasks.find(t=>t.id===task.id).title, '我的重点');
  assert.equal(state.tasks.find(t=>t.id===task.id).minutes, 35);
  const ids=state.tasks.map(t=>t.topicId).filter(Boolean);assert.equal(new Set(ids).size,ids.length);
});

test('single and course delays move tasks forward without shortening', () => {
  let state=planned(), first=state.tasks.find(t=>t.subject==='math'), minutes=first.minutes, original=first.date;
  state=delayOne(state,first.id);assert.ok(state.tasks.find(t=>t.id===first.id).date>original);assert.equal(state.tasks.find(t=>t.id===first.id).minutes,minutes);
  const source=state.tasks.find(t=>t.subject==='english'&&!t.done), dates=state.tasks.filter(t=>t.subject==='english').map(t=>t.date);
  state=delayCourse(state,source.id);assert.ok(state.tasks.filter(t=>t.subject==='english').some((t,i)=>t.date>dates[i]));
});

test('pause, resume and restore default preserve completion facts', () => {
  let state=planned(), task=state.tasks[0];
  state=pauseTopic(state,task.id,NOW);assert.ok(state.pausedTopics.some(p=>p.topicId===task.topicId));
  state=resumeTopic(state,task.topicId);assert.ok(!state.pausedTopics.some(p=>p.topicId===task.topicId));
  state=toggleTask(state,task.id,NOW);assert.equal(state.completions.length,1);
  state=editTask(state,state.tasks.find(t=>!t.done).id,{title:'临时修改'});
  state=restoreDefault(state,NOW);assert.equal(state.completions.length,1);assert.ok(state.tasks.some(t=>t.done));
});

test('missed work moves forward once and remains idempotent', () => {
  let state=planned(), task=state.tasks[0]; task.date='2026-10-05'; const before=task.minutes;
  state=processMissed(state,NOW);const moved=state.tasks.find(t=>t.id===task.id),date=moved.date;
  assert.ok(date>=NOW);assert.equal(moved.minutes,before);
  state=processMissed(state,NOW);assert.equal(state.tasks.find(t=>t.id===task.id).date,date);
});

test('learning-day change removes unfinished tasks from closed days', () => {
  let state=planned(), settings={...state.settings,studyDays:[1,3,5]};state=updateSettings(state,settings,NOW);
  assert.ok(state.tasks.filter(t=>!t.done&&!t.queued).every(t=>settings.studyDays.includes(new Date(`${t.date}T12:00:00`).getDay())));
});

test('exam switch removes inactive unfinished content and keeps completion history', () => {
  let state=planned({mathExam:'math1'}), unique=state.tasks.find(t=>t.subject==='probability'||t.subject==='math1extra');
  if (!unique) { state=generateWeek(state,'2026-10-12'); unique=state.tasks.find(t=>t.subject==='probability'||t.subject==='math1extra'); }
  const completed=state.tasks.find(t=>t.subject==='math');state=toggleTask(state,completed.id,NOW);
  state=updateSettings(state,{...state.settings,mathExam:'math2'},NOW);
  assert.ok(!state.tasks.some(t=>!t.done&&(t.subject==='probability'||t.subject==='math1extra')));
  assert.equal(state.completions.length,1);
  assert.ok(state.tasks.filter(t=>!t.done&&['math','linear'].includes(t.subject)).every(t=>t.examTrack==='math2'));
});

test('manual task can be added and deleted', () => {
  let state=planned();state=addManualTask(state,{subject:'english',title:'自定义精读',date:NOW,minutes:25,kind:'practice'});const task=state.tasks.find(t=>t.title==='自定义精读');assert.ok(task);state=deleteManualTask(state,task.id);assert.ok(!state.tasks.some(t=>t.id===task.id));
});

test('timer pause excludes paused time and cross-day result keeps start date', () => {
  let state=createState(NOW), start=Date.parse('2026-10-07T23:59:50+08:00');
  state=startTimer(state,'english',1500,start);state=pauseTimer(state,start+10000);assert.equal(state.timer.remaining,1490);
  state=resumeTimer(state,start+70000);state=finishTimer(state,start+80000);assert.equal(state.sessions[0].seconds,20);assert.equal(state.sessions[0].date,NOW);
});

test('timer auto completion records once', () => {
  let state=createState(NOW), start=100000;state=startTimer(state,'math',1500,start);state=syncTimer(state,start+1500000);assert.equal(state.sessions.length,1);assert.equal(state.timer,null);state=syncTimer(state,start+1600000);assert.equal(state.sessions.length,1);
});

test('mastery and task completion remain independent', () => {
  let state=planned(), task=state.tasks[0];state=toggleTask(state,task.id,NOW);assert.equal(progressPercent(state),0);state=setLevel(state,task.topicId,3,NOW);assert.ok(progressPercent(state)>0);assert.ok(weekStats(state,monday(NOW)).done>0);
});

test('invalid state never validates', () => { const state=createState(NOW);state.settings.studyDays=[1,1];assert.throws(()=>validateState(state),/学习设置/); });

test('automatic exam date starts in 2027 and rolls over after December 20', () => {
  assert.equal(autoExamDate('2026-01-01'),'2027-12-20');
  assert.equal(autoExamDate('2027-12-20'),'2027-12-20');
  assert.equal(autoExamDate('2027-12-21'),'2028-12-20');
  assert.equal(autoExamDate('2028-01-01'),'2028-12-20');
  assert.equal(autoExamDate('2028-12-21'),'2029-12-20');
});

test('manual exam date is preserved and auto mode can be restored', () => {
  let state=createState('2027-01-01');state.settings.examDate='2030-11-30';state.settings.examDateMode='manual';
  assert.equal(refreshAutoExamDate(state,'2028-12-21').settings.examDate,'2030-11-30');
  state.settings.examDateMode='auto';assert.equal(refreshAutoExamDate(state,'2028-12-21').settings.examDate,'2029-12-20');
});

test('legacy local default is recognized as auto while a custom date stays manual', () => {
  let legacy=createState('2026-10-07');delete legacy.settings.examDateMode;legacy.settings.examDate='2026-12-20';legacy.lastProcessedDate='2026-10-07';
  legacy=refreshAutoExamDate(legacy,'2026-10-10');assert.equal(legacy.settings.examDateMode,'auto');assert.equal(legacy.settings.examDate,'2027-12-20');
  let custom=createState('2026-10-07');delete custom.settings.examDateMode;custom.settings.examDate='2029-11-18';custom.lastProcessedDate='2026-10-07';
  custom=refreshAutoExamDate(custom,'2028-01-01');assert.equal(custom.settings.examDateMode,'manual');assert.equal(custom.settings.examDate,'2029-11-18');
});
