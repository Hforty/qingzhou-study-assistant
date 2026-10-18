import { createState, validateState, STORAGE_KEY, finishTimer } from '../lib/qz/engine.js';

export const MAX_BYTES = 30 * 1024 * 1024;
export const bytes = value => new TextEncoder().encode(value).length;
export class Store {
  constructor(backend) { this.backend=backend;this.raw=null;this.state=null;this.pending=null;this.load(); }
  load() {
    const raw=this.backend.read();
    this.raw=raw;
    this.state=raw===null?createState():validateState(JSON.parse(raw));
    return this.state;
  }
  save(candidate,expected=this.raw) {
    const next=validateState(candidate),raw=JSON.stringify(next);
    if(bytes(raw)>MAX_BYTES)throw new Error('学习记录超过 30 MiB，请先导出备份。');
    this.backend.write(raw,expected);
    if(this.backend.read()!==raw)throw new Error('保存核对失败，请重试；原始记录仍由应用保留。');
    this.raw=raw;this.state=next;this.pending=null;
    return this.state;
  }
  update(command) { if(this.pending)throw new Error('请先到专注页重试保存本轮结果。');this.load();return this.save(command(this.state)); }
  finish(now=Date.now()) {
    this.load();
    if(!this.state.timer)return this.state;
    const expected=this.raw,candidate=finishTimer(this.state,now);
    const id=this.state.timer.id;
    try{return this.save(candidate,expected);}
    catch(error){this.pending={candidate,expected,id};throw error;}
  }
  retryFinish() {
    if(!this.pending)return this.load();
    const frozen=this.pending,raw=this.backend.read(),current=raw===null?createState():validateState(JSON.parse(raw));
    if(current.sessions.some(session=>session.id===frozen.id)){this.pending=null;return this.load();}
    if(raw===frozen.expected)return this.save(frozen.candidate,raw);
    const record=frozen.candidate.sessions.find(session=>session.id===frozen.id);
    if(current.timer&&current.timer.id!==frozen.id)throw new Error('当前已有新的专注，请先结束它后重试。');
    if(record)current.sessions.push(record);
    current.timer=null;
    return this.save(current,raw);
  }
}
export function createBackend(host=globalThis) {
  const native=host.QingzhouAndroid;
  if(native)return {
    read:()=>{
      const response=native.readState();
      if(typeof response!=='string')throw new Error('本机存储接口没有返回有效结果，请关闭应用后重试。');
      let result;try{result=JSON.parse(response);}catch{throw new Error('本机存储接口返回异常，原记录未被改动。');}
      if(!result||result.ok!==true)throw new Error(result?.message||'读取本机记录失败，请重试。');
      if(result.exists===false&&result.raw===null)return null;
      if(result.exists===true&&typeof result.raw==='string')return result.raw;
      throw new Error('本机存储接口返回异常，原记录未被改动。');
    },
    write:(raw,expected)=>{
      const response=native.saveState(raw,expected);
      if(typeof response!=='string')throw new Error('保存接口没有返回有效结果，请重试。');
      let result;try{result=JSON.parse(response);}catch{throw new Error('保存接口返回异常，请重试。');}
      if(result?.ok!==true)throw new Error(result?.message||'保存失败，请重试。');
    }
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
  const raw=JSON.stringify({format:'qingzhou.android.backup',version:1,exportedAt:new Date().toISOString(),state:validateState(state)},null,2);
  if(bytes(raw)>MAX_BYTES)throw new Error('备份超过 30 MiB，无法导出。');
  return raw;
}
export function parseBackup(raw) {
  if(bytes(raw)>MAX_BYTES)throw new Error('备份超过 30 MiB。');
  const data=JSON.parse(raw.replace(/^\uFEFF/,''));
  if(data.format!=='qingzhou.android.backup'||data.version!==1)throw new Error('请选择轻舟安卓版导出的完整备份。');
  return validateState(data.state);
}
