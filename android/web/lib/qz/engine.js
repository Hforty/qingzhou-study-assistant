import { activeSubjects, activeTopics, subjects, topics } from './curriculum.js';

export const STORAGE_KEY = 'qingzhou.android.v1';
export const LEVELS = ['未学', '初学', '熟悉', '掌握'];
const DAY = 86400000;
const copy = value => JSON.parse(JSON.stringify(value));
const pad = n => String(n).padStart(2, '0');
const utf8Length = text => { let size = 0; for (let i = 0; i < text.length; i++) { const code = text.charCodeAt(i); if (code < 128) size++; else if (code < 2048) size += 2; else if (code >= 0xd800 && code <= 0xdbff) { size += 4; i++; } else size += 3; } return size; };

export function dateKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function addDays(key, amount) { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + amount); return dateKey(d); }
export function monday(key) { const d = new Date(`${key}T12:00:00`); return addDays(key, -((d.getDay() + 6) % 7)); }
export function weekEnd(key) { return addDays(monday(key), 6); }
export function dayDiff(a, b) { return Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / DAY); }
export function autoExamDate(now = dateKey()) {
  const year = Math.max(2027, Number(now.slice(0, 4)));
  const candidate = `${year}-12-20`;
  return now <= candidate ? candidate : `${year + 1}-12-20`;
}
function legacyAutoExamDate(now) {
  const current = `${now.slice(0, 4)}-12-20`;
  return now < current ? current : `${Number(now.slice(0, 4)) + 1}-12-20`;
}
export const topicById = Object.fromEntries(topics.map(item => [item.id, item]));
export const subjectById = Object.fromEntries(subjects.map(item => [item.id, item]));
export const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createState(now = dateKey()) {
  return {
    schemaVersion: 2,
    settings: { name: '同学', examDate: autoExamDate(now), examDateMode: 'auto', dailyHours: 4, mathExam: 'math2', englishExam: 'english2', politicsMode: 'light', studyDays: [0, 1, 2, 3, 4, 5, 6] },
    tasks: [], completions: [], sessions: [], progress: {}, pausedTopics: [], defaultWeek: null,
    timer: null, onboardingCompleted: false, lastProcessedDate: now, nextId: 1,
    weakPoints: {}, weeklyPlans: {}, weekReports:{}, adjustments: [], lastUndo: null,
    todos: [], reminders: [], taskReminders: {}, lastFocusResult: null
  };
}

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(value) === value;
const validTask = task => task && typeof task.id === 'string' && typeof task.title === 'string' && task.title.trim() &&
  validDate(task.date) && subjectById[task.subject] && Number.isInteger(task.minutes) && task.minutes >= 1 && task.minutes <= 960 &&
  ['learn', 'review', 'practice'].includes(task.kind) && ['auto', 'manual'].includes(task.origin) && typeof task.done === 'boolean' &&
  (!task.topicId || topicById[task.topicId]?.subject === task.subject);

