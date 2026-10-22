import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile,writeFile,mkdir,access } from 'node:fs/promises';
import { resolve,dirname,extname,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const source=resolve(dirname(fileURLToPath(import.meta.url)),'..'),archive=resolve(source,'..');
const web=resolve(source,'web'),out=resolve(archive,'验收记录'),profile=resolve(archive,'构建缓存','界面验收浏览器');
await mkdir(profile,{recursive:true});await mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    const path=resolve(web,'.'+(pathname==='/'?'/index.html':pathname));
    if(!path.startsWith(web+sep)){res.writeHead(403);res.end();return;}
    const data=await readFile(path);
    res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[extname(path)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url='http://127.0.0.1:'+server.address().port;
const browser='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const child=spawn(browser,['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-breakpad','--crash-dumps-dir='+resolve(profile,'crashes'),'about:blank'],{windowsHide:true,stdio:'ignore',env:{...process.env,TEMP:resolve(archive,'构建缓存','temp'),TMP:resolve(archive,'构建缓存','temp')}});
let socket,sequence=0;const pending=new Map(),runtimeErrors=[],checks=[];
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function waitFor(fn,message,ms=12000){const until=Date.now()+ms;while(Date.now()<until){try{const result=await fn();if(result)return result;}catch{}await sleep(80);}throw new Error('等待失败：'+message);}
function send(method,params={}){
  const id=++sequence;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},15000);
    pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
  if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);
  return response.result?.value;
}
async function test(name,operation){await operation();checks.push({name,result:'pass'});console.log('PASS '+name);}
async function click(selector){
  const box=await evaluate('(()=>{const x=document.querySelector('+JSON.stringify(selector)+');if(!x)throw new Error("missing element");x.scrollIntoView({block:"center",behavior:"instant"});const r=x.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()');
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...box});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box});
  await sleep(100);
}
async function input(selector,value){
  await evaluate('(()=>{const x=document.querySelector('+JSON.stringify(selector)+');x.value='+JSON.stringify(value)+';x.dispatchEvent(new Event("input",{bubbles:true}));x.dispatchEvent(new Event("change",{bubbles:true}));})()');await sleep(80);
}
async function shot(name){
  await sleep(100);
  const response=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(resolve(out,name+'.png'),Buffer.from(response.data,'base64'));
}
async function state(){return evaluate('QingzhouTest.getState()');}
async function page(name){await evaluate('QingzhouTest.navigate('+JSON.stringify(name)+')');await sleep(120);}
async function swipe(id){
  const box=await evaluate('(()=>{const x=document.querySelector(".task-row[data-id='+id+']");x.scrollIntoView({block:"center"});const r=x.getBoundingClientRect();return {x:r.left+22,y:r.top+r.height/2};})()');
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...box,id:1}]});
  for(const distance of [15,40,65,90]){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+distance,y:box.y+2,id:1}]});await sleep(25);}
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(150);
}
try{
  const portFile=resolve(profile,'DevToolsActivePort');
  await waitFor(async()=>{await access(portFile);return true;},'浏览器启动',20000);
  const target=await waitFor(async()=>{const port=(await readFile(portFile,'utf8')).split('\n')[0];return (await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'})).json();},'浏览器调试端口',20000);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.id){const handler=pending.get(message.id);if(handler){pending.delete(message.id);message.error?handler.reject(new Error(message.error.message)):handler.resolve(message.result);}}
    else if(message.method==='Runtime.exceptionThrown')runtimeErrors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
  };
  await send('Page.enable');await send('Runtime.enable');await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const bridgeSource=[
    'window.__failSave=false;',
    'window.QingzhouAndroid={',
    'readState(){const raw=localStorage.getItem("native-record");return JSON.stringify({ok:true,exists:raw!==null,raw});},',
    'saveState(value,expected){if(window.__failSave)return JSON.stringify({ok:false,message:"测试保存失败"});if(localStorage.getItem("native-record")!==expected)return JSON.stringify({ok:false,message:"测试冲突"});localStorage.setItem("native-record",value);return JSON.stringify({ok:true});},',
    'version(){return "1.2.0"},feedback(){},copyEmail(){},openContact(){},openReleases(){},exportBackup(raw){window.__exported=raw;},importBackup(){},recoveryList(){return JSON.stringify({ok:true,items:[]});},',
    'notificationStatus(){return JSON.stringify({ok:true,notifications:!!window.__notify,focusNotifications:!!window.__notify,exact:!!window.__exact,asked:true});},requestNotifications(){window.__notify=true;Qingzhou.nativeEvent("notifications");},requestExactReminders(){window.__exact=true;Qingzhou.nativeEvent("notifications");},testNotification(){return JSON.stringify(window.__notify?{ok:true}:{ok:false,message:"请先开启学习提醒通知"});},',
    '};'
  ].join('\n');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:bridgeSource});
  await send('Page.navigate',{url});
  await waitFor(()=>evaluate('!!window.QingzhouTest'),'应用载入');
  await evaluate('localStorage.clear();location.reload()');
  await waitFor(()=>evaluate('!!document.querySelector("#onboarding-form")'),'首次引导');
  await test('首次引导独立显示，确认后生成计划',async()=>{
    assert.equal(await evaluate('localStorage.getItem("native-record")'),null);
    assert.equal(await evaluate('document.querySelectorAll(".bottom-nav").length'),0);
    await shot('UI-首次引导');
    await click('#onboarding-form button[type=submit]');await click('dialog .confirm');
    await waitFor(()=>evaluate('!!document.querySelector(".bottom-nav")'),'进入首页');
    assert.equal((await state()).onboardingCompleted,true);assert.ok((await state()).tasks.length>0);
    await shot('UI-首页');
  });
  await test('保存后关闭页面重开仍跳过引导并保留原记录',async()=>{
    const old=await state();await evaluate('location.reload()');
    await waitFor(()=>evaluate('!!document.querySelector(".bottom-nav")'),'已有记录重开');
    assert.deepEqual(await state(),old);assert.equal(await evaluate('!!document.querySelector("#onboarding-form")'),false);
  });
  let first=(await state()).tasks.find(t=>!t.done&&!t.queued&&!t.suspended);
  await test('首页真实点击开始，正确课程自动计时且倒计时变化',async()=>{
    await click('[data-start="'+first.id+'"]');const initial=(await state()).timer;
    assert.equal(initial.subject,first.subject);assert.equal(initial.running,true);
    await waitFor(()=>evaluate('document.querySelector("#clock").textContent!=="25:00"'),'计时显示变化',5000);
    await shot('UI-专注');await click('[data-action=pause]');assert.equal((await state()).timer.running,false);
    await page('home');await click('[data-start="'+first.id+'"]');assert.equal((await state()).timer.id,initial.id);assert.equal((await state()).timer.running,false);
    await click('[data-action=resume]');assert.equal((await state()).timer.running,true);
    await sleep(1100);await click('[data-action=end]');await click('dialog .confirm');
    assert.equal((await state()).timer,null);assert.ok((await state()).sessions[0].seconds>0);
  });
  await test('右滑完成及撤销，不误触开始按钮',async()=>{
    await page('home');await swipe(first.id);
    assert.equal((await state()).tasks.find(t=>t.id===first.id).done,true);assert.equal((await state()).completions.length,1);
    await shot('UI-已完成');await swipe(first.id);assert.equal((await state()).completions.length,0);
  });
  await test('计划编辑和知识点选择保留自写标题',async()=>{
    await page('plan');await shot('UI-计划');await click('[data-action=add]');
    await input('#task-title','我的网络复习安排');await click('.select-topic');await input('#topic-query','网络综合分析');
    await shot('UI-知识点选择');await click('.picker-topic');
    assert.equal(await evaluate('document.querySelector("#task-title").value'),'我的网络复习安排');
    assert.equal(await evaluate('document.querySelector("#task-subject").value'),'net');assert.equal(await evaluate('document.querySelector("#task-subject").disabled'),true);
    await input('#task-form input[name=minutes]','15');await click('.task-save');
    const custom=(await state()).tasks.find(t=>t.title==='我的网络复习安排');assert.ok(custom);assert.equal(custom.subject,'net');assert.equal(custom.minutes,15);
  });
  await test('进度默认收起，搜索展开和清空恢复',async()=>{
    await page('progress');assert.equal(await evaluate('document.querySelectorAll(".topic-list").length'),0);
    await click('[data-expand=math]');assert.equal(await evaluate('document.querySelectorAll(".topic-list").length'),1);
    await input('#progress-search','网络');assert.ok(await evaluate('document.querySelectorAll(".topic-list").length>0'));
    await input('#progress-search','');assert.equal(await evaluate('document.querySelectorAll(".topic-list").length'),1);
    await shot('UI-进度');await click('[data-level="math-0-0"]');assert.equal((await state()).progress['math-0-0'].level,1);
  });
  await test('设置保存留在当前页，失败保留输入和旧记录',async()=>{
    await page('settings');await shot('UI-设置');await input('#name','安卓验收');await click('.save-settings');
    assert.equal((await state()).settings.name,'安卓验收');assert.ok(await evaluate('!!document.querySelector("#settings-form")'));
    await input('#name','尚未保存的名字');await evaluate('window.__failSave=true');await click('.save-settings');
    assert.equal((await state()).settings.name,'安卓验收');assert.equal(await evaluate('document.querySelector("#name").value'),'尚未保存的名字');
    await evaluate('window.__failSave=false');await click('[data-nav=home]');await click('dialog .cancel');
    assert.equal(await evaluate('document.querySelector("#name").value'),'尚未保存的名字');
    await click('[data-nav=home]');await click('dialog .confirm');
  });
  await test('记录页展示课程、时长，并可筛选',async()=>{
    await page('records');await shot('UI-学习记录');assert.ok(await evaluate('document.querySelector(".history-row").textContent.includes("实际专注")'));
    await click('[data-record-type=task]');assert.equal(await evaluate('document.querySelectorAll(".history-row").length'),0);
    await click('[data-record-type=focus]');assert.ok(await evaluate('document.querySelectorAll(".history-row").length>0'));
  });
  await test('320px 小屏无横向溢出',async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width:320,height:700,deviceScaleFactor:1,mobile:true});
    for(const view of ['home','plan','focus','progress','settings','records']){await page(view);assert.ok(await evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),view+' 横向溢出');}
    await shot('UI-320px小屏');await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:1,mobile:true});
  });
  await test('首页重点操作首屏可见，计划过去日期默认收起',async()=>{
    await page('home');assert.ok(await evaluate('document.querySelector(".hero-start").getBoundingClientRect().bottom<innerHeight-70'));
    assert.equal(await evaluate('document.querySelectorAll(".task-edit").length'),0);await shot('110-首页');
    await page('plan');assert.equal(await evaluate('[...document.querySelectorAll(".past-days")].every(x=>!x.open)'),true);assert.ok(await evaluate('document.querySelectorAll(".task-edit").length>0'));await shot('110-计划');
  });
  await test('顺延后撤销保留期间新增的完成记录',async()=>{
    const before=await state(),task=before.tasks.find(t=>!t.done&&!t.queued&&!t.suspended&&t.date===before.lastProcessedDate),other=before.tasks.find(t=>t.id!==task.id&&!t.done&&!t.queued&&!t.suspended&&t.date===before.lastProcessedDate);
    assert.ok(task&&other);await click('[data-edit="'+task.id+'"]');await click('[data-menu=delay]');
    assert.ok((await state()).tasks.find(t=>t.id===task.id).date>task.date);
    await swipe(other.id);assert.equal((await state()).tasks.find(t=>t.id===other.id).done,true);
    await click('[data-action=undo-plan]');const result=await state();assert.equal(result.tasks.find(t=>t.id===task.id).date,task.date);assert.equal(result.tasks.find(t=>t.id===other.id).done,true);assert.ok(result.completions.some(c=>c.taskId===other.id));
    await shot('110-撤销保留完成');
  });
  await test('重新安排显示影响摘要，取消不写入，确认不改原版',async()=>{
    const before=await state(),raw=JSON.stringify(before),original=JSON.stringify(before.defaultWeek);
    await click('[data-action=generate]');assert.ok(await evaluate('!!document.querySelector("dialog .sheet-body")'));await shot('110-影响摘要');await click('dialog .cancel');assert.equal(JSON.stringify(await state()),raw);
    await click('[data-action=generate]');await click('dialog .confirm');assert.equal(JSON.stringify((await state()).defaultWeek),original);
  });
  await test('原版为只读，恢复默认摘要可以返回',async()=>{
    await click('[data-action=original]');assert.equal(await evaluate('document.querySelectorAll("dialog .task-edit").length'),0);
    await click('.restore-default');await click('dialog:last-of-type .cancel');assert.ok(await evaluate('!!document.querySelector(".restore-default")'));await click('dialog .close');
  });
  await test('新增查漏保留输入，后台返回不会丢表单',async()=>{
    await page('progress');await input('#progress-search','函数与基本初等函数');await click('[data-topic-info="math-0-0"]');await click('.mark-weak');await input('#weak-reason','定义还没记牢，下次自己复述');
    await evaluate('Qingzhou.nativeEvent("resume")');assert.equal(await evaluate('document.querySelector("#weak-reason").value'),'定义还没记牢，下次自己复述');
    await click('dialog .close');await click('dialog:last-of-type .cancel');assert.equal(await evaluate('document.querySelector("#weak-reason").value'),'定义还没记牢，下次自己复述');
    await input('#weak-date',(await state()).lastProcessedDate);await click('.save-weak');assert.equal((await state()).weakPoints['math-0-0'].reason,'定义还没记牢，下次自己复述');
  });
  await test('查漏加入计划不重复，掌握自评不被改变',async()=>{
    const level=(await state()).progress['math-0-0'].level;
    await click('[data-topic-info="math-0-0"]');await click('.schedule-review');await click('[data-topic-info="math-0-0"]');await click('.schedule-review');
    const current=await state();assert.equal(current.tasks.filter(t=>t.reviewKey==='math-0-0:1').length,1);assert.equal(current.progress['math-0-0'].level,level);await input('#progress-search','');await click('[data-action=toggle-weak]');await shot('110-查漏补缺');
  });
  await test('进度搜索保留同一个输入节点和焦点',async()=>{
    await evaluate('window.__inputNode=document.querySelector("#progress-search");window.__inputNode.focus()');await input('#progress-search','函数');assert.equal(await evaluate('document.querySelector("#progress-search")===window.__inputNode'),true);assert.equal(await evaluate('document.activeElement===window.__inputNode'),true);await input('#progress-search','');
  });
  let manualId;
  await test('手动补记进入完整记录与周总结',async()=>{
    await page('records');const initial=(await state()).sessions.reduce((n,s)=>n+s.seconds,0);await click('[data-action=manual-session]');await input('#manual-session-form select[name=subject]','english');await input('#manual-session-form input[name=minutes]','37');await input('#manual-session-form textarea','离线阅读补记');await click('.save-session');
    const current=await state(),manual=current.sessions.find(s=>s.note==='离线阅读补记');assert.ok(manual);manualId=manual.id;assert.equal(manual.source,'manual');assert.equal(current.sessions.reduce((n,s)=>n+s.seconds,0),initial+2220);
    await page('summary');assert.ok(await evaluate('document.querySelector(".summary-hero").textContent.includes("37分")'));await shot('110-周总结');
  });
  await test('手动补记可编辑，取消删除不会丢记录',async()=>{
    await page('records');await click('[data-session-edit="'+manualId+'"]');await input('#manual-session-form input[name=minutes]','40');await click('.save-session');assert.equal((await state()).sessions.find(s=>s.id===manualId).seconds,2400);
    await click('[data-session-edit="'+manualId+'"]');await click('.delete-session');await click('dialog:last-of-type .cancel');assert.ok((await state()).sessions.some(s=>s.id===manualId));await click('dialog .close');
  });
  await test('恢复点入口可退出且不改现有记录',async()=>{
    await page('settings');const before=JSON.stringify(await state());await click('[data-action=recovery-list]');assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("自动恢复点")'));await click('.close-recovery');assert.equal(JSON.stringify(await state()),before);
  });
  await test('深色和减少动画遵循系统，不重建正在输入的表单',async()=>{
    await input('#name','外观切换时保留');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:'reduce'}]});await sleep(100);assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark');assert.equal(await evaluate('document.querySelector("#name").value'),'外观切换时保留');assert.equal(await evaluate('getComputedStyle(document.querySelector(".button")).transitionDuration'),'0s');await shot('110-深色设置');
    await input('#name','安卓验收');await click('.save-settings');await page('home');await shot('110-深色首页');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'no-preference'}]});
  });
  await test('升级页面在320px与大字体布局中不横向溢出',async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width:320,height:700,deviceScaleFactor:1,mobile:true});
    for(const view of ['home','plan','focus','progress','settings','records','summary']){await page(view);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),view+' 横向溢出');}
    await page('home');await evaluate('document.querySelectorAll("h1,h2,strong,small,p,button,span,input").forEach(x=>{x.style.fontSize=parseFloat(getComputedStyle(x).fontSize)*1.5+"px"})');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await shot('110-320px大字体');
    await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:1,mobile:true});
  });
  let todoId,reminderId;
  await test('任务清单随手记，保存失败及后台返回保留输入',async()=>{
    await page('list');await click('[data-action=add-todo]');await input('#todo-title','打印报考材料');await evaluate('window.__failSave=true');await click('.save-todo');
    assert.equal((await state()).todos.length,0);assert.equal(await evaluate('document.querySelector("#todo-title").value'),'打印报考材料');
    await evaluate('Qingzhou.nativeEvent("resume");window.__failSave=false');assert.equal(await evaluate('document.querySelector("#todo-title").value'),'打印报考材料');
    await click('.save-todo');todoId=(await state()).todos[0].id;assert.equal((await state()).todos[0].date,null);
    await click('[data-list-filter=pending]');assert.ok(await evaluate('document.querySelector(".todo-row").textContent.includes("打印报考材料")'));await shot('120-任务清单');
  });
  await test('清单事项完成撤销与删除取消，不改变学习任务',async()=>{
    const count=(await state()).tasks.length;await click('[data-todo-toggle="'+todoId+'"]');assert.equal((await state()).todos[0].done,true);
    await click('[data-list-filter=done]');await click('[data-todo-toggle="'+todoId+'"]');assert.equal((await state()).todos[0].done,false);
    await click('[data-list-filter=pending]');await click('[data-todo-edit="'+todoId+'"]');await click('.delete-todo');await click('dialog:last-of-type .cancel');assert.ok((await state()).todos.some(t=>t.id===todoId));await click('dialog .close');assert.equal((await state()).tasks.length,count);
  });
  await test('固定提醒创建与开关不重复，支持调用通知设置和测试通知',async()=>{
    await page('reminders');assert.ok(await evaluate('document.querySelector(".reminder-intro").textContent.includes("未开启")'));await click('[data-action=notification-permission]');assert.equal(await evaluate('document.querySelector(".reminder-intro").textContent.includes("已开启")'),true);
    await click('[data-action=add-reminder]');await input('#reminder-title','晚间学习');await input('#reminder-time','19:30');await click('.save-reminder');
    reminderId=(await state()).reminders[0].id;assert.equal((await state()).reminders[0].followStudyDays,true);
    await click('[data-reminder-toggle="'+reminderId+'"]');assert.equal((await state()).reminders[0].enabled,false);await click('[data-reminder-toggle="'+reminderId+'"]');assert.equal((await state()).reminders.length,1);
    await click('[data-action=test-notification]');await shot('120-学习提醒');
  });
  await test('提醒编辑取消保留原值，提醒保存失败保留输入',async()=>{
    await click('[data-reminder-edit="'+reminderId+'"]');await input('#reminder-time','20:00');await click('dialog .close');await click('dialog:last-of-type .cancel');assert.equal(await evaluate('document.querySelector("#reminder-time").value'),'20:00');
    await evaluate('window.__failSave=true');await click('.save-reminder');assert.equal((await state()).reminders[0].time,'19:30');assert.equal(await evaluate('document.querySelector("#reminder-time").value'),'20:00');await evaluate('window.__failSave=false');await click('.save-reminder');assert.equal((await state()).reminders[0].time,'20:00');
  });
  await test('学习任务提醒从编辑面板保存，与清单共享完成状态',async()=>{
    const current=await state(),t=current.tasks.find(t=>!t.done&&!t.queued&&!t.suspended&&t.date===current.lastProcessedDate);assert.ok(t);await page('plan');await click('[data-edit="'+t.id+'"]');await click('[data-menu=reminder]');await input('#task-reminder-time','18:45');await click('.save-task-reminder');assert.equal((await state()).taskReminders[t.id],'18:45');await page('list');await swipe(t.id);assert.equal((await state()).tasks.find(x=>x.id===t.id).done,true);await page('home');assert.ok(await evaluate('document.querySelector(".task-row[data-id='+t.id+']").classList.contains("completed")'));await swipe(t.id);
  });
  await test('自定义番茄钟关联具体任务，结束不自动打卡',async()=>{
    const current=await state(),task=current.tasks.find(t=>!t.done&&!t.queued&&!t.suspended&&t.date===current.lastProcessedDate);
    await page('focus');assert.ok(await evaluate('document.querySelector(".focus-start-main").getBoundingClientRect().bottom<innerHeight-70'));await click('#focus-config summary');await input('#focus-task',task.id);await input('#focus-minutes','7');await click('[data-action=start-focus]');assert.equal((await state()).timer.duration,420);assert.equal((await state()).timer.taskId,task.id);
    await sleep(1100);await click('[data-action=end]');await click('dialog .confirm');const after=await state();assert.equal(after.sessions.at(-1).taskId,task.id);assert.equal(after.tasks.find(t=>t.id===task.id).done,false);assert.ok(await evaluate('document.querySelector(".focus-result").textContent.includes("完成这个任务")'));await shot('120-专注结果');
  });
  await test('休息计时支持暂停结束，学习记录和任务完成状态不变化',async()=>{
    const before=await state();await click('[data-action=rest-options]');await click('[data-rest-minutes="10"]');await click('.start-rest');assert.equal((await state()).timer.mode,'break');assert.equal((await state()).timer.duration,600);
    await click('[data-action=pause]');assert.equal((await state()).timer.running,false);await click('[data-action=resume]');await click('[data-action=end]');await click('dialog .confirm');
    const after=await state();assert.deepEqual(after.sessions,before.sessions);assert.deepEqual(after.completions,before.completions);assert.equal(after.lastFocusResult.mode,'break');
  });
  await test('正计时从零开始，暂停返回及结束后保留实际时长',async()=>{
    await click('[data-focus-mode=stopwatch]');await click('#focus-config summary');await input('#focus-task','');await click('[data-action=start-focus]');assert.equal((await state()).timer.mode,'stopwatch');assert.ok(await evaluate('document.querySelector("#clock").textContent.startsWith("00:")'));
    await sleep(1100);await click('[data-action=pause]');const id=(await state()).timer.id;await page('home');await click('.hero-start');assert.equal((await state()).timer.id,id);assert.equal((await state()).timer.running,false);
    await click('[data-action=resume]');await sleep(1100);await click('[data-action=end]');await click('dialog .confirm');assert.equal((await state()).sessions.at(-1).mode,'stopwatch');assert.ok((await state()).sessions.at(-1).seconds>=2);
  });
  await test('新页面小屏、大字体及深色无溢出，减少动画停止计时装饰',async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width:320,height:700,deviceScaleFactor:1,mobile:true});
    for(const view of ['list','reminders','focus']){await page(view);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),view);await evaluate('document.querySelectorAll("h1,h2,strong,small,p,button,span,input,.clock").forEach(x=>{x.style.fontSize=parseFloat(getComputedStyle(x).fontSize)*1.5+"px"})');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),view+' 大字体');if(view==='focus')assert.ok(await evaluate('document.querySelector("#clock").scrollWidth<=document.querySelector(".timer-orbit").clientWidth'));}
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:'reduce'}]});await page('focus');assert.equal(await evaluate('getComputedStyle(document.querySelector(".timer-orbit"),"::before").animationName'),'none');await shot('120-深色专注');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'},{name:'prefers-reduced-motion',value:'no-preference'}]});await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:1,mobile:true});
  });
  await test('损坏记录不覆盖，完整备份可恢复',async()=>{
    const backup=await evaluate('(async()=>{const mod=await import("./js/store.js");return mod.makeBackup(QingzhouTest.getState());})()');
    await evaluate('localStorage.setItem("native-record","{broken");location.reload()');await waitFor(()=>evaluate('!!document.querySelector(".recovery")'),'恢复界面');
    assert.equal(await evaluate('localStorage.getItem("native-record")'),'{broken');await shot('UI-损坏记录保护');
    await click('[data-action=export-raw]');assert.equal(await evaluate('window.__exported'),'{broken');
    await evaluate('Qingzhou.nativeEvent("import",'+JSON.stringify(backup)+')');await click('dialog .confirm');
    assert.equal((await state()).settings.name,'安卓验收');assert.ok((await state()).sessions.length>0);
  });
  assert.deepEqual(runtimeErrors,[]);
  await sleep(2700);
  for(const [view,label] of [['home','首页'],['plan','计划'],['progress','进度'],['focus','专注'],['summary','周总结'],['settings','设置'],['list','任务清单'],['reminders','学习提醒']]){await page(view);await evaluate('window.scrollTo({top:0,behavior:"instant"})');await shot('交付-'+label);}
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});await page('home');await evaluate('window.scrollTo({top:0,behavior:"instant"})');await shot('交付-深色首页');
  await writeFile(resolve(out,'界面验收结果.json'),JSON.stringify({status:'pass',viewport:'393×852 / 320×700',checks,runtimeErrors,scope:'已安装 Edge 执行真实点击与触摸；原生通知和安装需 Android 真机验收'},null,2));
  console.log('UI checks: '+checks.length+' passed');
}catch(error){
  try{await shot('UI-失败现场');}catch{}
  await writeFile(resolve(out,'界面验收结果.json'),JSON.stringify({status:'fail',checks,runtimeErrors,error:error.stack},null,2));
  console.error(error);process.exitCode=1;
}finally{
  try{if(socket?.readyState===1)await send('Browser.close');}catch{}
  socket?.close();child.kill();server.close();
}
