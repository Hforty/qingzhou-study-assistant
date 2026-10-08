import { subjects, topics, activeSubjects, activeTopics } from './curriculum.mjs';
import { evaluatePlan, taskIdentity, monday } from './planner.mjs';
export { evaluatePlan, monday, draftStale } from './planner.mjs';
export const RECORD_KEY='qingzhou.study.v4', BACKUP_LIMIT=30*1024*1024;
export function createState(now=today()) {
  let examDate='2027-12-20';if(examDate<=now){examDate=`${now.slice(0,4)}-12-20`;if(examDate<=now)examDate=`${+now.slice(0,4)+1}-12-20`;}
  return {version:4,settings:{name:'同学',examDate,startDate:now,dailyHours:4,target:360,mathExam:'math2',englishExam:'english2',politicsMode:'light',politics:true,studyDays:[0,1,2,3,4,5,6]},progress:{},notes:{},weakPoints:{},tasks:[],sessions:[],weeks:{},acceptedIds:[],adjustments:[],completions:[],nextSequence:1,draft:null,onboardingCompleted:false,planNeedsReview:false,lastEvaluated:now,timer:null};
}
export const needsOnboarding=s=>!s.onboardingCompleted;
export const politicsMode=s=>s.politicsMode;
export const taskInCurriculum=(t,s)=>t.topicId?activeTopics(s).some(x=>x.id===t.topicId):activeSubjects(s).some(x=>x.id===t.subject);
export const isStudyDay=(s,date)=>s.studyDays.includes(new Date(`${date}T12:00:00`).getDay());
export function timeBudget(s){const full=Math.round(s.dailyHours*60),reserve=Math.min(30,Math.floor(full/8));return {full,reserve,normal:full-reserve,politics:Math.min(45,Math.floor((full-reserve)/20)*5)};}
export function countdown(s,now=today()){const days=dayDiff(now,s.examDate);return {days:Math.max(0,days),label:days>0?'距离目标初试日':days===0?'今天是目标初试日':'目标初试日期已过'};}
export const reconcileSettings=(s,settings,now=today())=>evaluatePlan(s,{today:now,command:{type:'settings',settings}}).state;
export function completeTask(s,id,now=today()){
 const t=s.tasks.find(t=>t.id===id);if(!t)return;
 if(t.done){s.completions=s.completions.filter(f=>f.identity!==taskIdentity(t)&&f.id!==t.id.replace('history:',''));}
 else s.completions.push({id:uid(),identity:taskIdentity(t),date:now,task:structuredClone(t)});
 Object.assign(s,evaluatePlan(s,{today:now}).state);
}
export const topicById = Object.fromEntries(topics.map(t => [t.id, t]));
export const subjectById = Object.fromEntries(subjects.map(s => [s.id, s]));
export const today = () => dateKey(new Date());
export function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function addDays(key, days) { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + days); return dateKey(d); }
export function dayDiff(a, b) { return Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000); }
export const uid = () => globalThis.crypto.randomUUID();
const trackForSubject = (subject, settings) => {
  const group = subjectById[subject]?.group;
  return group === 'math' ? settings.mathExam || 'math2' : group === 'english' ? settings.englishExam || 'english2' : undefined;
};
export function progressFor(state, list = activeTopics(state.settings)) {
  if (!list.length) return 0;
  return Math.round(100 * list.reduce((n, t) => n + [0, .25, .65, 1][state.progress[t.id]?.level || 0], 0) / list.length);
}
export function setLevel(state, id, level, now = today()) {
  if (!Object.hasOwn(topicById, id) || ![0, 1, 2, 3].includes(level)) return;
  const old = state.progress[id] || {};
  state.progress[id] = { ...old, level, updated: now, reviewStep: level < 2 ? 0 : old.reviewStep || 0, nextReview: level >= 2 ? old.nextReview || addDays(now, 1) : null };
}
export function dueTopics(state, now = today()) {
  return activeTopics(state.settings).filter(t => { const p = state.progress[t.id]; return p?.level >= 2 && p.nextReview && p.nextReview <= now; }).sort((a, b) => state.progress[a.id].nextReview.localeCompare(state.progress[b.id].nextReview));
}
export function reviewTopic(state, id, rating, now = today()) {
  if (!Object.hasOwn(topicById, id)) return;
  const p = state.progress[id];
  if (!p || p.level < 2) return;
  const steps = [1, 3, 7, 14, 30];
  p.reviewStep = rating === 'again' ? 0 : Math.min(4, (p.reviewStep || 0) + 1);
  p.nextReview = addDays(now, steps[p.reviewStep]);
  p.level = rating === 'again' ? 2 : p.reviewStep >= 3 ? 3 : p.level;
  p.updated = now;
  p.lastReviewed = now;
}
export function activityDates(state) { return new Set([...state.tasks.filter(t => t.done).map(t => t.completedAt || t.date), ...state.sessions.map(s => s.date)]); }
export function streak(state, now = today()) {
  const dates = activityDates(state);
  let cursor = dates.has(now) ? now : addDays(now, -1), n = 0;
  while (dates.has(cursor)) { n++; cursor = addDays(cursor, -1); }
  return n;
}
export function phases(state) {
  const { startDate, examDate } = state.settings;
  const total = Math.max(1, dayDiff(startDate, examDate));
  const a = addDays(startDate, Math.floor(total * .45));
  const b = addDays(startDate, Math.floor(total * .8));
  return [
    { name: '基础构建', en: 'BUILD THE FOUNDATION', start: startDate, end: a, text: '理解概念 · 建立框架 · 基础例题', detail: '数学按章节学习并独立推导；英语坚持词汇与长难句；408 先数据结构与计组，再衔接操作系统与网络。' },
    { name: '强化突破', en: 'CONNECT THE DOTS', start: a, end: b, text: '专题训练 · 交叉联系 · 错题复盘', detail: '按专题限时练习，串联数学综合题和 408 跨章节题；英语精读真题，政治形成框架；对薄弱点安排重复提取。' },
    { name: '真题冲刺', en: 'MAKE IT COUNT', start: b, end: examDate, text: '整卷模拟 · 查漏补缺 · 状态调整', detail: '按考试时间做整卷模拟，分析失分原因，回访高频错题；练习英语写作与政治材料题，给睡眠和机动复习留出时间。' }
  ];
}
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T12:00:00`).getTime()) && dateKey(new Date(`${value}T12:00:00`)) === value;
const shortText = (value, limit) => typeof value === 'string' && value.length <= limit;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const optionalDate = value => value === undefined || value === null || validDate(value);
export function validateTimer(t) {
  if (t === null) return null;
  if (!record(t) || !shortText(t.id, 100) || !t.id || !Object.hasOwn(subjectById, t.subject) ||
      ![1500, 3000, 5400].includes(t.duration) || !Number.isInteger(t.remaining) || t.remaining < 0 || t.remaining > t.duration ||
      typeof t.running !== 'boolean' || !Number.isFinite(t.until) || t.until < 0 || !Number.isFinite(new Date(t.until).getTime()) || !validTrack(t.subject, t.examTrack)) {
    throw new Error('计时记录格式不正确。');
  }
  return { id: t.id, subject: t.subject, duration: t.duration, remaining: t.remaining, until: t.until, running: t.running, ...(t.examTrack ? { examTrack: t.examTrack } : {}) };
}
const validTrack = (subject, track) => {
  if (track === undefined) return true;
  const group = subjectById[subject]?.group;
  return group === 'math' ? ['math1', 'math2'].includes(track) : group === 'english' ? ['english1', 'english2'].includes(track) : false;
};
function validateVersion(s, version) {
  if (!record(s) || s.version !== version || !record(s.settings) || !record(s.progress) || !record(s.notes) || !Array.isArray(s.tasks) || !Array.isArray(s.sessions) || (version === 2 && !record(s.weakPoints))) throw new Error('备份格式不正确，请选择轻舟导出的 JSON 文件。');
  const a = s.settings;
  if (!shortText(a.name, 40) || !validDate(a.examDate) || !validDate(a.startDate) || a.examDate < a.startDate || !Number.isFinite(a.dailyHours) || a.dailyHours < .5 || a.dailyHours > 16 || !Number.isFinite(a.target) || a.target < 1 || a.target > 500 || typeof a.politics !== 'boolean' || (version === 2 && (!['math1', 'math2'].includes(a.mathExam) || !['english1', 'english2'].includes(a.englishExam)))) throw new Error('备份中的计划设置不正确。');
  if (s.tasks.length > 50000 || s.sessions.length > 50000 || Object.keys(s.progress).length > 50000 || Object.keys(s.notes).length > 50000 || (version === 2 && Object.keys(s.weakPoints).length > 50000)) throw new Error('备份数据超出范围。');
  const ids = new Set();
  for (const t of s.tasks) {
    if (!record(t) || !shortText(t.id, 100) || !t.id || ids.has(t.id) || !shortText(t.title, 200) || !t.title.trim() || !validDate(t.date) || !Object.hasOwn(subjectById, t.subject) || !Number.isFinite(t.minutes) || t.minutes < 1 || t.minutes > 960 || typeof t.done !== 'boolean' || !['learn', 'review', 'practice'].includes(t.kind) || (t.topicId !== undefined && t.topicId !== null && (!Object.hasOwn(topicById, t.topicId) || topicById[t.topicId].subject !== t.subject)) || !optionalDate(t.completedAt) || (version === 2 && (!['auto', 'manual', 'legacy'].includes(t.origin) || (t.queued !== undefined && typeof t.queued !== 'boolean') || (t.inactive !== undefined && typeof t.inactive !== 'boolean') || !optionalDate(t.originalDate) || !optionalDate(t.replannedOn) || !validTrack(t.subject, t.examTrack)))) throw new Error('备份中的任务不正确。');
    ids.add(t.id);
  }
  for (const [id, p] of Object.entries(s.progress)) if (!Object.hasOwn(topicById, id) || !record(p) || ![0, 1, 2, 3].includes(p.level) || !optionalDate(p.nextReview) || !optionalDate(p.updated) || !optionalDate(p.lastReviewed) || (p.reviewStep !== undefined && (!Number.isInteger(p.reviewStep) || p.reviewStep < 0 || p.reviewStep > 4))) throw new Error('备份中的进度不正确。');
  for (const [id, note] of Object.entries(s.notes)) if (!Object.hasOwn(topicById, id) || !shortText(note, 20000)) throw new Error('备份中的笔记不正确。');
  if (version === 2) for (const [id, weak] of Object.entries(s.weakPoints)) if (!Object.hasOwn(topicById, id) || !record(weak) || !shortText(weak.reason, 1000) || !validDate(weak.markedAt)) throw new Error('备份中的薄弱点不正确。');
  for (const session of s.sessions) if (!record(session) || !validDate(session.date) || !Number.isFinite(session.minutes) || session.minutes <= 0 || session.minutes > 960 || !Object.hasOwn(subjectById, session.subject) || (version === 2 && !validTrack(session.subject, session.examTrack))) throw new Error('备份中的专注记录不正确。');
  // Running timers are never restored from a backup or from local storage.
  return { version, settings: { ...a }, progress: Object.fromEntries(Object.entries(s.progress).map(([id, p]) => [id, { ...p }])), tasks: s.tasks.map(t => ({ ...t })), sessions: s.sessions.map(session => ({ ...session })), notes: { ...s.notes }, ...(version === 2 ? { weakPoints: Object.fromEntries(Object.entries(s.weakPoints).map(([id, weak]) => [id, { ...weak }])) } : {}), timer: null };
}

export function validateState(s) {
 if(!record(s)||s.version!==4)throw new Error('1.0.5 仅支持新版 v4 备份；旧记录可导出留存。');
 const a=s.settings;
 if(!record(a)||!['math1','math2'].includes(a.mathExam)||!['english1','english2'].includes(a.englishExam)||!['off','light','full'].includes(a.politicsMode)||!Array.isArray(a.studyDays)||a.studyDays.length>7||new Set(a.studyDays).size!==a.studyDays.length||a.studyDays.some(d=>!Number.isInteger(d)||d<0||d>6))throw new Error('学习设置不正确。');
 const checkTasks=tasks=>validateVersion({...s,version:2,settings:{...a,politics:a.politicsMode!=='off'},tasks},2);
 checkTasks(s.tasks);
 const checkMetadata=tasks=>{for(const t of tasks)if(!/^[A-Za-z0-9:_-]+$/.test(t.id)||!Number.isInteger(t.sequence)||t.sequence<0||['queued','suspended','history'].some(k=>t[k]!==undefined&&typeof t[k]!=='boolean')||['planWeek','desiredDate','originalDate'].some(k=>t[k]!==undefined&&!validDate(t[k]))||t.queueReason!==undefined&&!shortText(t.queueReason,200)||t.restrictionReason!==undefined&&!shortText(t.restrictionReason,200))throw new Error('任务计划属性损坏。');};checkMetadata(s.tasks);
 if(!record(s.weeks)||!Array.isArray(s.adjustments)||!Array.isArray(s.completions)||!Array.isArray(s.acceptedIds)||typeof s.onboardingCompleted!=='boolean'||!Number.isInteger(s.nextSequence)||s.nextSequence<1||!validDate(s.lastEvaluated))throw new Error('周计划记录不正确。');
 if(Object.keys(s.weeks).length>10000||s.adjustments.length>50000||s.completions.length>50000)throw new Error('计划记录超出范围。');
 for(const [key,w]of Object.entries(s.weeks)){if(!record(w)||!validDate(key)||monday(key)!==key||w.start!==key||!validDate(w.created)||!Array.isArray(w.original))throw new Error('原版计划损坏。');checkTasks(w.original);checkMetadata(w.original);}
 const ids=new Set();for(const x of s.adjustments){if(!record(x)||!shortText(x.id,100)||!/^[A-Za-z0-9:_-]+$/.test(x.id)||ids.has(x.id)||!validDate(x.week)||!validDate(x.created)||typeof x.active!=='boolean'||!['add','edit','delete','single','course','pause','missed'].includes(x.type))throw new Error('计划调整损坏。');ids.add(x.id);
 if(x.type==='add'){checkTasks([x.task]);checkMetadata([x.task]);}
 if(['edit','delete','single'].includes(x.type)&&!shortText(x.taskId,100))throw new Error('任务关联损坏。');
 if(x.type==='edit'&&(!record(x.patch)||Object.keys(x.patch).some(k=>!['title','subject','topicId','kind','minutes','date','origin'].includes(k))))throw new Error('编辑内容损坏。');
 if(x.type==='pause'&&!topicById[x.topicId])throw new Error('暂停内容损坏。');
 if(x.type==='single'&&!validDate(x.to))throw new Error('顺延日期损坏。');
 if(x.type==='course'&&(!subjectById[x.subject]||!validDate(x.from)))throw new Error('课程顺延损坏。');
 if(x.type==='missed'&&(!shortText(x.sourceKey,150)||!validDate(x.from)||!subjectById[x.subject]||!Array.isArray(x.moves)||x.moves.some(m=>!record(m)||!shortText(m.id,100)||!validDate(m.date))))throw new Error('自动顺延损坏。');}
 const facts=new Set();for(const f of s.completions){if(facts.has(f.id)||facts.has(f.identity))throw new Error('完成记录重复。');facts.add(f.id);facts.add(f.identity);if(!record(f)||!shortText(f.id,100)||!validDate(f.date)||f.identity!==taskIdentity(f.task))throw new Error('完成记录损坏。');checkTasks([f.task]);}
 if(s.draft!==null){const d=s.draft;if(!record(d)||!validDate(d.week)||!validDate(d.created)||!Array.isArray(d.tasks)||!Array.isArray(d.adjustments)||!Array.isArray(d.intents)||!shortText(d.basedOn,25*1024*1024)||!Array.isArray(d.summary))throw new Error('计划草案损坏。');checkTasks(d.tasks);checkMetadata(d.tasks);validateState({...s,weeks:{...s.weeks,[d.week]:{start:d.week,created:d.created,original:[...new Map([...(s.weeks[d.week]?.original||[]),...d.tasks].map(t=>[t.id,t])).values()]}},draft:null,adjustments:d.adjustments});}
 if(s.restrictions!==undefined&&(!Array.isArray(s.restrictions)||s.restrictions.some(r=>!record(r)||!shortText(r.id,250)||!shortText(r.taskId,100)||!validDate(r.from)||r.to!==null&&!validDate(r.to)||!shortText(r.reason,200))))throw new Error('学习日限制记录损坏。');
 if(s.acceptedIds.length>50000||s.acceptedIds.some(id=>!shortText(id,100)))throw new Error('任务关联不正确。');
 const definitions=[...Object.values(s.weeks).flatMap(w=>w.original),...s.adjustments.filter(a=>a.type==='add').map(a=>a.task),...(s.draft?.tasks||[])];
 const known=new Set(definitions.map(t=>t.id));if(s.acceptedIds.some(id=>!known.has(id)))throw new Error('任务原始来源丢失。');
 for(const t of s.tasks){if(t.history){if(!s.completions.some(f=>t.id==='history:'+f.id))throw new Error('历史完成来源丢失。');}else if(!known.has(t.id)||!s.acceptedIds.includes(t.id))throw new Error('正式任务来源丢失。');if(t.done&&!s.completions.some(f=>f.identity===taskIdentity(t)||t.history&&t.id==='history:'+f.id))throw new Error('独立完成事实丢失。');}
 for(const a of [...s.adjustments,...(s.draft?.adjustments||[])])if(a.type==='edit'){const target=definitions.find(t=>t.id===a.taskId);if(!target)throw new Error('编辑任务来源不存在。');checkTasks([{...target,...a.patch}]);}
 if(s.draft?.intents.some(i=>!record(i)||!['add','edit','delete','single','course','pause','cancel-adjustment'].includes(i.type)))throw new Error('草案编辑意图损坏。');
 return structuredClone({...s,timer:null});
}
export const migrateState=validateState;
export function commitRecords(storage,candidate){
 const next=validateState(candidate),serialized=JSON.stringify(next);if(new TextEncoder().encode(serialized).length>BACKUP_LIMIT)throw new Error('记录超过 30 MiB，请精简后再保存。');const previous=storage.getItem(RECORD_KEY);
 try{storage.setItem(RECORD_KEY,serialized);const read=storage.getItem(RECORD_KEY);if(read!==serialized)throw new Error('回读验证失败。');validateState(JSON.parse(read));return validateState(JSON.parse(read));}catch(e){try{if(previous===null)storage.removeItem(RECORD_KEY);else storage.setItem(RECORD_KEY,previous);}catch{}throw e;}
}
export function loadRecords(storage,now=today()){
 const raw=storage.getItem(RECORD_KEY);if(raw!==null)return {state:validateState(JSON.parse(raw)),migrated:false};
 return {state:createState(now),migrated:false};
}
