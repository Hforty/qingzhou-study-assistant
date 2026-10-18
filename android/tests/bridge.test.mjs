import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,createBackend} from '../web/js/store.js';
import {createState} from '../web/lib/qz/engine.js';
function nativeDisk(raw=null){
  return {raw,writes:0,readState(){return JSON.stringify({ok:true,exists:this.raw!==null,raw:this.raw});},saveState(value,expected){if(this.raw!==expected)return JSON.stringify({ok:false,message:'冲突'});this.writes++;this.raw=value;return JSON.stringify({ok:true});}};
}
test('WebView null String behavior reproduces 1.0.0 first-launch failure',()=>{
  const oldRead=()=>undefined;
  assert.throws(()=>JSON.parse(oldRead()),SyntaxError);
});
test('explicit missing-record envelope starts onboarding without writing empty defaults',()=>{
  const native=nativeDisk(),store=new Store(createBackend({QingzhouAndroid:native}));
  assert.equal(store.state.onboardingCompleted,false);assert.equal(native.writes,0);assert.equal(native.raw,null);
  store.update(s=>({...s,onboardingCompleted:true}));assert.equal(native.writes,1);
  assert.equal(new Store(createBackend({QingzhouAndroid:native})).state.onboardingCompleted,true);
});
test('existing 1.0.0 record retains exact bytes and every field on 1.0.1 reads',()=>{
  const data=createState('2026-10-18');data.onboardingCompleted=true;data.settings.name='保留记录';
  data.progress['math-0-0']={level:2,updated:'2026-10-18'};
  const raw=JSON.stringify(data),native=nativeDisk(raw),store=new Store(createBackend({QingzhouAndroid:native}));
  assert.deepEqual(store.state,data);assert.equal(native.raw,raw);assert.equal(native.writes,0);
});
test('malformed stored records never become new empty records',()=>{
  for(const raw of ['undefined','null','','{broken']){
    const native=nativeDisk(raw);assert.throws(()=>new Store(createBackend({QingzhouAndroid:native})));
    assert.equal(native.raw,raw);assert.equal(native.writes,0);
  }
});
test('undefined, null and malformed bridge responses fail clearly without any writes',()=>{
  for(const response of [undefined,null,'undefined','null','{}','{"ok":true,"exists":false}','{"ok":true,"exists":false,"raw":"record"}']){
    let writes=0;const native={readState:()=>response,saveState(){writes++;}};
    assert.throws(()=>new Store(createBackend({QingzhouAndroid:native})),/接口|读取/);assert.equal(writes,0);
  }
});
test('native read failures are propagated instead of inventing missing data',()=>{
  const native={readState:()=>JSON.stringify({ok:false,message:'磁盘读取失败'})};
  assert.throws(()=>new Store(createBackend({QingzhouAndroid:native})),/磁盘读取失败/);
});
test('invalid save responses cannot report success or update visible state',()=>{
  const native=nativeDisk(),store=new Store(createBackend({QingzhouAndroid:native}));native.saveState=()=>undefined;
  assert.throws(()=>store.update(s=>({...s,onboardingCompleted:true})),/保存接口/);
  assert.equal(store.state.onboardingCompleted,false);assert.equal(native.raw,null);
});
test('raw export reads exact damaged bytes rather than exporting the transport envelope',()=>{
  const raw='损坏的原始记录\n"保留引号"\\undefined',native=nativeDisk(raw);
  assert.equal(createBackend({QingzhouAndroid:native}).read(),raw);assert.equal(native.writes,0);
});