export function validateState(state) {
  if (!state || ![1,2].includes(state.schemaVersion)) throw new Error('学习记录格式不正确。');
  state=copy(state);
  state.schemaVersion=2;
  state.weakPoints??={};state.weeklyPlans??={};state.weekReports??={};state.adjustments??=[];state.lastUndo??=null;
  state.todos??=[];state.reminders??=[];state.taskReminders??={};state.lastFocusResult??=null;
  const time=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if(!Array.isArray(state.todos)||state.todos.some(t=>!t||typeof t.id!=='string'||!t.id||typeof t.title!=='string'||!t.title.trim()||t.title.length>200||typeof t.done!=='boolean'||t.date!=null&&!validDate(t.date)||t.remindTime!=null&&(!t.date||!time(t.remindTime))||t.completedDate!==undefined&&!validDate(t.completedDate))||new Set(state.todos.map(t=>t.id)).size!==state.todos.length)throw new Error('待办事项损坏。');
  if(!Array.isArray(state.reminders)||state.reminders.some(r=>!r||typeof r.id!=='string'||!r.id||typeof r.title!=='string'||!r.title.trim()||r.title.length>100||!time(r.time)||typeof r.enabled!=='boolean'||typeof r.followStudyDays!=='boolean'||!Array.isArray(r.days)||new Set(r.days).size!==r.days.length||r.days.some(d=>!Number.isInteger(d)||d<0||d>6)||!r.followStudyDays&&!r.days.length)||new Set(state.reminders.map(r=>r.id)).size!==state.reminders.length)throw new Error('学习提醒损坏。');
  if(!state.taskReminders||typeof state.taskReminders!=='object'||Array.isArray(state.taskReminders)||Object.entries(state.taskReminders).some(([id,value])=>!id||!time(value)))throw new Error('任务提醒损坏。');
  const result=state.lastFocusResult;
  if(result&&(typeof result.id!=='string'||!validDate(result.date)||!subjectById[result.subject]||!Number.isInteger(result.seconds)||result.seconds<0||!['focus','stopwatch','break'].includes(result.mode)||!Number.isFinite(result.endedAt)))throw new Error('专注结束记录损坏。');
  if(state.defaultWeek&&!state.weeklyPlans[state.defaultWeek.week])state.weeklyPlans[state.defaultWeek.week]=copy(state.defaultWeek);
  const s = state.settings;
  if (!s || !['math1', 'math2'].includes(s.mathExam) || !['english1', 'english2'].includes(s.englishExam) ||
      !['off', 'light', 'full'].includes(s.politicsMode) || !validDate(s.examDate) || (s.examDateMode !== undefined && !['auto','manual'].includes(s.examDateMode)) || !Number.isFinite(s.dailyHours) ||
      s.dailyHours < .5 || s.dailyHours > 16 || !Array.isArray(s.studyDays) || new Set(s.studyDays).size !== s.studyDays.length ||
      s.studyDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('学习设置不正确。');
  if (!Array.isArray(state.tasks) || state.tasks.some(task => !validTask(task)) || new Set(state.tasks.map(t => t.id)).size !== state.tasks.length) throw new Error('计划任务损坏。');
  if (!Array.isArray(state.completions) || state.completions.some(item => !item || typeof item.id !== 'string' || !validDate(item.date) || typeof item.title !== 'string' || !subjectById[item.subject])) throw new Error('完成记录损坏。');
  if (!Array.isArray(state.sessions) || state.sessions.some(item => !item || typeof item.id !== 'string' || !validDate(item.date) || !subjectById[item.subject] || !Number.isInteger(item.seconds) || item.seconds < 1)) throw new Error('专注记录损坏。');
  if (!state.progress || Object.entries(state.progress).some(([id, item]) => !topicById[id] || !item || ![0, 1, 2, 3].includes(item.level) || !validDate(item.updated))) throw new Error('掌握进度损坏。');
  if (!Array.isArray(state.pausedTopics) || state.pausedTopics.some(item => !topicById[item.topicId] || !validDate(item.week))) throw new Error('暂停规则损坏。');
  if (state.defaultWeek && (!validDate(state.defaultWeek.week) || !Array.isArray(state.defaultWeek.tasks) || state.defaultWeek.tasks.some(task => !validTask(task)))) throw new Error('默认计划损坏。');
  if (state.timer && (typeof state.timer.id!=='string'||!state.timer.id||!validDate(state.timer.date)||!Number.isFinite(state.timer.until)||state.timer.until<0||!subjectById[state.timer.subject] || !validTimerDuration(state.timer.mode||'focus',state.timer.duration) || !Number.isInteger(state.timer.remaining) || state.timer.remaining < 0 || state.timer.remaining > state.timer.duration || typeof state.timer.running !== 'boolean'||state.timer.taskId!==undefined&&typeof state.timer.taskId!=='string'||state.timer.taskTitle!==undefined&&typeof state.timer.taskTitle!=='string')) throw new Error('番茄钟记录损坏。');
  if(new Set(state.sessions.map(s=>s.id)).size!==state.sessions.length)throw new Error('专注记录存在重复。');
  if(typeof state.weakPoints!=='object'||Array.isArray(state.weakPoints)||Object.entries(state.weakPoints).some(([id,w])=>!topicById[id]||!w||typeof w.reason!=='string'||w.reason.length>500||!validDate(w.dueDate)||!['open','awaiting','resolved'].includes(w.status)||!Number.isInteger(w.cycle)||w.cycle<1))throw new Error('查漏记录损坏。');
  if(typeof state.weeklyPlans!=='object'||Array.isArray(state.weeklyPlans)||Object.entries(state.weeklyPlans).some(([key,w])=>!validDate(key)||w.week!==key||!Array.isArray(w.tasks)||w.tasks.some(t=>!validTask(t))))throw new Error('周原版记录损坏。');
  if(typeof state.weekReports!=='object'||Array.isArray(state.weekReports)||Object.entries(state.weekReports).some(([key,w])=>!validDate(key)||!w||!Array.isArray(w.planned)||w.planned.some(t=>!validTask(t))||!Number.isInteger(w.queued)||!Number.isInteger(w.paused)))throw new Error('周总结记录损坏。');
  if(!Array.isArray(state.adjustments)||state.adjustments.some(a=>!a||typeof a.id!=='string'||!validDate(a.date)||typeof a.label!=='string'||!Array.isArray(a.changes)))throw new Error('计划调整记录损坏。');
  if(state.lastUndo&&(!Array.isArray(state.lastUndo.tasks)||!Array.isArray(state.lastUndo.rules)||typeof state.lastUndo.label!=='string'))throw new Error('撤销记录损坏。');
  if(state.sessions.some(s=>s.source!==undefined&&!['timer','manual'].includes(s.source)))throw new Error('专注来源损坏。');
  if(state.sessions.some(s=>s.mode!==undefined&&!['focus','stopwatch'].includes(s.mode)||s.taskId!==undefined&&typeof s.taskId!=='string'||s.taskTitle!==undefined&&typeof s.taskTitle!=='string'))throw new Error('专注任务关联损坏。');
  if (!validDate(state.lastProcessedDate) || !Number.isInteger(state.nextId) || state.nextId < 1) throw new Error('记录元数据损坏。');
  return copy(state);
}

export function load(storage, now = dateKey()) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return createState(now);
  return validateState(JSON.parse(raw));
}
export function refreshAutoExamDate(state, now = dateKey()) {
  const next = copy(state);
  if (!next.settings.examDateMode) {
    const reference = validDate(next.lastProcessedDate) ? next.lastProcessedDate : now;
    next.settings.examDateMode = next.settings.examDate === legacyAutoExamDate(reference) ? 'auto' : 'manual';
  }
  if (next.settings.examDateMode === 'auto') next.settings.examDate = autoExamDate(now);
  return validateState(next);
}
export function save(storage, candidate) {
  const next = validateState(candidate);
  const serialized = JSON.stringify(next);
  if (utf8Length(serialized) > 30 * 1024 * 1024) throw new Error('学习记录超过 30 MiB，请先导出备份。');
  const previous = storage.getItem(STORAGE_KEY);
  try {
    storage.setItem(STORAGE_KEY, serialized);
    const read = storage.getItem(STORAGE_KEY);
    if (read !== serialized) throw new Error('保存回读验证失败。');
    return validateState(JSON.parse(read));
  } catch (error) {
    try { previous === null ? storage.removeItem(STORAGE_KEY) : storage.setItem(STORAGE_KEY, previous); } catch {}
    throw error;
  }
}

