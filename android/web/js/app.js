import * as Core from '../lib/qz/engine.js';
import * as Features from '../lib/qz/features.js';
import * as Views from './views.js';
import {patchHTML,animateIn,animateResize} from './dom.js';
import { activeSubjects, activeTopics, activeGroups } from '../lib/qz/curriculum.js';
import { Store, createBackend, makeBackup, parseBackup, bytes, MAX_BYTES } from './store.js';
import { escapeHTML as e, icon, boat, toast, Dialogs, bindTaskGestures } from './ui.js';

const root=document.querySelector('#app'),dialogs=new Dialogs();
const titles={home:'今天，也向前一步',plan:'把这一周安排好',focus:'专心眼前这一件事',progress:'看见每一步积累',settings:'找到自己的节奏',records:'每一份努力都有迹可循',summary:'给下周，多一点从容'};
const labels={home:'首页',plan:'学习计划',focus:'专注空间',progress:'学习进度',settings:'设置',records:'学习记录',summary:'本周小结'};
const navs=['home','plan','focus','progress','settings'];
const today=()=>Core.dateKey();
const duration=seconds=>Core.formatDuration(Math.max(0,seconds));
const version=()=>globalThis.QingzhouAndroid?.version?.()||'1.1.0';
let store,state,error='',page='home',week=Core.monday(today()),settingsDirty=false;
let query='',expanded=new Set(),beforeSearch=null,weakOnly=false,focusSubject='math',focusDuration=1500;
let renderedPage=null;
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
  if(readonly)return '<div class="original-task"><strong>'+e(task.title)+'</strong><small>'+e(task.date)+' · '+e(label)+' · '+task.minutes+' 分钟'+(task.kind==='review'?' · 查漏回顾':'')+'</small></div>';
  return '<div class="task-swipe"><span class="swipe-label">'+(done?'撤销完成':'完成')+'</span><div class="task-row '+(done?'completed':'')+'" data-id="'+e(task.id)+'" tabindex="0"><div class="task-copy"><strong>'+e(task.title)+'</strong>'+(page==='plan'&&!done?'<button class="task-edit" data-edit="'+e(task.id)+'" aria-label="编辑任务：'+e(task.title)+'">编辑</button>':'')+'<small>'+e(label)+'<span> · </span>'+task.minutes+' 分钟'+(task.kind==='review'?' · 查漏回顾':'')+'</small></div>'+(done?'<span class="done-label">'+icon('check',16)+'已完成</span>':task.suspended?'<span class="pill">已暂停</span>':task.queued?'<span class="pill">待安排</span>':'<button class="start-button" data-start="'+e(task.id)+'" aria-label="开始学习：'+e(task.title)+'">开始</button>')+'</div></div>';
}
function home(){return Views.home({state,today:today(),name,taskHTML,pending:store.pending});}
function plan(){return Views.plan({state,today:today(),week,taskHTML});}
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
function progress(){return Views.progress({state,query,expanded,weakOnly});}
function summary(){return Views.summary({state,week,name});}
function settings(){
  const s=state.settings,days=[1,2,3,4,5,6,0];
  return '<form id="settings-form"><section class="card"><h2>基本设置</h2><label class="field-label" for="name">称呼</label><input id="name" name="name" maxlength="40" value="'+e(s.name)+'"><div class="label-row"><label class="field-label" for="exam-date">目标初试日</label><span id="exam-mode" class="pill">'+(s.examDateMode==='auto'?'自动':'手动')+'</span></div><input type="date" name="examDate" id="exam-date" value="'+s.examDate+'"><input type="hidden" name="examDateMode" value="'+s.examDateMode+'"><button type="button" class="text-button date-reset" data-action="auto-date">恢复自动日期</button><p class="help">自动日期最早为 2027-12-20，过期后切换至下一年。它是规划日期，请以官方考试公告为准。</p><label class="field-label" for="daily-hours">每日学习时间</label><div class="hours-input"><input type="number" id="daily-hours" name="dailyHours" min="0.5" max="16" step="0.5" value="'+s.dailyHours+'"><span>小时 / 天</span></div></section>'+
  '<section class="card"><h2>考试科目</h2>'+examFields(s)+'</section><section class="card"><h2>每周学习日</h2><div class="week-options">'+days.map(day=>'<label><input type="checkbox" name="studyDays" value="'+day+'" '+(s.studyDays.includes(day)?'checked':'')+'><span>周'+['日','一','二','三','四','五','六'][day]+'</span></label>').join('')+'</div><p class="help">关闭的日期不安排未完成任务；修改后会重建本周默认计划。</p></section><button type="submit" class="button primary wide save-settings">保存设置</button></form>'+
  '<section class="card"><h2>记录与备份</h2><button class="setting-row" data-action="export"><span>'+icon('history',20)+'导出完整备份</span>'+icon('arrow',16)+'</button><button class="setting-row" data-action="import"><span>'+icon('book',20)+'导入安卓版备份</span>'+icon('arrow',16)+'</button><p class="help">包含计划、掌握程度和学习记录，导入前会再次确认。</p></section>'+
  '<section class="card"><h2>自动恢复</h2><button class="setting-row" data-action="recovery-list"><span>'+icon('history',20)+'查看本机恢复点</span>'+icon('arrow',16)+'</button><p class="help">升级和重要替换操作前自动保留，最多5份；完整备份仍可另存。</p></section>'+
  '<section class="card"><h2>联系我们</h2><p class="developer">轻舟项目开发者</p><p class="email">2024304827@aust.edu.cn</p><div class="actions">'+action('复制邮箱','copy-email')+action('发送邮件','contact')+'</div></section>'+
  '<button class="version-row" data-action="releases">轻舟 Android '+e(version())+' · 查看发布版本 '+icon('arrow',14)+'</button><input type="file" id="backup-file" accept=".json,application/json" hidden>';
}
function examFields(s){
  return '<fieldset><legend>数学</legend><div class="choices">'+[['math2','数学二'],['math1','数学一']].map(([value,label])=>'<label><input type="radio" name="mathExam" value="'+value+'" '+(s.mathExam===value?'checked':'')+'><span>'+label+'</span></label>').join('')+'</div></fieldset>'+
  '<fieldset><legend>英语</legend><div class="choices">'+[['english2','英语二'],['english1','英语一']].map(([value,label])=>'<label><input type="radio" name="englishExam" value="'+value+'" '+(s.englishExam===value?'checked':'')+'><span>'+label+'</span></label>').join('')+'</div></fieldset>'+
  '<fieldset><legend>政治计划</legend><div class="choices politics-choices">'+[['off','不安排'],['light','轻度'],['full','全量']].map(([value,label])=>'<label><input type="radio" name="politicsMode" value="'+value+'" '+(s.politicsMode===value?'checked':'')+'><span>'+label+'</span></label>').join('')+'</div><p class="help">早期可轻度熟悉，考前约 5–6 个月考虑系统复习，最后约 3 个月加强回顾。这是可调整的规划建议。</p></fieldset>';
}
function records(){return Views.records({state,filter:recordsFilter,name});}
function onboarding(){
  return '<main class="welcome"><div class="welcome-mark">'+boat+'</div><span class="eyebrow">QINGZHOU · 轻舟</span><h1>让备考，轻一点</h1><p class="welcome-copy">选好方向，把大目标<br>拆成每天踏实的小进步。</p><form id="onboarding-form"><section class="card">'+examFields(state.settings)+'</section><div class="welcome-defaults"><span>'+icon('focus',17)+' 每天 4 小时</span><span>'+icon('plan',17)+' 每周七天</span><p>目标初试规划日：'+e(state.settings.examDate)+'<br>之后都可以在设置中修改</p></div><button class="button primary wide" type="submit">生成本周计划，开始使用 '+icon('arrow',18)+'</button></form><p class="welcome-foot">不必完美开始，先出发就很好。</p></main>';
}
function recovery(){
  root.innerHTML='<main class="recovery"><div class="welcome-mark">'+boat+'</div><h1>先保护好你的记录</h1><p>现有记录暂时无法读取，应用没有用空白记录覆盖它。</p><div class="error-panel">'+e(error)+'</div><button class="button primary wide" data-action="recovery-list">查看本机恢复点</button><button class="button secondary wide" data-action="retry-load">重新读取</button><button class="button secondary wide" data-action="export-raw">导出原始记录</button><button class="button secondary wide" data-action="import">导入有效备份</button><input type="file" id="backup-file" accept=".json,application/json" hidden></main>';bindBackupInput();
}
function render(){
  try{document.documentElement.dataset.motion=globalThis.QingzhouAndroid?.reducedMotion?.()?'off':'on';}catch{}
  document.documentElement.dataset.theme=(globalThis.QingzhouAndroid?.darkMode?.()??matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
  const changedPage=renderedPage!==page;renderedPage=page;
  if(!state){recovery();return;}
  if(!state.onboardingCompleted){root.innerHTML=onboarding();root.querySelector('#onboarding-form').onsubmit=startOnboarding;return;}
  const savedScroll=window.scrollY;
  patchHTML(root,'<div class="app-shell" data-view="'+page+'">'+header()+'<main class="page" id="main"><div class="error-panel" id="page-error" role="alert" '+(!error?'hidden':'')+'>'+e(error)+'</div>'+({home,plan,focus,progress,settings,records,summary}[page]||home)()+'</main>'+navigation()+'</div>');
  if(changedPage)animateIn(document.querySelector('main'));
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
function commit(command,message='已保存',{rerender=true,reason='daily'}={}){
  try{store.update(command,{reason});state=store.state;clearError();if(rerender&&!dialogs.active)render();if(message)toast(message);return true;}
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
  if(ok){globalThis.QingzhouAndroid?.feedback?.();animateIn(root.querySelector('.task-row[data-id="'+CSS.escape(id)+'"] .done-label'));toast(completed?'已完成，继续保持':'已撤销完成');}
}
function startTask(id){
  const task=state.tasks.find(t=>t.id===id);
  if(!task||task.done||task.queued||task.suspended)return;
  focusSubject=state.timer?.subject||task.subject;
  if(!state.timer&&!focusCommand('start',{subject:task.subject,taskId:task.id,duration:focusDuration}))return;
    page='focus';render();requestAnimationFrame(()=>window.scrollTo(0,0));
}
async function generate(){
  if(await confirmPlan({type:'generate'},state.defaultWeek?.week===Core.monday(today())?'重新安排本周？':'生成本周计划？')){week=Core.monday(today());page='plan';render();}
}
function taskMenu(id){
  const task=state.tasks.find(t=>t.id===id);if(!task||task.done)return;
  const handle=dialogs.open({title:'编辑任务',subtitle:task.title,className:'compact',body:'<div class="menu-actions"><button data-menu="edit">修改内容、日期和时长</button><button data-menu="delay">顺延到下个学习日</button>'+(task.origin==='auto'?'<button data-menu="course">整门课程顺延</button>'+(task.topicId?'<button data-menu="pause">永久暂停知识点</button>':''):'<button class="danger-text" data-menu="delete">删除自加任务</button>')+'<button data-menu="reason">填写未完成原因</button>'+'</div>',footer:'<button class="button secondary wide cancel">取消</button>'});
  handle.element.querySelector('.cancel').onclick=()=>handle.close();
  handle.element.querySelectorAll('[data-menu]').forEach(button=>button.onclick=async()=>{
    const type=button.dataset.menu;
    if(type==='edit'){handle.close();taskForm(task);return;}
    if(type==='reason'){handle.close();missReasonForm(task);return;}
    if((type==='pause'||type==='delete')&&!await dialogs.confirm({title:type==='pause'?'永久暂停这个知识点？':'删除自加任务？',body:type==='pause'?'恢复前不会自动安排，可以在计划页恢复。':'该自加任务将被删除，不影响其他学习记录。',confirm:type==='pause'?'确认暂停':'确认删除',danger:true}))return;
    const ok=type==='course'?await confirmPlan({type:'course',id},'整门课程顺延？'):planCommand({type,id});
    if(ok){handle.close();render();}
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
    const command=task?{type:'edit',id:task.id,fields}:{type:'add',fields};
    if(planCommand(command)){dirty=false;handle.close();render();}
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
  const snapshot=state.weeklyPlans?.[week]||state.defaultWeek;if(!snapshot||snapshot.week!==week)return;
  const handle=dialogs.open({title:'本周原版计划',subtitle:'只读查看，日常编辑不会改写此快照',body:snapshot.tasks.length?snapshot.tasks.map(t=>taskHTML(t,true)).join(''):empty('这一周没有默认任务'),footer:week===Core.monday(today())?'<button class="button secondary wide restore-default">恢复默认计划</button>':''});
  handle.element.querySelector('.restore-default')?.addEventListener('click',async()=>{
    if(await confirmPlan({type:'restore'},'恢复本周默认计划？','default')){handle.close();render();}
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
    store.save(candidate,store.backend.read(),'import');state=store.state;settingsDirty=false;page='home';clearError();render();toast('备份已恢复');
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
    case 'summary':return navigate('summary');
    case 'manual-session':return manualSessionForm();
    case 'toggle-weak':weakOnly=!weakOnly;render();break;
    case 'weak-list':weakOnly=true;query='';return navigate('progress');
    case 'adjustments':return adjustmentPanel();
    case 'undo-plan':return undoLast();
    case 'recovery-list':return recoveryPanel();
    case 'retry-load':try{store=new Store(createBackend());state=store.state;clearError();render();reconcile();}catch(error){banner(error.message);}break;
    case 'start-focus':focusSubject=document.querySelector('#focus-subject')?.value||focusSubject;focusCommand('start',{subject:focusSubject,duration:focusDuration});break;
    case 'pause':focusCommand('pause');break;
    case 'resume':focusCommand('resume');break;
    case 'end':return endFocus();
    case 'cancel-focus':if(await dialogs.confirm({title:'放弃本轮专注？',body:'这次计时不会写入学习记录。',confirm:'放弃本轮',danger:true}))focusCommand('cancel');break;
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
  if(button.dataset.resume)return void planCommand({type:'resume',id:button.dataset.resume});
  if(button.dataset.topicInfo)return topicInfo(button.dataset.topicInfo);
  if(button.dataset.sessionEdit)return manualSessionForm(button.dataset.sessionEdit);
  if(button.dataset.expand){const id=button.dataset.expand,before=document.querySelector('#subject-'+CSS.escape(id))?.getBoundingClientRect().height||0;if(expanded.has(id))expanded.delete(id);else expanded.add(id);render();animateResize(document.querySelector('#subject-'+CSS.escape(id)),before);return;}
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
  refreshNativePending();
  if(!store||store.pending)return;
  try{
    store.load();state=store.state;
    if(store.pending){if(!dialogs.active&&!settingsDirty)render();return;}
    if(store.raw&&JSON.parse(store.raw).schemaVersion===1){store.save(state);state=store.state;}
    if(state.onboardingCompleted){
      let next=Features.reconcile(state);
      if(!store.backend.focus)next=Core.syncTimer(next);
      if(JSON.stringify(next)!==JSON.stringify(state))store.save(next);
      state=store.state;
    }
    if(!dialogs.active&&!settingsDirty)render();
  }catch(failure){banner(failure.message);}
}
function tick(){
  refreshNativePending();
  if(!store||!state?.onboardingCompleted||document.hidden||store.pending)return;
  try{
    const previous=state.timer;store.load();state=store.state;
    if(store.pending){if(!dialogs.active&&!settingsDirty)render();return;}
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
    if(type==='appearance'){document.documentElement.dataset.theme=(globalThis.QingzhouAndroid?.darkMode?.()??matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';document.documentElement.dataset.motion=globalThis.QingzhouAndroid?.reducedMotion?.()?'off':'on';return;}
    if(type==='resume')reconcile();
    else if(type==='widgetStart'){reconcile();if(dialogs.active||settingsDirty){toast('先保存或关闭当前编辑，再开始专注');return;}const task=state?.tasks.find(t=>t.date===today()&&!t.done&&!t.queued&&!t.suspended);if(state?.timer)void navigate('focus');else if(task)startTask(task.id);else if(state?.onboardingCompleted)void navigate('plan');}
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
if(['127.0.0.1','localhost'].includes(location.hostname)||globalThis.QingzhouAndroid?.isDebugBuild?.())window.QingzhouTest={getState:()=>state,getStore:()=>store,reconcile,navigate,render,tick,dialogs,startTask};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconcile();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!dialogs.active&&page!=='home'){event.preventDefault();void navigate('home');}});
render();if(state)reconcile();interval=setInterval(tick,1000);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>window.Qingzhou.nativeEvent('appearance'));

function refreshNativePending(){if(store?.pending?.native)try{store.load();state=store.state;if(!store.pending&&!dialogs.active&&!settingsDirty){render();toast('本轮专注记录已保存');}}catch(error){banner(error.message);}}

function planCommand(command){const ok=commit(base=>Features.evaluatePlan(base,{command}).state,'');if(ok)toast('安排已更新',false,()=>undoLast());return ok;}
function undoLast(){let skipped=0;const ok=commit(base=>{const result=Features.undoPlan(base);skipped=result.skipped;return result.state;},'');if(ok)toast(skipped?'已撤销可恢复的修改，保留 '+skipped+' 项已完成或已变化内容':'已撤销上次调整');}
async function confirmPlan(command,title,reason='daily'){
  try{store.load();if(store.pending)throw new Error('请先保存上一轮专注结果。');const expected=store.raw,result=Features.evaluatePlan(store.state,{command});
    return await new Promise(resolve=>{const changes=result.changes;
      const handle=dialogs.open({title,subtitle:changes.length+' 项安排将变化；已完成和明确安排按规则保留',body:changes.length?'<div class="change-list">'+changes.map(c=>'<article><strong>'+e(c.title)+'</strong><small>'+e(({added:'新增',removed:'移除',paused:'永久暂停',resumed:'恢复',moved:'顺延',edited:'修改'}[c.type]))+' · '+e(c.from||'新任务')+' → '+e(c.queued?'待安排':c.to||'移除')+'</small>'+(c.reason?'<small>'+e(c.reason)+'</small>':'')+'</article>').join('')+'</div>':'<p class="confirm-copy">当前安排无需变化。</p>',footer:'<button class="button secondary cancel">取消</button><button class="button primary confirm">确认调整</button>',onClose:()=>{handle.close();resolve(false);}});
      handle.element.querySelector('.cancel').onclick=()=>{handle.close();resolve(false);};handle.element.querySelector('.confirm').onclick=()=>{try{store.save(result.state,expected,reason);state=store.state;handle.close();render();toast('安排已更新',false,()=>undoLast());resolve(true);}catch(error){dialogs.error(handle,error.message+' 如记录已变化，请返回后重新核对。');}};
    });
  }catch(error){banner(error.message);return false;}
}
function adjustmentPanel(){
  const list=state.adjustments.filter(a=>Core.monday(a.date)===week).slice().reverse();const handle=dialogs.open({title:'计划调整',subtitle:'手动操作和系统漏学顺延的来源与结果',body:list.length?list.map(a=>'<article class="adjustment-item"><strong>'+e(a.label)+'</strong><small>'+a.date+' · '+(a.source==='system'?'系统自动处理':'你的操作')+'</small>'+a.changes.map(c=>'<p>'+e(c.title)+'<span>'+e(c.from||'新增')+' → '+e(c.queued?'待安排':c.to||'移除')+'</span></p>').join('')+'</article>').join(''):empty('本周还没有调整记录'),footer:state.lastUndo?'<button class="button secondary wide undo-last">撤销上次调整</button>':''});
  handle.element.querySelector('.undo-last')?.addEventListener('click',()=>{undoLast();handle.close();render();});
}
function focusCommand(action,fields={}){
  try{if(store.backend.focus){store.focus(action,{...(state.timer&&action!=='start'?{id:state.timer.id}:{}),...fields});state=store.state;clearError();if(!dialogs.active&&!settingsDirty)render();return true;}
    const commands={start:s=>Core.startTimer(s,fields.subject,fields.duration),pause:Core.pauseTimer,resume:Core.resumeTimer,cancel:Core.cancelTimer};if(!commands[action])throw new Error('当前操作不可用');return commit(commands[action],'');
  }catch(error){try{store.load();state=store.state;}catch{}if(!dialogs.active&&!settingsDirty)render();banner(error.message);return false;}
}
function protectForm(handle,form){let dirty=false;form.addEventListener('input',()=>dirty=true);form.addEventListener('change',()=>dirty=true);handle.onClose=async()=>{if(!dirty||await dialogs.confirm({title:'放弃这次修改？',body:'未保存的内容会被放弃。',confirm:'放弃修改'}))handle.close();};return()=>dirty=false;}
function topicInfo(id){
  const topic=Core.topicById[id];if(!topic)return;const weak=state.weakPoints[id],subject=Core.subjectById[topic.subject];
  const handle=dialogs.open({title:topic.title,subtitle:subject.name+' · '+subject.chapters.find(c=>c.id===topic.chapter)?.title,body:'<p class="field-label">掌握程度 · 与任务打卡独立</p><div class="mastery-choices">'+Core.LEVELS.map((label,level)=>'<button class="filter-pill '+((state.progress[id]?.level||0)===level?'selected':'')+'" data-choice="'+level+'">'+label+'</button>').join('')+'</div>'+(weak&&weak.status!=='resolved'?'<div class="weak-detail"><strong>'+(weak.status==='awaiting'?'这次回顾完成了，感觉如何？':'需要再看')+'</strong><p>'+e(weak.reason||'尚未填写原因')+'</p><small>'+weak.dueDate+' 回顾</small></div>':'<p class="help">记下哪里还不熟，下次回顾时更有方向。</p>'),footer:'<button class="button secondary mark-weak">'+(weak?.status==='awaiting'?'仍需再看':weak&&weak.status!=='resolved'?'修改回顾':'需要再看')+'</button>'+(weak&&weak.status!=='resolved'?'<button class="button primary '+(weak.status==='awaiting'?'resolve-weak':'schedule-review')+'">'+(weak.status==='awaiting'?'已解决':'加入计划')+'</button>':'')});
  handle.element.querySelectorAll('[data-choice]').forEach(button=>button.onclick=()=>{if(commit(base=>Core.setLevel(base,id,Number(button.dataset.choice)),'掌握程度已保存',{rerender:false})){handle.element.querySelectorAll('[data-choice]').forEach(b=>b.classList.toggle('selected',b===button));render();}});
  handle.element.querySelector('.mark-weak').onclick=()=>{handle.close();weakForm(id);};handle.element.querySelector('.schedule-review')?.addEventListener('click',()=>{if(planCommand({type:'review',id})){handle.close();render();}});handle.element.querySelector('.resolve-weak')?.addEventListener('click',()=>{if(commit(base=>Features.resolveWeak(base,id),'这一步已经踏实了')){handle.close();render();}});
}
function weakForm(id){
  const old=state.weakPoints[id],due=old?.status==='open'?old.dueDate:Core.addDays(today(),7);const handle=dialogs.open({title:old?.status==='awaiting'?'安排下一次回顾':'需要再看',subtitle:Core.topicById[id].title,body:'<form id="weak-form"><label class="field-label" for="weak-reason">哪里还不熟（选填）</label><textarea id="weak-reason" name="reason" maxlength="500" rows="4" placeholder="例如：链表逆置还不熟，下次动手再写一遍">'+e(old?.reason||'')+'</textarea><label class="field-label" for="weak-date">下次回顾日期</label><input id="weak-date" name="dueDate" type="date" required value="'+due+'"><p class="help">标记不会改变掌握程度。你可以主动加入计划，也会在重新安排时优先考虑。</p></form>',footer:'<button class="button primary wide save-weak">保存回顾</button>'});
  const form=handle.element.querySelector('form'),clean=protectForm(handle,form);const save=()=>{if(!form.reportValidity())return;if(commit(base=>Features.markWeak(base,id,{reason:form.elements.reason.value,dueDate:form.elements.dueDate.value}),'回顾已记下')){clean();handle.close();render();}};handle.element.querySelector('.save-weak').onclick=save;form.onsubmit=event=>{event.preventDefault();save();};
}
function missReasonForm(task){
  const handle=dialogs.open({title:'未完成原因',subtitle:'只供你回看，不影响顺延，也不是必填',body:'<form id="reason-form"><fieldset><legend>'+e(task.title)+'</legend><div class="reason-options">'+['',...Features.REASONS].map(reason=>'<label><input type="radio" name="reason" value="'+reason+'" '+((task.missReason||'')===reason?'checked':'')+'><span>'+e(reason||'暂不填写')+'</span></label>').join('')+'</div></fieldset></form>',footer:'<button class="button primary wide save-reason">保存</button>'});
  const form=handle.element.querySelector('form'),clean=protectForm(handle,form);handle.element.querySelector('.save-reason').onclick=()=>{const reason=new FormData(form).get('reason');if(commit(base=>Features.setMissReason(base,task.id,reason),'原因已保存')){clean();handle.close();render();}};
}
function manualSessionForm(id=null){
  const old=id?state.sessions.find(s=>s.id===id):null;if(id&&old?.source!=='manual')return;const handle=dialogs.open({title:old?'编辑手动补记':'手动补记专注',subtitle:'按实际投入填写，补记会单独标注',body:'<form id="manual-session-form"><label class="field-label">课程</label><select name="subject">'+selectOptions(subjects(),old?.subject||subjects()[0].id)+'</select><div class="form-grid"><label><span class="field-label">日期</span><input type="date" name="date" required max="'+today()+'" value="'+(old?.date||today())+'"></label><label><span class="field-label">时长（分钟）</span><input type="number" name="minutes" inputmode="numeric" required min="1" max="960" value="'+(old?old.seconds/60:'')+'"></label></div><label class="field-label">备注（选填）</label><textarea name="note" maxlength="200" rows="3">'+e(old?.note||'')+'</textarea></form>',footer:(old?'<button class="button danger delete-session">删除补记</button>':'')+'<button class="button primary save-session">保存补记</button>'});
  const form=handle.element.querySelector('form'),clean=protectForm(handle,form);const save=()=>{if(!form.reportValidity())return;const fields=Object.fromEntries(new FormData(form));if(commit(base=>Features.saveManualSession(base,fields,id),'补记已保存')){clean();handle.close();render();}};handle.element.querySelector('.save-session').onclick=save;form.onsubmit=event=>{event.preventDefault();save();};handle.element.querySelector('.delete-session')?.addEventListener('click',async()=>{if(await dialogs.confirm({title:'删除这条手动补记？',body:'只删除这条补记，不影响计时产生的记录。',confirm:'确认删除',danger:true})&&commit(base=>Features.deleteManualSession(base,id),'补记已删除')){clean();handle.close();render();}});
}
function recoveryPanel(){
  try{const native=globalThis.QingzhouAndroid,reply=native?.recoveryList?JSON.parse(native.recoveryList()):{ok:true,items:[]};if(!reply.ok)throw new Error(reply.message);const handle=dialogs.open({title:'本机自动恢复点',subtitle:'最多保留最近5份有效记录。恢复将替换当前学习记录。',body:reply.items.length?reply.items.map(item=>'<button class="recovery-item" data-recovery="'+e(item.id)+'"><strong>'+e(new Date(item.createdAt).toLocaleString('zh-CN'))+'</strong><small>'+e(item.version)+' · '+e(({daily:'每日自动保留',import:'导入前',restore:'恢复前',default:'恢复默认前'}[item.reason]||item.reason))+'</small><p>'+item.tasks+' 项任务 · '+item.sessions+' 条专注记录</p></button>').join(''):empty('还没有自动恢复点','首次有效记录保存后，会在每日修改或重要替换前保留'),footer:'<button class="button secondary wide close-recovery">返回</button>'});
    handle.element.querySelector('.close-recovery').onclick=()=>handle.close();handle.element.querySelectorAll('[data-recovery]').forEach(button=>button.onclick=async()=>{try{const entry=JSON.parse(native.recoveryRead(button.dataset.recovery));if(!entry.ok)throw new Error(entry.message);const candidate=Core.validateState(JSON.parse(entry.raw));if(!await dialogs.confirm({title:'恢复到这个时间点？',body:'将恢复 '+candidate.tasks.length+' 项任务和 '+candidate.sessions.length+' 条专注记录。当前有效记录会先自动保留，时间点之后的修改将被替换。',confirm:'确认恢复'}))return;
      if(!store){store=Object.create(Store.prototype);store.backend=createBackend();store.raw=store.backend.read();store.pending=null;}store.save(candidate,store.backend.read(),'restore');state=store.state;settingsDirty=false;page='home';handle.close();clearError();render();reconcile();toast('记录已恢复');}catch(error){dialogs.error(handle,error.message);}});
  }catch(error){banner(error.message||'读取恢复点失败');}
}
