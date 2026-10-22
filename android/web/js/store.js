import { createState, validateState, STORAGE_KEY, finishTimer } from '../lib/qz/engine.js';

export const MAX_BYTES = 30 * 1024 * 1024;
export const bytes = value => new TextEncoder().encode(value).length;
export class Store {
  constructor(backend) { this.backend=backend;this.raw=null;this.state=null;this.pending=null;this.load(); }
  load() {
    const raw=this.backend.read();
    const unchanged=raw===this.raw&&this.state!==null;
    this.raw=raw;
    if(!unchanged)this.state=raw===null?createState():validateState(JSON.parse(raw));
    if(this.backend.pending){const p=this.backend.pending();if(p){const candidate=JSON.parse(JSON.stringify(this.state));candidate.timer=null;if(p.record)candidate.sessions.push(p.record);this.pending={native:true,id:p.id,candidate,remaining:p.remaining,persisted:p.persisted};}else if(this.pending?.native)this.pending=null;}
    return this.state;
  }
  save(candidate,expected=this.raw,reason='daily') {
    const next=validateState(candidate),raw=JSON.stringify(next);
    if(bytes(raw)>MAX_BYTES-1024)throw new Error('学习记录接近 30 MiB，请先导出备份。');
    this.backend.write(raw,expected,reason);
    if(this.backend.read()!==raw)throw new Error('保存核对失败，请重试；原始记录仍由应用保留。');
    this.raw=raw;this.state=next;this.pending=null;
    return this.state;
  }
  update(command,{reason='daily'}={}) {this.load();if(this.pending)throw new Error('请先到专注页重试保存本轮结果。');return this.save(command(this.state),this.raw,reason); }
  focus(action,fields={}){if(!this.backend.focus)throw new Error('当前环境没有原生计时接口。');this.backend.focus({action,...fields});return this.load();}
  finish(now=Date.now()) {
    if(this.backend.focus){try{return this.focus('end');}catch(error){this.load();throw error;}}
    this.load();
    if(!this.state.timer)return this.state;
    const expected=this.raw,candidate=finishTimer(this.state,now);
    const id=this.state.timer.id;
    try{return this.save(candidate,expected);}
    catch(error){this.pending={candidate,expected,id};throw error;}
  }
  retryFinish() {
    if(this.pending?.native)return this.focus('retry');
    if(!this.pending)return this.load();
    const frozen=this.pending,raw=this.backend.read(),current=raw===null?createState():validateState(JSON.parse(raw));
    if(current.sessions.some(session=>session.id===frozen.id)){this.pending=null;return this.load();}
    if(raw===frozen.expected)return this.save(frozen.candidate,raw);
    const record=frozen.candidate.sessions.find(session=>session.id===frozen.id);
    if(current.timer&&current.timer.id!==frozen.id)throw new Error('当前已有新的专注，请先结束它后重试。');
    if(record)current.sessions.push(record);
    if(frozen.candidate.lastFocusResult)current.lastFocusResult=frozen.candidate.lastFocusResult;
    current.timer=null;
    return this.save(current,raw);
  }
}
export function createBackend(host=globalThis) {
  const native=host.QingzhouAndroid;
  let cachedRevision=null,cachedRaw;
  if(native)return {
    read:()=>{
      const revision=typeof native.stateRevision==='function'?native.stateRevision():null;
      if(Number.isSafeInteger(revision)&&revision===cachedRevision&&cachedRaw!==undefined)return cachedRaw;
      const response=native.readState();
      if(typeof response!=='string')throw new Error('本机存储接口没有返回有效结果，请关闭应用后重试。');
      let result;try{result=JSON.parse(response);}catch{throw new Error('本机存储接口返回异常，原记录未被改动。');}
      if(!result||result.ok!==true)throw new Error(result?.message||'读取本机记录失败，请重试。');
      if(result.exists===false&&result.raw===null){cachedRevision=revision;cachedRaw=null;return null;}
      if(result.exists===true&&typeof result.raw==='string'){cachedRevision=revision;cachedRaw=result.raw;return result.raw;}
      throw new Error('本机存储接口返回异常，原记录未被改动。');
    },
    write:(raw,expected,reason='daily')=>{
      const response=native.saveState(raw,expected,reason);
      if(typeof response!=='string')throw new Error('保存接口没有返回有效结果，请重试。');
      let result;try{result=JSON.parse(response);}catch{throw new Error('保存接口返回异常，请重试。');}
      if(result?.ok!==true)throw new Error(result?.message||'保存失败，请重试。');
    },
    ...(typeof native.focusCommand==='function'?{focus:command=>{const reply=JSON.parse(native.focusCommand(JSON.stringify(command)));if(!reply.ok)throw new Error(reply.message||'专注操作失败，请重试。');}}:{}),
    ...(typeof native.pendingFocus==='function'?{pending:()=>{const reply=JSON.parse(native.pendingFocus());if(!reply.ok)throw new Error(reply.message||'读取待保存计时失败。');return reply.pending;}}:{})
  };
  return {
    read:()=>host.localStorage.getItem(STORAGE_KEY),
    write:(raw,expected)=>{
      if(host.localStorage.getItem(STORAGE_KEY)!==expected)throw new Error('记录已更新，请重试。');
      host.localStorage.setItem(STORAGE_KEY,raw);
    }
  };
}
export function makeBackup(state) {
  const raw=JSON.stringify({format:'qingzhou.android.backup',version:2,exportedAt:new Date().toISOString(),state:validateState(state)});
  if(bytes(raw)>MAX_BYTES)throw new Error('备份超过 30 MiB，无法导出。');
  return raw;
}
export function parseBackup(raw) {
  if(bytes(raw)>MAX_BYTES)throw new Error('备份超过 30 MiB。');
  const data=JSON.parse(raw.replace(/^\uFEFF/,''));
  if(data.format!=='qingzhou.android.backup'||![1,2].includes(data.version))throw new Error('请选择轻舟安卓版导出的完整备份。');
  return validateState(data.state);
}