export const isStudyDay = (settings, key) => settings.studyDays.includes(new Date(`${key}T12:00:00`).getDay());
export function nextStudyDay(settings, key) {
  if (!settings.studyDays.length) return null;
  for (let i = 0; i < 3700 && key <= settings.examDate; i++, key = addDays(key, 1)) if (isStudyDay(settings, key)) return key;
  return null;
}
export const subjectName = (id, settings, track) => {
  if (id === 'english') return (track || settings.englishExam) === 'english1' ? '英语一 · 公共基础' : '英语二';
  const base = subjectById[id]?.name || '未知课程';
  if (subjectById[id]?.group === 'math') return `${base} · ${(track || settings.mathExam) === 'math1' ? '数学一' : '数学二'}`;
  return base;
};
export const trackFor = (subject, settings) => subject === 'english' ? settings.englishExam : subjectById[subject]?.group === 'math' ? settings.mathExam : undefined;
const order = new Map(topics.map((item, index) => [item.id, index]));
const taskSort = (a, b) => a.date.localeCompare(b.date) || (order.get(a.topicId) ?? 99999) - (order.get(b.topicId) ?? 99999) || a.id.localeCompare(b.id);
const pausedSet = state => new Set(state.pausedTopics.map(item => item.topicId));
const dailyLimit = state => Math.round(state.settings.dailyHours * 60);
const dayUsed = (state, date, skipId) => state.tasks.filter(t => t.id !== skipId && !t.suspended && !t.queued && t.date === date).reduce((sum, t) => sum + t.minutes, 0);
const normalLimit = state => dailyLimit(state) - Math.min(30, Math.floor(dailyLimit(state) / 8));
function politicsFits(state, task, date) {
  if (task.origin !== 'auto' || task.subject !== 'politics') return true;
  if (state.settings.politicsMode === 'off') return false;
  const others=state.tasks.filter(t=>t.id!==task.id && t.origin==='auto' && t.subject==='politics' && !t.queued && !t.suspended);
  if(state.settings.politicsMode==='light')return task.minutes<=20 && !others.some(t=>t.date===date) && others.filter(t=>monday(t.date)===monday(date)).length<3;
  const limit=Math.min(45,Math.floor(normalLimit(state)/20)*5);
  if(limit<10){
    if(limit===0||task.minutes>10||others.some(t=>t.date===date))return false;
    const week=monday(date),first=state.weeklyPlans?.[week]?.start||state.defaultWeek?.week===week&&state.defaultWeek.start||[week,state.lastProcessedDate].sort().at(-1);
    let budget=0;for(let day=first;day<=date;day=addDays(day,1))if(isStudyDay(state.settings,day))budget+=limit;
    return others.filter(t=>t.date>=week&&t.date<=date).reduce((n,t)=>n+t.minutes,0)+task.minutes<=budget;
  }
  return others.filter(t=>t.date===date).reduce((sum,t)=>sum+t.minutes,0)+task.minutes<=limit;
}

