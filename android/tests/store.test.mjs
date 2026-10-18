import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,makeBackup,parseBackup,MAX_BYTES} from '../web/js/store.js';
import {createState,startTimer} from '../web/lib/qz/engine.js';
function backend(state=createState('2026-10-07')){
  return {raw:JSON.stringify(state),fail:false,read(){return this.raw;},write(raw,expected){if(this.fail)throw new Error('disk full');if(expected!==this.raw)throw new Error('conflict');this.raw=raw;}};
}
test('failed transaction leaves persisted record and visible state unchanged',()=>{
  const disk=backend(),store=new Store(disk),old=disk.raw;disk.fail=true;
  assert.throws(()=>store.update(s=>({...s,nextId:5})),/disk full/);
  assert.equal(disk.raw,old);assert.equal(store.state.nextId,1);
});
test('compare-and-swap rejects a stale candidate without overwriting newer records',()=>{
  const disk=backend(),store=new Store(disk),candidate={...store.state,nextId:3};
  disk.raw=JSON.stringify({...store.state,nextId:7});
  assert.throws(()=>store.save(candidate),/conflict/);assert.equal(JSON.parse(disk.raw).nextId,7);
});
test('failed focus ending freezes duration and date across retries and prevents duplicate entries',()=>{
  const start=Date.parse('2026-10-07T23:59:50+08:00'),disk=backend(startTimer(createState('2026-10-07'),'english',1500,start)),store=new Store(disk);
  disk.fail=true;assert.throws(()=>store.finish(start+12000),/disk full/);
  assert.equal(store.pending.candidate.sessions[0].seconds,12);
  assert.throws(()=>store.update(s=>({...s,nextId:5})),/专注页/);
  disk.fail=false;store.retryFinish();store.retryFinish();
  assert.equal(store.state.sessions.length,1);assert.equal(store.state.sessions[0].seconds,12);assert.equal(store.state.sessions[0].date,'2026-10-07');
  assert.equal(store.state.timer,null);
});
test('native and UI completion races merge once while retaining other changes',()=>{
  const start=Date.parse('2026-10-07T12:00:00+08:00'),disk=backend(startTimer(createState('2026-10-07'),'math',1500,start)),store=new Store(disk);
  disk.fail=true;assert.throws(()=>store.finish(start+8000));disk.fail=false;
  const external=JSON.parse(disk.raw);external.nextId=8;disk.raw=JSON.stringify(external);
  store.retryFinish();assert.equal(store.state.nextId,8);assert.equal(store.state.sessions.length,1);
});
test('corrupt existing data is never treated as a new empty record',()=>{
  const disk=backend();disk.raw='{broken';assert.throws(()=>new Store(disk));assert.equal(disk.raw,'{broken');
});
test('backup round trip retains all fields and applies UTF-8 byte limit on both paths',()=>{
  const state=createState('2026-10-07');state.settings.name='轻舟测试';
  assert.deepEqual(parseBackup(makeBackup(state)),state);
  assert.throws(()=>parseBackup(' '.repeat(MAX_BYTES+1)),/30 MiB/);
  state.settings.name='舟'.repeat(Math.ceil(MAX_BYTES/3));assert.throws(()=>makeBackup(state),/30 MiB/);
});
test('damaged timer timestamps and duplicate focus IDs are rejected on import',()=>{
  const state=startTimer(createState('2026-10-07'),'math',1500,Date.now());delete state.timer.until;
  assert.throws(()=>makeBackup(state),/番茄钟/);
});
