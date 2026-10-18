import * as Core from '../lib/qz/engine.js';
import { activeSubjects, activeTopics, activeGroups } from '../lib/qz/curriculum.js';
import { Store, createBackend, makeBackup, parseBackup, bytes, MAX_BYTES } from './store.js';
import { escapeHTML as e, icon, boat, toast, Dialogs, bindTaskGestures } from './ui.js';

const root=document.querySelector('#app'),dialogs=new Dialogs();
const titles={home:'今天，也向前一步',plan:'把这一周安排好',focus:'专心眼前这一件事',progress:'看见每一步积累',settings:'找到自己的节奏',records:'每一份努力都有迹可循'};
const labels={home:'首页',plan:'学习计划',focus:'专注空间',progress:'学习进度',settings:'设置',records:'学习记录'};
const navs=['home','plan','focus','progress','settings'];
const today=()=>Core.dateKey();
const duration=seconds=>Core.formatDuration(Math.max(0,seconds));
const version=()=>globalThis.QingzhouAndroid?.version?.()||'1.0.1';
let store,state,error='',page='home',week=Core.monday(today()),settingsDirty=false;
let query='',expanded=new Set(),beforeSearch=null,focusSubject='math',focusDuration=1500;
let recordsFilter={type:'all',subject:'all',from:'',to:'',page:1},lastTimerId='',interval;
try{store=new Store(createBackend());state=store.state;}catch(failure){error=failure.message;}
function banner(message){error=message;const existing=document.querySelector('#page-error');if(existing){existing.textContent=message;existing.hidden=!message;}toast(message,true);}
function clearError(){error='';const existing=document.querySelector('#page-error');if(existing)existing.hidden=true;}
function subjects(){return activeSubjects(state.settings);}
function name(subject,track){return Core.subjectName(subject,state.settings,track);}
function selectOptions(list,value){return list.map(item=>'<option value="'+e(item.id)+'" '+(item.id===value?'selected':'')+'>'+e(item.name)+'</option>').join('');}
function header(){return '<header class="topbar"><div><span class="eyebrow">QINGZHOU · 轻舟</span><h1>'+labels[page]+'</h1><p>'+titles[page]+'</p></div><div class="top-icon">'+icon(page==='home'?'leaf':page==='records'?'history':page,27)+'</div></header>';}
function navigation(){return '<nav class="bottom-nav" aria-label="主导航">'+navs.map(id=>'<button data-nav="'+id+'" class="'+(page===id?'active':'')+'" '+(page===id?'aria-current="page"':'')+'>'+icon(id)+'<span>'+({home:'首页',plan:'计划',focus:'专注',progress:'进度',settings:'设置'}[id])+'</span></button>').join('')+'</nav>';}
function empty(text,detail=''){return '<div class="empty">'+icon('book',30)+'<p>'+e(text)+'</p>'+(detail?'<small>'+e(detail)+'</small>':'')+'</div>';}
function action(text,key,css='secondary'){return '<button class="button '+css+'" data-action="'+key+'">'+text+'</button>';}
function taskHTML(task,readonly=false){
  const label=name(task.subject,task.examTrack),done=task.done;
  if(readonly)return '<div class="original-task"><strong>'+e(task.title)+'</strong><small>'+e(task.date)+' · '+e(label)+' · '+task.minutes+' 分钟</small></div>';
  return '<div class="task-swipe"><span class="swipe-label">'+(done?'撤销完成':'完成')+'</span><div class="task-row '+(done?'completed':'')+'" data-id="'+e(task.id)+'" tabindex="0"><div class="task-copy"><strong>'+e(task.title)+'</strong><small>'+e(label)+'<span> · </span>'+task.minutes+' 分钟</small></div>'+(done?'<span class="done-label">'+icon('check',16)+'已完成</span>':task.suspended?'<span class="pill">已暂停</span>':task.queued?'<span class="pill">待安排</span>':'<button class="start-button" data-start="'+e(task.id)+'" aria-label="开始学习：'+e(task.title)+'">开始</button>')+'</div></div>';
}
function home(){
  const now=today(),tasks=state.tasks.filter(task=>task.date===now&&!task.queued&&!task.suspended);
  const stats=Core.weekStats(state),seconds=state.sessions.filter(s=>s.date===now).reduce((sum,s)=>sum+s.seconds,0);
  const days=Core.dayDiff(now,state.settings.examDate),hasPlan=state.defaultWeek?.week===Core.monday(now);
  const quotes=['稳稳地走，每一步都算数。','不必一口气抵达，把今天学扎实。','把注意力留给眼前这一页。','进步有时很慢，但从未白费。','允许调整节奏，也记得继续出发。','把大目标，过成踏实的小日子。','今天认真走过的路，会在以后看见。'];
  return '<section class="countdown"><div><span>'+e(days>0?'距离目标初试日':days===0?'今天是目标初试日':'目标初试日期已过')+'</span><small>'+e(state.settings.name)+'，'+e(days<0?'记得在设置中调整目标日期。':'按自己的节奏，继续向前。')+'</small></div><div class="count-number">'+Math.max(0,days)+'<small>天</small></div></section>'+
  (state.timer?'<button class="resume-card" data-nav="focus">'+icon('focus')+'<span>'+e(name(state.timer.subject,state.timer.examTrack))+' · '+(state.timer.running?'专注进行中':'专注已暂停')+'</span>'+icon('arrow',18)+'</button>':'')+
  '<section class="card"><div class="section-head"><h2>今日计划</h2><button class="text-button" data-nav="plan">查看本周 '+icon('arrow',15)+'</button></div>'+
  (tasks.length?'<p class="gesture-hint">右滑完成，再次右滑可撤销</p>'+tasks.map(t=>taskHTML(t)).join(''):empty(hasPlan?'今天没有安排，安心休息吧':'先为这一周安排一点进步',hasPlan?'也可以去计划页添加自主学习内容':'每天一点，留出弹性，慢慢积累'))+
  (!hasPlan?action('生成本周计划','generate-from-home','primary'):'')+'</section>'+
  '<section class="metrics"><button data-nav="plan"><strong>'+stats.percent+'<em>%</em></strong><span>本周完成</span></button><button data-nav="progress"><strong>'+Core.progressPercent(state)+'<em>%</em></strong><span>知识掌握</span></button><button data-nav="records"><strong>'+Math.floor(seconds/60)+'<em>分</em></strong><span>今日专注</span></button></section>'+
  '<section class="course-entry card"><div class="section-head"><h2>学习内容</h2><button class="text-button" data-nav="progress">查看全部 '+icon('arrow',15)+'</button></div><div class="course-grid">'+activeGroups(state.settings).map(group=>'<button data-group="'+group.id+'"><span class="course-symbol">'+e(group.symbol)+'</span><span>'+e(group.name)+'</span>'+icon('arrow',14)+'</button>').join('')+'</div></section>'+
  '<p class="quote">'+quotes[new Date().getDay()]+'</p>';
}
function plan(){
  const end=Core.weekEnd(week),current=week===Core.monday(today()),hasPlan=state.defaultWeek?.week===week;
  const list=state.tasks.filter(task=>task.date>=week&&task.date<=end&&!task.suspended&&!task.queued),fixed=state.settings.dailyHours*60;
  let html='<div class="week-nav"><button class="icon-button" data-action="previous-week" aria-label="上一周">'+icon('back',18)+'</button><button class="week-label" data-action="this-week">'+week.slice(5).replace('-',' / ')+' — '+end.slice(5).replace('-',' / ')+'</button><button class="icon-button" data-action="next-week" aria-label="下一周">'+icon('arrow',18)+'</button></div>';
  if(current)html+='<div class="actions">'+action(hasPlan?'重新安排':'生成本周计划','generate','primary')+action(icon('add',18)+' 添加内容','add')+'</div><p class="gesture-hint page-hint">右滑完成 · 长按编辑 · 按周一至周日安排</p>';
  if(hasPlan)html+='<button class="card original-entry" data-action="original"><span><strong>查看原版</strong><small>本周默认安排</small></span>'+icon('arrow',18)+'</button>';
  const weekdays=['周一','周二','周三','周四','周五','周六','周日'];
  for(let index=0;index<7;index++){
    const date=Core.addDays(week,index),tasks=list.filter(t=>t.date===date),rest=!Core.isStudyDay(state.settings,date),isToday=date===today();
    const used=tasks.reduce((sum,t)=>sum+t.minutes,0);
    html+='<section class="card day-card '+(!tasks.length?'empty-day':'')+' '+(isToday?'today':'')+'" id="day-'+date+'"><div class="section-head"><div class="day-heading"><h2>'+(isToday?'今天':weekdays[index])+'</h2><span>'+date.slice(5).replace('-',' / ')+'</span></div><span class="pill '+(rest?'neutral':'')+'">'+(rest?'休息日':!tasks.length?'暂无安排':used+' / '+fixed+' 分钟')+'</span></div>';
    if(tasks.length)html+=tasks.map(t=>taskHTML(t)).join('')+'<p class="day-budget">'+(used>fixed?'固定安排已超过当日预算，可编辑任务调整。':'剩余 '+Math.max(0,fixed-used)+' 分钟，可作为机动时间')+'</p>';
    html+='</section>';
  }
  if(current){
    const queued=state.tasks.filter(t=>t.queued&&!t.done&&!t.suspended);
    if(queued.length)html+='<section class="card"><h2>待安排 <span class="count">'+queued.length+'</span></h2>'+queued.map(t=>'<button class="queued-task" data-edit="'+e(t.id)+'"><strong>'+e(t.title)+'</strong><small>'+e(t.queueReason||'暂时没有可容纳的日期')+'</small><small>'+e(name(t.subject,t.examTrack))+' · '+t.minutes+' 分钟</small></button>').join('')+'</section>';
    if(state.pausedTopics.length)html+='<section class="card"><h2>永久暂停</h2>'+state.pausedTopics.map(item=>'<div class="paused-row"><span><strong>'+e(Core.topicById[item.topicId]?.title||item.topicId)+'</strong><small>从 '+e(item.week)+' 这一周起</small></span><button class="small-button" data-resume="'+e(item.topicId)+'">恢复</button></div>').join('')+'</section>';
  }
  return html;
}
function focus(){
  const timer=state.timer,selected=timer?.subject||focusSubject,frozen=store.pending?.candidate.sessions.find(s=>s.id===timer?.id),remaining=store.pending?Math.max(0,(timer?.duration||focusDuration)-(frozen?.seconds||0)):timer?Core.syncTimer(state).timer?.remaining??0:focusDuration;
  const seconds=state.sessions.filter(s=>s.date===today()).reduce((sum,s)=>sum+s.seconds,0);
  return '<section class="card timer-card"><p class="muted">今日已专注 <span id="focus-today">'+e(duration(seconds))+'</span></p><div class="clock" id="clock" aria-live="off">'+clock(remaining)+'</div>'+
  (store.pending?'<p class="save-warning">本轮结果尚未保存，计时已冻结</p>'+action('重试保存','retry-focus','primary'):timer?'<p class="focus-subject">'+e(name(timer.subject,timer.examTrack))+'</p><div class="actions">'+action(timer.running?'暂停':'继续',timer.running?'pause':'resume','primary')+action('提前结束','end')+'</div><button class="text-button cancel-focus" data-action="cancel-focus">放弃本轮</button>':
  '<label class="field-label" for="focus-subject">本轮课程</label><select id="focus-subject">'+selectOptions(subjects(),selected)+'</select><div class="duration-options">'+[25,50,90].map(minutes=>'<button class="'+(focusDuration===minutes*60?'active':'')+'" data-duration="'+minutes*60+'">'+minutes+' 分钟</button>').join('')+'</div>'+action(icon('play',18)+' 开始专注','start-focus','primary'))+
  '<p class="timer-caption">一次只做一件事，休息也是计划的一部分。</p></section>'+
  '<section class="card"><div class="section-head"><h2>今日各课程</h2><button class="text-button" data-records="focus">全部记录 '+icon('arrow',15)+'</button></div>'+(()=>{const totals=new Map();for(const session of state.sessions.filter(s=>s.date===today())){const label=name(session.subject,session.examTrack);totals.set(label,(totals.get(label)||0)+session.seconds);}return totals.size?[...totals].map(([label,seconds])=>'<div class="setting-row"><span>'+e(label)+'</span><strong>'+e(duration(seconds))+'</strong></div>').join(''):empty('今天的专注，从现在开始');})()+'</section>'+
  '<button class="card record-entry" data-records="focus"><span class="entry-icon">'+icon('history',24)+'</span><span><strong>专注记录</strong><small>按课程查看实际投入的时间</small></span>'+icon('arrow',18)+'</button>';
}
function clock(seconds){return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
function progress(){
  const q=query.trim().toLowerCase(),weekly=Core.weekStats(state);
  return '<div class="progress-summary"><div><strong>'+weekly.percent+'<em>%</em></strong><span>本周任务完成</span></div><div><strong>'+Core.progressPercent(state)+'<em>%</em></strong><span>知识掌握</span></div></div>'+
  '<label class="search-field">'+icon('search',19)+'<input id="progress-search" placeholder="搜索知识点或章节" value="'+e(query)+'" autocomplete="off"></label>'+
  subjects().map(subject=>{
    const items=subject.chapters.flatMap(chapter=>chapter.topics.map(topic=>({...topic,chapterName:chapter.title})));
    const matches=items.filter(topic=>!q||(topic.title+' '+topic.chapterName+' '+subject.name).toLowerCase().includes(q));if(!matches.length)return '';
    const percent=Math.round(items.reduce((sum,t)=>sum+(state.progress[t.id]?.level||0)/3,0)/items.length*100),open=q||expanded.has(subject.id);
    return '<section class="card subject-card" id="subject-'+subject.id+'"><button class="subject-heading" data-expand="'+subject.id+'" aria-expanded="'+!!open+'"><span><strong>'+e(subject.name)+'</strong><small>'+items.length+' 个知识点</small></span><span class="subject-number">'+percent+'% <span class="chevron '+(open?'up':'')+'">⌄</span></span></button><div class="subject-progress"><span style="width:'+percent+'%"></span></div>'+
    (open?'<div class="topic-list">'+matches.map(topic=>{
      const level=state.progress[topic.id]?.level||0;
      return '<div class="topic-row"><div><strong>'+e(topic.title)+'</strong><small>'+e(topic.chapterName)+'</small></div><button data-level="'+topic.id+'" class="level level-'+level+'">'+Core.LEVELS[level]+'</button></div>';
    }).join('')+'</div>':'')+'</section>';
  }).join('')+action('查看学习记录','records');
}
function settings(){
  const s=state.settings,days=[1,2,3,4,5,6,0];
  return '<form id="settings-form"><section class="card"><h2>基本设置</h2><label class="field-label" for="name">称呼</label><input id="name" name="name" maxlength="40" value="'+e(s.name)+'"><div class="label-row"><label class="field-label" for="exam-date">目标初试日</label><span id="exam-mode" class="pill">'+(s.examDateMode==='auto'?'自动':'手动')+'</span></div><input type="date" name="examDate" id="exam-date" value="'+s.examDate+'"><input type="hidden" name="examDateMode" value="'+s.examDateMode+'"><button type="button" class="text-button date-reset" data-action="auto-date">恢复自动日期</button><p class="help">自动日期最早为 2027-12-20，过期后切换至下一年。它是规划日期，请以官方考试公告为准。</p><label class="field-label" for="daily-hours">每日学习时间</label><div class="hours-input"><input type="number" id="daily-hours" name="dailyHours" min="0.5" max="16" step="0.5" value="'+s.dailyHours+'"><span>小时 / 天</span></div></section>'+
  '<section class="card"><h2>考试科目</h2>'+examFields(s)+'</section><section class="card"><h2>每周学习日</h2><div class="week-options">'+days.map(day=>'<label><input type="checkbox" name="studyDays" value="'+day+'" '+(s.studyDays.includes(day)?'checked':'')+'><span>周'+['日','一','二','三','四','五','六'][day]+'</span></label>').join('')+'</div><p class="help">关闭的日期不安排未完成任务；修改后会重建本周默认计划。</p></section><button type="submit" class="button primary wide save-settings">保存设置</button></form>'+
  '<section class="card"><h2>记录与备份</h2><button class="setting-row" data-action="export"><span>'+icon('history',20)+'导出完整备份</span>'+icon('arrow',16)+'</button><button class="setting-row" data-action="import"><span>'+icon('book',20)+'导入安卓版备份</span>'+icon('arrow',16)+'</button><p class="help">包含计划、掌握程度和学习记录，导入前会再次确认。</p></section>'+
  '<section class="card"><h2>联系我们</h2><p class="developer">轻舟项目开发者</p><p class="email">2024304827@aust.edu.cn</p><div class="actions">'+action('复制邮箱','copy-email')+action('发送邮件','contact')+'</div></section>'+
  '<button class="version-row" data-action="releases">轻舟 Android '+e(version())+' · 查看发布版本 '+icon('arrow',14)+'</button><input type="file" id="backup-file" accept=".json,application/json" hidden>';
}
function examFields(s){
  return '<fieldset><legend>数学</legend><div class="choices">'+[['math2','数学二'],['math1','数学一']].map(([value,label])=>'<label><input type="radio" name="mathExam" value="'+value+'" '+(s.mathExam===value?'checked':'')+'><span>'+label+'</span></label>').join('')+'</div></fieldset>'+
  '<fieldset><legend>英语</legend><div class="choices">'+[['english2','英语二'],['english1','英语一']].map(([value,label])=>'<label><input type="radio" name="englishExam" value="'+value+'" '+(s.englishExam===value?'checked':'')+'><span>'+label+'</span></label>').join('')+'</div></fieldset>'+
  '<fieldset><legend>政治计划</legend><div class="choices politics-choices">'+[['off','不安排'],['light','轻度'],['full','全量']].map(([value,label])=>'<label><input type="radio" name="politicsMode" value="'+value+'" '+(s.politicsMode===value?'checked':'')+'><span>'+label+'</span></label>').join('')+'</div><p class="help">早期可轻度熟悉，考前约 5–6 个月考虑系统复习，最后约 3 个月加强回顾。这是可调整的规划建议。</p></fieldset>';
}
function records(){
  const f=recordsFilter,rows=[];
  if(f.type!=='focus')for(const item of state.completions)rows.push({...item,key:'task-'+item.id,type:'task',detail:'完成任务 · '+item.minutes+' 分钟'});
  if(f.type!=='task')for(const item of state.sessions)rows.push({...item,key:'focus-'+item.id,type:'focus',title:'专注学习',detail:'实际专注 '+duration(item.seconds)});
  const list=rows.filter(r=>(f.subject==='all'||r.subject===f.subject)&&(!f.from||r.date>=f.from)&&(!f.to||r.date<=f.to)).sort((a,b)=>b.date.localeCompare(a.date)||b.key.localeCompare(a.key));
  const historySubjects=[{id:'all',name:'全部课程'},...subjects()];
  for(const row of rows)if(!historySubjects.some(s=>s.id===row.subject))historySubjects.push({id:row.subject,name:Core.subjectById[row.subject]?.name||'历史课程'});
  return '<section class="card filter-card"><div class="segmented">'+[['all','全部'],['task','任务'],['focus','专注']].map(([value,label])=>'<button data-record-type="'+value+'" class="'+(f.type===value?'active':'')+'">'+label+'</button>').join('')+'</div><label class="field-label" for="record-subject">课程</label><select id="record-subject">'+selectOptions(historySubjects,f.subject)+'</select><div class="date-range"><label><span>开始日期</span><input type="date" id="record-from" value="'+f.from+'"></label><label><span>结束日期</span><input type="date" id="record-to" value="'+f.to+'"></label></div><button class="text-button" data-action="clear-dates">清除日期筛选</button></section>'+
  '<section class="card"><h2>学习记录 <span class="count">'+list.length+'</span></h2>'+(list.length?list.slice(0,f.page*20).map(row=>'<article class="history-row"><div><strong>'+e(row.title)+'</strong><span class="pill">'+(row.type==='task'?'已完成':'专注')+'</span></div><small>'+e(row.date)+' · '+e(name(row.subject,row.examTrack))+'</small><p>'+e(row.detail)+'</p></article>').join(''):empty('这里会留下认真学习的痕迹','换个筛选条件，或从今天的一次专注开始'))+(list.length>f.page*20?action('加载更多','more-records'):'')+'</section>';
}
function onboarding(){
  return '<main class="welcome"><div class="welcome-mark">'+boat+'</div><span class="eyebrow">QINGZHOU · 轻舟</span><h1>让备考，轻一点</h1><p class="welcome-copy">选好方向，把大目标<br>拆成每天踏实的小进步。</p><form id="onboarding-form"><section class="card">'+examFields(state.settings)+'</section><div class="welcome-defaults"><span>'+icon('focus',17)+' 每天 4 小时</span><span>'+icon('plan',17)+' 每周七天</span><p>目标初试规划日：'+e(state.settings.examDate)+'<br>之后都可以在设置中修改</p></div><button class="button primary wide" type="submit">生成本周计划，开始使用 '+icon('arrow',18)+'</button></form><p class="welcome-foot">不必完美开始，先出发就很好。</p></main>';
}
function recovery(){
  root.innerHTML='<main class="recovery"><div class="welcome-mark">'+boat+'</div><h1>先保护好你的记录</h1><p>现有记录暂时无法读取，应用没有用空白记录覆盖它。</p><div class="error-panel">'+e(error)+'</div><button class="button primary wide" data-action="export-raw">导出原始记录</button><button class="button secondary wide" data-action="import">导入有效备份</button><input type="file" id="backup-file" accept=".json,application/json" hidden></main>';bindBackupInput();
}
function render(){
  if(!state){recovery();return;}
  if(!state.onboardingCompleted){root.innerHTML=onboarding();root.querySelector('#onboarding-form').onsubmit=startOnboarding;return;}
  const savedScroll=window.scrollY;
  root.innerHTML='<div class="app-shell">'+header()+'<main class="page" id="main"><div class="error-panel" id="page-error" role="alert" '+(!error?'hidden':'')+'>'+e(error)+'</div>'+({home,plan,focus,progress,settings,records}[page]||home)()+'</main>'+navigation()+'</div>';
  if(page==='home'||page==='plan')bindTaskGestures(root,{toggle:toggleTask,edit:page==='plan'?taskMenu:undefined});
  if(page==='progress'){
    const input=document.querySelector('#progress-search');
    input.oninput=()=>{const at=input.selectionStart;if(!query&&input.value)beforeSearch=new Set(expanded);query=input.value;if(!query&&beforeSearch){expanded=beforeSearch;beforeSearch=null;}render();const next=document.querySelector('#progress-search');next.focus({preventScroll:true});next.setSelectionRange(at,at);};
  }
  if(page==='settings'){
    const form=document.querySelector('#settings-form');form.oninput=()=>{settingsDirty=true;};
    document.querySelector('#exam-date').onchange=()=>{form.elements.examDateMode.value='manual';document.querySelector('#exam-mode').textContent='手动';settingsDirty=true;};
    form.onsubmit=saveSettings;bindBackupInput();
  }
  if(page==='focus'){
    const select=document.querySelector('#focus-subject');if(select)select.onchange=()=>focusSubject=select.value;
  }
  if(page==='records'){
    document.querySelector('#record-subject').onchange=event=>{recordsFilter.subject=event.target.value;recordsFilter.page=1;render();};
    for(const key of ['from','to'])document.querySelector('#record-'+key).onchange=event=>{recordsFilter[key]=event.target.value;recordsFilter.page=1;render();};
  }
  requestAnimationFrame(()=>window.scrollTo(0,savedScroll));
}
async function navigate(next){
  if(!state?.onboardingCompleted)return;
  if(settingsDirty&&next!==page){
    if(!await dialogs.confirm({title:'设置还没有保存',body:'离开后将放弃这次未保存的修改。',confirm:'放弃修改'}))return;
    settingsDirty=false;
  }
  page=next;clearError();render();requestAnimationFrame(()=>window.scrollTo(0,0));
}
function commit(command,message='已保存',{rerender=true}={}){
  try{store.update(command);state=store.state;clearError();if(rerender&&!dialogs.active)render();if(message)toast(message);return true;}
  catch(failure){if(dialogs.active)dialogs.error(dialogs.stack.at(-1),failure.message);else banner(failure.message);return false;}
}
async function startOnboarding(event){
  event.preventDefault();const form=event.currentTarget,data=new FormData(form);
  const options={...state.settings,mathExam:data.get('mathExam'),englishExam:data.get('englishExam'),politicsMode:data.get('politicsMode')};
  if(!await dialogs.confirm({title:'准备好开始这一周了吗？',body:'按所选科目、每天 4 小时和每周七天生成今天起的本周安排，之后可以直接编辑。',confirm:'生成并开始'}))return;
    if(commit(base=>Core.generateWeek({...base,settings:options}),'计划已准备好')){page='home';render();requestAnimationFrame(()=>window.scrollTo(0,0));}
}
function toggleTask(id){
  let completed=false;
  const ok=commit(base=>{const task=base.tasks.find(item=>item.id===id);if(!task)throw new Error('任务已经变化，请刷新后重试。');completed=!task.done;return Core.toggleTask(base,id);},'');
  if(ok){globalThis.QingzhouAndroid?.feedback?.();toast(completed?'已完成，继续保持':'已撤销完成');}
}
function startTask(id){
  const task=state.tasks.find(t=>t.id===id);
  if(!task||task.done||task.queued||task.suspended)return;
  focusSubject=state.timer?.subject||task.subject;
  if(!state.timer&&!commit(base=>Core.startTimer(base,task.subject,focusDuration),'',{rerender:false}))return;
    page='focus';render();requestAnimationFrame(()=>window.scrollTo(0,0));
}
async function generate(){
  if(!await dialogs.confirm({title:state.defaultWeek?.week===Core.monday(today())?'重新安排本周？':'生成本周计划？',body:'按照课程目录、学习日和每日预算安排。已完成记录、人工编辑及暂停会保留。',confirm:'确认安排'}))return;
  if(commit(base=>base.defaultWeek?.week===Core.monday(today())?Core.replan(base):Core.generateWeek(base),'本周计划已更新')){week=Core.monday(today());page='plan';render();}
}
function taskMenu(id){
  const task=state.tasks.find(t=>t.id===id);if(!task||task.done)return;
  const handle=dialogs.open({title:'编辑任务',subtitle:task.title,className:'compact',body:'<div class="menu-actions"><button data-menu="edit">修改内容、日期和时长</button><button data-menu="delay">顺延到下个学习日</button>'+(task.origin==='auto'?'<button data-menu="course">整门课程顺延</button>'+(task.topicId?'<button data-menu="pause">永久暂停知识点</button>':''):'<button class="danger-text" data-menu="delete">删除自加任务</button>')+'</div>',footer:'<button class="button secondary wide cancel">取消</button>'});
  handle.element.querySelector('.cancel').onclick=()=>handle.close();
  handle.element.querySelectorAll('[data-menu]').forEach(button=>button.onclick=async()=>{
    const type=button.dataset.menu;
    if(type==='edit'){handle.close();taskForm(task);return;}
    if((type==='pause'||type==='delete')&&!await dialogs.confirm({title:type==='pause'?'永久暂停这个知识点？':'删除自加任务？',body:type==='pause'?'恢复前不会自动安排，可以在计划页恢复。':'该自加任务将被删除，不影响其他学习记录。',confirm:type==='pause'?'确认暂停':'确认删除',danger:true}))return;
    const commands={delay:base=>Core.delayOne(base,id),course:base=>Core.delayCourse(base,id),pause:base=>Core.pauseTopic(base,id),delete:base=>Core.deleteManualTask(base,id)};
    if(commit(commands[type],type==='pause'?'已暂停，可随时恢复':'安排已更新')){handle.close();render();}
  });
}
function taskForm(task=null){
  const list=subjects(),initial={title:task?.title||'',subject:task?.subject||list[0].id,date:task?.date||today(),minutes:task?.minutes||60,topicId:task?.topicId||''};
  let topicId=initial.topicId,dirty=false;
  const handle=dialogs.open({title:task?'修改学习任务':'添加学习内容',body:'<form id="task-form"><label class="field-label">知识点（可选）</label><button type="button" class="select-topic">'+e(Core.topicById[topicId]?.title||'选择知识点')+icon('arrow',16)+'</button><label class="field-label" for="task-subject">课程</label><select id="task-subject" name="subject" '+(topicId||task?'disabled':'')+'>'+selectOptions(list,initial.subject)+'</select><label class="field-label" for="task-title">标题</label><input name="title" id="task-title" maxlength="200" required value="'+e(initial.title)+'"><div class="form-grid"><label><span class="field-label">日期</span><input type="date" name="date" required value="'+initial.date+'"></label><label><span class="field-label">时长（分钟）</span><input name="minutes" type="number" inputmode="numeric" min="1" max="960" required value="'+initial.minutes+'"></label></div></form>',footer:'<button class="button primary wide task-save">保存任务</button>',onClose:async()=>{if(!dirty||await dialogs.confirm({title:'放弃这次修改？',body:'尚未保存的任务内容将被放弃。',confirm:'放弃修改'})){handle.close();}}});
  const form=handle.element.querySelector('form');form.oninput=()=>dirty=true;form.onchange=()=>dirty=true;
  handle.element.querySelector('.select-topic').onclick=()=>topicPicker(topicId,topic=>{
    topicId=topic.id;dirty=true;
    const title=form.elements.title;if(!title.value.trim())title.value=topic.title;
    form.elements.subject.value=topic.subject;form.elements.subject.disabled=true;
    handle.element.querySelector('.select-topic').innerHTML=e(topic.title)+icon('arrow',16);
  });
  function save(){
    if(!form.reportValidity())return;
    const fields={title:form.elements.title.value.trim(),subject:form.elements.subject.value,date:form.elements.date.value,minutes:Number(form.elements.minutes.value),topicId};
    const command=task?base=>Core.editTask(base,task.id,fields):base=>Core.addManualTask(base,fields);
    if(commit(command)){dirty=false;handle.close();render();}
  }
  form.onsubmit=event=>{event.preventDefault();save();};
  handle.element.querySelector('.task-save').onclick=save;
}
function topicPicker(selected,onChoose){
  let term='',course='all';
  const handle=dialogs.open({title:'选择知识点',body:'<div class="picker-tools"><label class="search-field">'+icon('search',18)+'<input id="topic-query" placeholder="搜索知识点或章节"></label><select id="topic-course">'+selectOptions([{id:'all',name:'全部课程'},...subjects()],'all')+'</select></div><div id="topic-results"></div>',footer:'<button class="button secondary wide return-form">返回任务</button>',className:'topic-picker'});
  const draw=()=>{
    const list=subjects().flatMap(subject=>subject.chapters.flatMap(chapter=>chapter.topics.map(topic=>({...topic,subjectName:subject.name,chapterName:chapter.title}))));
    const matches=list.filter(topic=>(course==='all'||topic.subject===course)&&(!term||(topic.title+' '+topic.chapterName+' '+topic.subjectName).toLowerCase().includes(term.toLowerCase())));
    handle.element.querySelector('#topic-results').innerHTML=matches.length?matches.map(topic=>'<button class="picker-topic '+(selected===topic.id?'selected':'')+'" data-topic="'+topic.id+'"><strong>'+e(topic.title)+'</strong><small>'+e(topic.subjectName)+' · '+e(topic.chapterName)+'</small></button>').join(''):empty('没有找到匹配的知识点');
    handle.element.querySelectorAll('[data-topic]').forEach(button=>button.onclick=()=>{onChoose(Core.topicById[button.dataset.topic]);handle.close();});
  };
  handle.element.querySelector('#topic-query').oninput=event=>{term=event.target.value;draw();};
  handle.element.querySelector('#topic-course').onchange=event=>{course=event.target.value;draw();};
  handle.element.querySelector('.return-form').onclick=()=>handle.close();draw();
}
function original(){
  const snapshot=state.defaultWeek;if(!snapshot||snapshot.week!==week)return;
  const handle=dialogs.open({title:'本周原版计划',subtitle:'只读查看，日常编辑不会改写此快照',body:snapshot.tasks.length?snapshot.tasks.map(t=>taskHTML(t,true)).join(''):empty('这一周没有默认任务'),footer:week===Core.monday(today())?'<button class="button secondary wide restore-default">恢复默认计划</button>':''});
  handle.element.querySelector('.restore-default')?.addEventListener('click',async()=>{
    if(!await dialogs.confirm({title:'恢复本周默认计划？',body:'撤销本周新增、编辑、顺延及本周发起的永久暂停。实际完成历史保留，并按当前学习日处理漏学。',confirm:'恢复默认'}))return;
    if(commit(base=>Core.restoreDefault(base),'已恢复默认安排')){handle.close();render();}
  });
}
async function saveSettings(event){
  event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
  const data=new FormData(form),previous=state.settings;
  const settings={name:String(data.get('name')).trim()||'同学',examDate:data.get('examDate'),examDateMode:data.get('examDateMode'),dailyHours:Number(data.get('dailyHours')),mathExam:data.get('mathExam'),englishExam:data.get('englishExam'),politicsMode:data.get('politicsMode'),studyDays:data.getAll('studyDays').map(Number)};
  if(settings.dailyHours>=10&&settings.dailyHours!==previous.dailyHours&&!await dialogs.confirm({title:'也为休息留一点时间',body:'每天 '+settings.dailyHours+' 小时是很高的投入。循序渐进、劳逸结合，更容易长期坚持。',confirm:'保持设置'}))return;
  if(commit(base=>Core.updateSettings(base,settings),'设置已保存')){settingsDirty=false;render();}
}
async function endFocus(){
  if(!state.timer||store.pending)return;
  if(!await dialogs.confirm({title:'结束本轮专注？',body:'按照实际专注时间记录，暂停时间不计入。',confirm:'结束并保存'}))return;
  try{store.finish(Date.now());state=store.state;render();toast('已记录这次专注，休息一下吧');}
  catch(failure){state=store.state;render();banner(failure.message);}
}
function exportBackup(raw=false){
  try{
    const content=raw?(createBackend().read()??store?.raw??error):makeBackup(state);
    if(globalThis.QingzhouAndroid)globalThis.QingzhouAndroid.exportBackup(content);
    else{const blob=new Blob([content],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='轻舟学习备份-'+today()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(failure){banner(failure.message);}
}
function beginImport(){if(globalThis.QingzhouAndroid)globalThis.QingzhouAndroid.importBackup();else document.querySelector('#backup-file').click();}
function bindBackupInput(){
  const input=document.querySelector('#backup-file');if(input)input.onchange=async()=>{const file=input.files[0];if(!file)return;if(file.size>MAX_BYTES){banner('备份超过 30 MiB。');return;}await importBackup(await file.text());input.value='';};
}
async function importBackup(raw){
  try{
    const candidate=parseBackup(raw);
    if(!await dialogs.confirm({title:'恢复这份备份？',body:'备份中有 '+candidate.tasks.length+' 项任务、'+candidate.sessions.length+' 条专注记录。恢复将替换本机当前的学习记录。',confirm:'确认恢复'}))return;
    if(!store){store=Object.create(Store.prototype);store.backend=createBackend();store.raw=store.backend.read();store.pending=null;}
    store.save(candidate,store.backend.read());state=store.state;settingsDirty=false;page='home';clearError();render();toast('备份已恢复');
  }catch(failure){banner(failure.message);}
}
async function onAction(key){
  switch(key){
    case 'generate':return generate();
    case 'generate-from-home':page='plan';render();return generate();
    case 'previous-week':week=Core.addDays(week,-7);render();break;
    case 'next-week':week=Core.addDays(week,7);render();break;
    case 'this-week':week=Core.monday(today());render();break;
    case 'original':return original();
    case 'add':return taskForm();
    case 'records':return navigate('records');
    case 'start-focus':focusSubject=document.querySelector('#focus-subject')?.value||focusSubject;if(commit(base=>Core.startTimer(base,focusSubject,focusDuration),''))render();break;
    case 'pause':commit(base=>Core.pauseTimer(base),'已暂停');break;
    case 'resume':commit(base=>Core.resumeTimer(base),'继续加油');break;
    case 'end':return endFocus();
    case 'cancel-focus':if(await dialogs.confirm({title:'放弃本轮专注？',body:'这次计时不会写入学习记录。',confirm:'放弃本轮',danger:true}))commit(base=>Core.cancelTimer(base),'本轮已取消');break;
    case 'retry-focus':try{store.retryFinish();state=store.state;clearError();render();toast('专注记录已保存');}catch(failure){banner(failure.message);}break;
    case 'auto-date':{const form=document.querySelector('#settings-form');form.elements.examDate.value=Core.autoExamDate();form.elements.examDateMode.value='auto';document.querySelector('#exam-mode').textContent='自动';settingsDirty=true;break;}
    case 'export':return exportBackup();
    case 'export-raw':return exportBackup(true);
    case 'import':return beginImport();
    case 'clear-dates':recordsFilter.from='';recordsFilter.to='';recordsFilter.page=1;render();break;
    case 'more-records':recordsFilter.page++;render();break;
    case 'copy-email':if(globalThis.QingzhouAndroid)globalThis.QingzhouAndroid.copyEmail();else try{await navigator.clipboard.writeText('2024304827@aust.edu.cn');toast('邮箱已复制');}catch{toast('可直接选取邮箱复制');}break;
    case 'contact':if(globalThis.QingzhouAndroid)globalThis.QingzhouAndroid.openContact();else location.href='mailto:2024304827@aust.edu.cn';break;
    case 'releases':if(globalThis.QingzhouAndroid)globalThis.QingzhouAndroid.openReleases();else toast('GitHub：Hforty/qingzhou-study-assistant');break;
  }
}
root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.nav)return void navigate(button.dataset.nav);
  if(button.dataset.action)return void onAction(button.dataset.action);
  if(button.dataset.start)return startTask(button.dataset.start);
  if(button.dataset.edit)return taskMenu(button.dataset.edit);
  if(button.dataset.resume)return void commit(base=>Core.resumeTopic(base,button.dataset.resume),'已恢复安排');
  if(button.dataset.expand){const id=button.dataset.expand;if(expanded.has(id))expanded.delete(id);else expanded.add(id);render();return;}
  if(button.dataset.level){const id=button.dataset.level;return void commit(base=>Core.setLevel(base,id,((base.progress[id]?.level||0)+1)%4),'掌握程度已更新');}
  if(button.dataset.duration){focusDuration=Number(button.dataset.duration);render();return;}
  if(button.dataset.records){recordsFilter={...recordsFilter,type:button.dataset.records,page:1};return void navigate('records');}
  if(button.dataset.recordType){recordsFilter.type=button.dataset.recordType;recordsFilter.page=1;render();return;}
  if(button.dataset.group){query='';expanded=new Set(subjects().filter(s=>s.group===button.dataset.group).map(s=>s.id));return void navigate('progress');}
});
root.addEventListener('keydown',event=>{
  const row=event.target.closest('.task-row');if(!row||event.target.closest('button'))return;
  if(event.code==='Space'){event.preventDefault();toggleTask(row.dataset.id);}
  if(event.key==='Enter'){event.preventDefault();startTask(row.dataset.id);}
  if(page==='plan'&&(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')){event.preventDefault();taskMenu(row.dataset.id);}
});
function reconcile(){
  if(!store||store.pending)return;
  try{
    store.load();state=store.state;
    if(state.onboardingCompleted){
      const next=Core.syncTimer(Core.processMissed(Core.refreshAutoExamDate(state)));
      if(JSON.stringify(next)!==JSON.stringify(state))store.save(next);
      state=store.state;
    }
    if(!dialogs.active&&!settingsDirty)render();
  }catch(failure){banner(failure.message);}
}
function tick(){
  if(!store||!state?.onboardingCompleted||document.hidden||store.pending)return;
  try{
    const previous=state.timer;store.load();state=store.state;
    const synced=Core.syncTimer(state);
    if(state.timer&&!synced.timer){
      try{store.finish(Math.min(Date.now(),state.timer.until));state=store.state;toast('本轮完成，起身活动一下吧');}
      catch(failure){render();banner(failure.message);return;}
    }
    if(page==='focus'&&!dialogs.active){
      if(previous?.id!==state.timer?.id||previous?.running!==state.timer?.running){render();}
      const display=document.querySelector('#clock');
      if(display)display.textContent=clock(state.timer?Core.syncTimer(state).timer?.remaining??0:focusDuration);
    }
    if(previous&&!state.timer&&!dialogs.active&&!settingsDirty)render();
    if(state.lastProcessedDate!==today())reconcile();
  }catch(failure){banner(failure.message);}
}
window.Qingzhou={
  nativeEvent(type,value){
    if(type==='resume')reconcile();
    else if(type==='focus'){reconcile();void navigate('focus');}
    else if(type==='import')void importBackup(value);
    else if(type==='error'||type==='serviceError')banner(value);
    else if(type==='toast')toast(value);
  },
  back(){
    if(dialogs.active){dialogs.requestClose();return true;}
    if(page!=='home'){void navigate('home');return true;}
    return false;
  }
};
if(['127.0.0.1','localhost'].includes(location.hostname))window.QingzhouTest={getState:()=>state,getStore:()=>store,reconcile,navigate,render,tick,dialogs,startTask};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconcile();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!dialogs.active&&page!=='home'){event.preventDefault();void navigate('home');}});
render();if(state)reconcile();interval=setInterval(tick,1000);