function place(state, task, wanted) {
  task.queued = false; delete task.queueReason;
  if (task.topicId && pausedSet(state).has(task.topicId) && task.origin === 'auto') { task.suspended = true; return; }
  task.suspended = false;
  const weak=state.weakPoints?.[task.topicId];
  if(task.reviewKey&&weak&&(weak.status==='resolved'||task.reviewKey!==`${task.topicId}:${weak.cycle}`)){task.suspended=true;task.queueReason='本轮回顾已经结束';return;}
  if (task.subject === 'politics' && task.origin === 'auto' && state.settings.politicsMode === 'off') { task.queued=true;task.queueReason='政治当前未加入自动计划';return; }
  if (task.minutes > dailyLimit(state)) { task.queued = true; task.queueReason = '任务时长超过每日预算'; return; }
  let date = nextStudyDay(state.settings, wanted);
  while (date && (dayUsed(state, date, task.id) + task.minutes > dailyLimit(state) || !politicsFits(state,task,date))) date = nextStudyDay(state.settings, addDays(date, 1));
  if (!date) { task.queued = true; task.queueReason = state.settings.studyDays.length ? '考试日前没有可容纳的日期' : '没有可学习日'; return; }
  task.date = date;
}

function makeTask(state, topic, date, minutes = topic.minutes || 60) {
  return { id: `task-${state.nextId++}`, topicId: topic.id, subject: topic.subject, title: topic.title, date, minutes, kind: 'learn', origin: 'auto', done: false, examTrack: trackFor(topic.subject, state.settings), manualEdited: false, manualMoved: false, createdWeek:monday(date) };
}

export function processMissed(state, now = dateKey()) {
  const next = copy(state);
  const overdue = next.tasks.filter(t => !t.done && !t.suspended && !t.queued && t.date < now).sort(taskSort);
  for (const task of overdue) {
    if (task.date >= now) continue;
    const oldDate = task.date;
    const chain = next.tasks.filter(t => !t.done && !t.suspended && !t.queued && t.subject === task.subject && t.date >= oldDate).sort(taskSort);
    for(const item of chain)item.queued=true;
    let cursor = nextStudyDay(next.settings, now);
    for (const item of chain) {
      if (!cursor) { item.queued = true; item.queueReason = '考试日前没有可容纳的日期'; continue; }
      place(next, item, cursor);
      if (!item.queued) cursor = nextStudyDay(next.settings, addDays(item.date, 1));
    }
  }
  next.lastProcessedDate = now;
  return next;
}

function politicsAllowance(state, week, date) {
  if (state.settings.politicsMode === 'off') return 0;
  if (state.settings.politicsMode === 'light') {
    const used = state.tasks.filter(t => t.subject === 'politics' && t.origin === 'auto' && !t.queued && !t.suspended && t.date >= week && t.date <= weekEnd(week)).length;
    return used < 3 ? 20 : 0;
  }
  return Math.min(45, Math.floor(normalLimit(state) / 20) * 5);
}

