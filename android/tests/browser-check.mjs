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
    'readState(){return localStorage.getItem("native-record")},',
    'saveState(value,expected){if(window.__failSave)return JSON.stringify({ok:false,message:"测试保存失败"});if(localStorage.getItem("native-record")!==expected)return JSON.stringify({ok:false,message:"测试冲突"});localStorage.setItem("native-record",value);return JSON.stringify({ok:true});},',
    'version(){return "1.0.0"},feedback(){},copyEmail(){},openContact(){},openReleases(){},exportBackup(){},importBackup(){}',
    '};'
  ].join('\n');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:bridgeSource});
  await send('Page.navigate',{url});
  await waitFor(()=>evaluate('!!window.QingzhouTest'),'应用载入');
  await evaluate('localStorage.clear();location.reload()');
  await waitFor(()=>evaluate('!!document.querySelector("#onboarding-form")'),'首次引导');
  await test('首次引导独立显示，确认后生成计划',async()=>{
    assert.equal(await evaluate('document.querySelectorAll(".bottom-nav").length'),0);
    await shot('UI-首次引导');
    await click('#onboarding-form button[type=submit]');await click('dialog .confirm');
    await waitFor(()=>evaluate('!!document.querySelector(".bottom-nav")'),'进入首页');
    assert.equal((await state()).onboardingCompleted,true);assert.ok((await state()).tasks.length>0);
    await shot('UI-首页');
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
  await test('损坏记录不覆盖，完整备份可恢复',async()=>{
    const backup=await evaluate('(async()=>{const mod=await import("./js/store.js");return mod.makeBackup(QingzhouTest.getState());})()');
    await evaluate('localStorage.setItem("native-record","{broken");location.reload()');await waitFor(()=>evaluate('!!document.querySelector(".recovery")'),'恢复界面');
    assert.equal(await evaluate('localStorage.getItem("native-record")'),'{broken');await shot('UI-损坏记录保护');
    await evaluate('Qingzhou.nativeEvent("import",'+JSON.stringify(backup)+')');await click('dialog .confirm');
    assert.equal((await state()).settings.name,'安卓验收');assert.ok((await state()).sessions.length>0);
  });
  assert.deepEqual(runtimeErrors,[]);
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