export function generateWeek(state, now = dateKey(), regenerate = false, replaceDefault = false) {
  let next = processMissed(validateState(state), now);
  const week = monday(now), end = weekEnd(now), start = now > week ? now : week;
  if (regenerate) {
    const movable = next.tasks.filter(t => !t.done && !t.suspended && t.date >= start && t.date <= end && !t.manualEdited && !t.manualMoved).sort((a,b)=>Number(b.kind==='review')-Number(a.kind==='review')||(order.get(a.topicId)??99999)-(order.get(b.topicId)??99999));
    for(const task of movable)task.queued=true;
    const cursor=new Map();
    for (const task of movable) { place(next,task,cursor.get(task.subject)||start);if(!task.queued)cursor.set(task.subject,task.date); }
  }
  const knownTopics = new Set([...next.tasks, ...next.completions].filter(t=>t.kind!=='review').map(item => item.topicId).filter(Boolean));
  const paused=pausedSet(next);
  const queues = new Map(activeSubjects(next.settings).map(subject => [subject.id, subject.chapters.flatMap(chapter => chapter.topics).filter(topic => !knownTopics.has(topic.id)&&!paused.has(topic.id))]));
  let politicsCarry=0;
  for (let date = start; date <= end && date <= next.settings.examDate; date = addDays(date, 1)) {
    if (!isStudyDay(next.settings, date)) continue;
    const pTopic = queues.get('politics')?.[0];let allowance = politicsAllowance(next, week, date);
    if(next.settings.politicsMode==='full'&&allowance<10){politicsCarry+=allowance;allowance=politicsCarry>=10?10:0;}
    const subjectLimit = normalLimit(next) - (pTopic && next.settings.politicsMode==='full' ? allowance : 0);
    const subjectList = activeSubjects(next.settings).filter(subject => subject.id !== 'politics');
    const allocated=subject=>next.tasks.filter(t=>t.subject===subject.id&&!t.suspended&&!t.queued&&t.date>=week&&t.date<=end).reduce((sum,t)=>sum+t.minutes,0);
    subjectList.sort((a,b)=>allocated(a)-allocated(b));
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const subject of subjectList) {
        const topic = queues.get(subject.id)?.[0]; if (!topic) continue;
        const task = makeTask(next, topic, date);
        if (dayUsed(next, date) + task.minutes > subjectLimit) continue;
        queues.get(subject.id).shift(); next.tasks.push(task); knownTopics.add(topic.id); progressed = true;
      }
    }
    if (pTopic && allowance >= 10 && dayUsed(next, date) + allowance <= (next.settings.politicsMode==='full'?normalLimit(next):dailyLimit(next)) && politicsFits(next,{id:'new',origin:'auto',subject:'politics',minutes:allowance},date)) {
      queues.get('politics').shift(); next.tasks.push(makeTask(next, pTopic, date, allowance)); knownTopics.add(pTopic.id);
      politicsCarry=Math.max(0,politicsCarry-allowance);
    }
  }
  for(const subject of activeSubjects(next.settings)){
    if(subject.id==='politics'&&next.settings.politicsMode==='off')continue;
    const topic=queues.get(subject.id)?.[0];if(!topic)continue;
    const minutes=subject.id==='politics'?(next.settings.politicsMode==='light'?20:Math.max(10,Math.min(45,Math.floor(normalLimit(next)/20)*5))):topic.minutes;
    let reason=!next.settings.studyDays.length?'没有可学习日':start>next.settings.examDate?'目标初试日前没有可安排日期':minutes>dailyLimit(next)?'任务时长超过每日预算':'';
    if(!reason||next.tasks.some(t=>!t.done&&t.origin==='auto'&&t.subject===subject.id&&t.queued&&!t.suspended))continue;
    const task=makeTask(next,topic,start,minutes);task.queued=true;task.queueReason=reason;next.tasks.push(task);
  }
  next.tasks.sort(taskSort);
  if (!next.defaultWeek || next.defaultWeek.week !== week || replaceDefault) {
    const prior = new Map((state.defaultWeek?.week === week ? state.defaultWeek.tasks : []).map(t => [t.id, t]));
    next.defaultWeek = { week,start:state.defaultWeek?.week===week?(state.defaultWeek.start||start):start, tasks: next.tasks.filter(t => !t.done && t.origin === 'auto' && t.date >= week && t.date <= end).map(t => ({ ...copy(prior.get(t.id) || t), date: t.date, done: false, suspended: false, queued: !!t.queued, queueReason: t.queueReason, manualEdited: false, manualMoved: false })) };
    next.weeklyPlans[week]=copy(next.defaultWeek);
  }
  next.onboardingCompleted = true;
  return validateState(next);
}

export function replan(state, now = dateKey()) { return generateWeek(state, now, true); }
export function toggleTask(state, id, now = dateKey()) {
  const next = copy(state), task = next.tasks.find(item => item.id === id); if (!task) return next;
  task.done = !task.done; task.completedAt = task.done ? now : null;
  if (task.done) next.completions.push({ id: uid('done'), taskId: task.id, topicId: task.topicId, subject: task.subject, title: task.title, date: now, minutes: task.minutes, kind:task.kind, reviewKey:task.reviewKey, examTrack: task.examTrack });
  else next.completions = next.completions.filter(item => item.taskId !== task.id);
  if(task.reviewKey&&next.weakPoints?.[task.topicId]){const w=next.weakPoints[task.topicId];if(task.reviewKey===`${task.topicId}:${w.cycle}`&&w.status!=='resolved')w.status=task.done?'awaiting':'open';}
  return validateState(next);
}
export function editTask(state, id, patch) {
  const next = copy(state), task = next.tasks.find(item => item.id === id); if (!task || task.done) throw new Error('该任务不能编辑。');
  if (patch.title !== undefined) task.title = String(patch.title).trim();
  if (patch.minutes !== undefined) task.minutes = Math.max(1, Math.min(960, Math.round(Number(patch.minutes))));
  if (patch.date !== undefined) { if (!validDate(patch.date)) throw new Error('日期不正确。'); task.date = patch.date; task.manualMoved = true; }
  task.manualEdited = true; place(next, task, task.date); return validateState(next);
}
export function addManualTask(state, fields) {
  const next = copy(state), subject = fields.subject, topic = fields.topicId ? topicById[fields.topicId] : null;
  if (!subjectById[subject] || (topic && topic.subject !== subject)) throw new Error('课程选择不正确。');
  const task = { id: `task-${next.nextId++}`, topicId: topic?.id, subject, title: String(fields.title || topic?.title || '').trim(), date: fields.date, minutes: Math.round(Number(fields.minutes)), kind: fields.kind || 'learn', origin: 'manual', done: false, examTrack: trackFor(subject, next.settings), manualEdited: true, manualMoved: true,createdWeek:monday(fields.date) };
  if (!validTask(task)) throw new Error('任务内容不完整。'); place(next, task, task.date); next.tasks.push(task); next.tasks.sort(taskSort); return validateState(next);
}
export function deleteManualTask(state, id) { const next = copy(state), task = next.tasks.find(t => t.id === id); if (!task || task.origin !== 'manual' || task.done) throw new Error('只能删除未完成的自加任务。'); next.tasks = next.tasks.filter(t => t.id !== id); return validateState(next); }
export function delayOne(state, id) { const next = copy(state), task = next.tasks.find(t => t.id === id); if (!task || task.done) throw new Error('该任务不能顺延。'); const date = nextStudyDay(next.settings, addDays(task.date, 1)); if (!date) { task.queued = true; task.queueReason = '考试日前没有可容纳的日期'; } else { task.manualMoved = true; place(next, task, date); } return validateState(next); }
export function delayCourse(state, id) {
  const next=copy(state),source=next.tasks.find(t=>t.id===id);if(!source||source.done)throw new Error('该任务不能顺延。');
  const chain=next.tasks.filter(t=>!t.done&&!t.suspended&&t.subject===source.subject&&t.date>=source.date).sort(taskSort);
  let cursor=nextStudyDay(next.settings,addDays(source.date,1));
  for(const task of chain)task.queued=true;
  for(const task of chain){task.manualMoved=true;if(!cursor){task.queueReason='考试日前没有可容纳的日期';}else{place(next,task,cursor);if(!task.queued)cursor=nextStudyDay(next.settings,addDays(task.date,1));}}
  return validateState(next);
}
export function pauseTopic(state, id, now = dateKey()) { const next = copy(state), task = next.tasks.find(t => t.id === id); if (!task?.topicId) throw new Error('该任务不能永久暂停。'); if (!next.pausedTopics.some(item => item.topicId === task.topicId)) next.pausedTopics.push({ topicId: task.topicId, week: monday(now) }); for (const item of next.tasks.filter(t => t.topicId === task.topicId && !t.done)) item.suspended = true; return validateState(next); }
export function resumeTopic(state, topicId, now=dateKey()) {
  const next=copy(state);next.pausedTopics=next.pausedTopics.filter(item=>item.topicId!==topicId);
  const subject=topicById[topicId]?.subject;
  const originals=new Map((next.defaultWeek?.tasks||[]).map(t=>[t.id,t]));
  const chain=next.tasks.filter(t=>!t.done&&t.subject===subject&&(!t.suspended||t.topicId===topicId)&&!t.manualMoved).sort((a,b)=>(order.get(a.topicId)??99999)-(order.get(b.topicId)??99999));
  for(const task of chain)task.queued=true;
  let cursor=now;
  for(const task of chain){task.suspended=false;const base=originals.get(task.id);place(next,task,[now,cursor,base?.date||task.date].sort().at(-1));if(!task.queued)cursor=task.date;}
  return validateState(next);
}
export function restoreDefault(state, now = dateKey()) {
  const next = copy(state), week = monday(now), end = weekEnd(now);if(next.weeklyPlans?.[week])next.defaultWeek=copy(next.weeklyPlans[week]); if (next.defaultWeek?.week !== week) throw new Error('本周没有可恢复的原版计划。');
  const originalIds=new Set(next.defaultWeek.tasks.map(t=>t.id));
  const completed = next.tasks.filter(t => t.done || (!originalIds.has(t.id)&&t.createdWeek!==week&&(t.date < week || t.date > end)));
  const allowed=new Set(activeTopics(next.settings).map(t=>t.id));
  const restored=copy(next.defaultWeek.tasks).filter(t=>!t.topicId||allowed.has(t.topicId)).filter(t=>!completed.some(x=>x.id===t.id&&x.title===t.title&&x.topicId===t.topicId&&x.minutes===t.minutes));
  for(const task of restored)if(completed.some(t=>t.id===task.id))task.id=`task-${next.nextId++}`;
  next.tasks = [...completed, ...restored];
  next.pausedTopics = next.pausedTopics.filter(item => item.week !== week);
  for (const task of next.tasks.filter(t => !t.done)) { task.manualEdited = false; task.manualMoved = false; task.suspended = next.pausedTopics.some(item => item.topicId === task.topicId); }
  return validateState(reconcileBudget(processMissed(next, now),now));
}
function reconcileBudget(state,now,{compress=false}={}) {
  const tasks=state.tasks.filter(t=>!t.done&&!t.suspended).sort((a,b)=>Number(b.origin==='manual'||b.manualEdited||b.manualMoved)-Number(a.origin==='manual'||a.manualEdited||a.manualMoved)||taskSort(a,b));
  const end=weekEnd(now),cursors=new Map();
  for(const task of tasks)task.queued=true;
  for(const task of tasks){
    let wanted=task.date<now?now:task.date;
    if(compress&&task.origin==='auto'&&!task.manualEdited&&!task.manualMoved&&wanted<=end)wanted=cursors.get(task.subject)||now;
    place(state,task,wanted);if(!task.queued)cursors.set(task.subject,task.date);
  }
  return state;
}
export function updateSettings(state, settings, now = dateKey()) {
  const next = copy(state), normalized = { ...copy(settings), studyDays: [...settings.studyDays].sort((a,b)=>a-b) };
  const changedDays = JSON.stringify([...next.settings.studyDays].sort((a,b)=>a-b)) !== JSON.stringify(normalized.studyDays);
  const changedSubjects = next.settings.mathExam !== normalized.mathExam || next.settings.englishExam !== normalized.englishExam || next.settings.politicsMode !== normalized.politicsMode;
  next.settings = normalized;
  if (changedSubjects) {
    const allowed = new Set(activeTopics(normalized).map(t=>t.id));
    next.tasks = next.tasks.filter(task => task.done || task.origin === 'manual' || !task.topicId || allowed.has(task.topicId)).filter(task => task.done || task.origin === 'manual' || normalized.politicsMode !== 'off' || task.subject !== 'politics');
    next.pausedTopics = next.pausedTopics.filter(item => allowed.has(item.topicId));
    for (const task of next.tasks.filter(t=>!t.done)) task.examTrack = trackFor(task.subject, normalized);
  }
  if ((changedDays || changedSubjects) && next.onboardingCompleted) {
    const edits=next.tasks.filter(t=>!t.done&&(t.origin==='manual'||t.manualEdited||t.manualMoved));
    const prior=new Map((next.defaultWeek?.tasks||[]).map(t=>[t.id,t]));
    const base=copy(next);base.tasks=base.tasks.filter(t=>t.done||t.origin==='auto').map(t=>t.done?t:{...t,...copy(prior.get(t.id)||{}),done:false,manualEdited:false,manualMoved:false,suspended:false});
    base.pausedTopics=base.pausedTopics.filter(p=>p.week!==monday(now));
    for(const task of base.tasks)if(!task.done){task.suspended=pausedSet(base).has(task.topicId);task.examTrack=trackFor(task.subject,normalized);}
    const rebuilt=generateWeek(reconcileBudget(base,now,{compress:true}),now,true,true);
    const byId=new Map(edits.map(t=>[t.id,t]));
    rebuilt.tasks=rebuilt.tasks.map(t=>byId.get(t.id)||t);
    for(const task of edits)if(!rebuilt.tasks.some(t=>t.id===task.id))rebuilt.tasks.push(task);
    rebuilt.pausedTopics=next.pausedTopics;
    for(const task of rebuilt.tasks)if(!task.done)task.suspended=pausedSet(rebuilt).has(task.topicId);
    return validateState(reconcileBudget(rebuilt,now));
  }
  return validateState(reconcileBudget(next,now));
}
export function setLevel(state, topicId, level, now = dateKey()) { const next = copy(state); if (!topicById[topicId] || ![0, 1, 2, 3].includes(level)) throw new Error('掌握程度不正确。'); next.progress[topicId] = { level, updated: now }; return validateState(next); }

export function validTimerDuration(mode,duration){return Number.isInteger(duration)&&(mode==='stopwatch'?duration===86400:['focus','break'].includes(mode)&&duration>=60&&duration<=(mode==='break'?7200:14400)&&duration%60===0);}
export function startTimer(state, subject, duration, nowMs = Date.now(), options={}) {
  const next = copy(state); if (next.timer) return next;const mode=options.mode||'focus';if(mode==='stopwatch')duration=86400;
  const task=options.taskId?next.tasks.find(t=>t.id===options.taskId):null;
  if(options.taskId&&(!task||task.done||task.suspended||task.queued))throw new Error('任务已经变化，请重新选择。');
  if(task)subject=task.subject;
  if (!subjectById[subject] || !validTimerDuration(mode,duration)) throw new Error('番茄钟设置不正确。');
  next.timer = { id: uid('focus'), subject, examTrack: task?.examTrack||trackFor(subject, next.settings), duration, mode,remaining: duration, running: true, until: nowMs + duration * 1000, date: dateKey(new Date(nowMs)) };
  if(task)Object.assign(next.timer,{taskId:task.id,taskTitle:task.title,topicId:task.topicId||''});
  next.lastFocusResult=null;return validateState(next);
}
export function syncTimer(state, nowMs = Date.now()) { const next = copy(state); const t = next.timer; if (!t?.running) return next; t.remaining = Math.max(0, Math.ceil((t.until - nowMs) / 1000)); return t.remaining ? validateState(next) : finishTimer(next, nowMs, false); }
export function pauseTimer(state, nowMs = Date.now()) { const next = syncTimer(state, nowMs); if (next.timer) { next.timer.running = false; next.timer.until = 0; } return validateState(next); }
export function resumeTimer(state, nowMs = Date.now()) { const next = copy(state); if (next.timer && !next.timer.running) { next.timer.running = true; next.timer.until = nowMs + next.timer.remaining * 1000; } return validateState(next); }
export function finishTimer(state, nowMs = Date.now(), early = true) { const next = copy(state), t = next.timer; if (!t) return next; if (t.running) t.remaining = Math.max(0, Math.min(t.duration,Math.ceil((t.until - nowMs) / 1000)));const mode=t.mode||'focus', seconds=mode==='break'?0:Math.max(0,t.duration-t.remaining),metadata={...(t.taskId?{taskId:t.taskId,taskTitle:t.taskTitle,topicId:t.topicId||''}:{})};if(seconds&&!next.sessions.some(s=>s.id===t.id))next.sessions.push({id:t.id,date:t.date,subject:t.subject,examTrack:t.examTrack,seconds,early,source:'timer',mode,...metadata});next.lastFocusResult={id:t.id,date:t.date,subject:t.subject,examTrack:t.examTrack,seconds,mode,endedAt:nowMs,...metadata};next.timer=null;return validateState(next); }
export function cancelTimer(state) { const next = copy(state); next.timer = null; return validateState(next); }
export const formatDuration = seconds => { const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60; return [h ? `${h}小时` : '', m ? `${m}分` : '', s ? `${s}秒` : ''].filter(Boolean).join('') || '0秒'; };
export function weekStats(state, week = monday(dateKey())) { const all=state.tasks.filter(t=>t.date>=week&&t.date<=weekEnd(week)),list=all.filter(t=>t.done||!t.queued&&!t.suspended); return { total:list.length,done:list.filter(t=>t.done).length,percent:list.length?Math.round(list.filter(t=>t.done).length/list.length*100):0,queued:all.filter(t=>!t.done&&t.queued&&!t.suspended).length,paused:all.filter(t=>!t.done&&t.suspended).length }; }
export function placeTask(state, task, wanted) { place(state,task,wanted);return task; }
export function enforceBudget(state, now=dateKey()) {return validateState(reconcileBudget(copy(state),now));}
export function progressPercent(state) { const list = activeTopics(state.settings); return list.length ? Math.round(list.reduce((sum, t) => sum + (state.progress[t.id]?.level || 0) / 3, 0) / list.length * 1000) / 10 : 0; }
