export const escapeHTML = value => String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export const icon = (name,size=22) => {
  const paths={
    home:'<path d="m3 10 9-7 9 7v10H5V10"/><path d="M9 21v-8h6v8"/>',
    plan:'<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4M16 3v4M4 11h16M8 15h3M8 18h6"/>',
    focus:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
    progress:'<path d="M4 20V10M10 20V5M16 20v-9M22 20H2"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    arrow:'<path d="m9 5 7 7-7 7"/>',back:'<path d="m15 5-7 7 7 7"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',check:'<path d="m5 12 4 4L19 6"/>',
    book:'<path d="M12 5v16M12 5C8 2 4 3 3 4v15c3-2 6-1 9 2 3-3 6-4 9-2V4c-3-2-6-1-9 1Z"/>',
    history:'<path d="M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v6l4 2"/>',
    add:'<path d="M12 5v14M5 12h14"/>',
    play:'<path d="m9 5 11 7-11 7Z"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    leaf:'<path d="M20 3C9 2 1 9 6 16s16 2 14-13ZM5 20 16 8"/>'
  };
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.book)+'</svg>';
};
export const boat = '<svg viewBox="0 0 120 100" aria-hidden="true"><path d="M26 62h70c-6 18-20 24-35 24S34 78 26 62Z" fill="#356e50"/><path d="M57 12v43H29Z" fill="#8bb18e"/><path d="M63 6v49h29Z" fill="#4f885f"/><path d="M20 92q20-8 40 0t40 0" fill="none" stroke="#abc4a8" stroke-width="3" stroke-linecap="round"/></svg>';
let toastTimer;
export function toast(text,error=false) {
  const box=document.querySelector('#toast');box.textContent=text;box.className=error?'visible error-toast':'visible';
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.className='',error?5000:2300);
}
export class Dialogs {
  constructor(){this.stack=[];}
  open({title,subtitle='',body='',footer='',className='',onClose}) {
    const before=document.activeElement,dialog=document.createElement('dialog');
    dialog.className='sheet '+className;
    dialog.innerHTML='<header class="sheet-header"><div><h2>'+escapeHTML(title)+'</h2>'+(subtitle?'<p class="muted">'+escapeHTML(subtitle)+'</p>':'')+'</div><button class="icon-button close" aria-label="关闭">'+icon('close')+'</button></header><div class="sheet-body">'+body+'</div><div class="sheet-error" role="alert"></div>'+(footer?'<footer class="sheet-footer">'+footer+'</footer>':'');
    document.querySelector('#dialogs').append(dialog);
    const handle={element:dialog,before,close:()=>this.close(handle),onClose};
    this.stack.push(handle);
    dialog.querySelector('.close').onclick=()=>this.requestClose(handle);
    dialog.addEventListener('cancel',event=>{event.preventDefault();this.requestClose(handle);});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientY<rect.top||event.clientY>rect.bottom||event.clientX<rect.left||event.clientX>rect.right)this.requestClose(handle);}});
    dialog.showModal();return handle;
  }
  requestClose(handle=this.stack.at(-1)) {if(handle){if(handle.onClose)handle.onClose(handle);else this.close(handle);}}
  close(handle=this.stack.at(-1)) {
    if(!handle)return;
    const index=this.stack.indexOf(handle);if(index<0)return;
    for(const item of this.stack.splice(index).reverse()){item.element.close();item.element.remove();}
    if(handle.before?.isConnected)handle.before.focus({preventScroll:true});
  }
  error(handle,message) {handle.element.querySelector('.sheet-error').textContent=message;}
  confirm({title,body,confirm='确定',danger=false}) {
    return new Promise(resolve=>{
      const handle=this.open({title,body:'<p class="confirm-copy">'+escapeHTML(body)+'</p>',className:'compact',
        footer:'<button class="button secondary cancel">取消</button><button class="button '+(danger?'danger':'primary')+' confirm">'+escapeHTML(confirm)+'</button>',onClose:()=>finish(false)});
      const finish=value=>{this.close(handle);resolve(value);};
      handle.element.querySelector('.cancel').onclick=()=>finish(false);
      handle.element.querySelector('.confirm').onclick=()=>finish(true);
    });
  }
  get active(){return this.stack.length>0;}
}
export function bindTaskGestures(container,{toggle,edit}) {
  for(const row of container.querySelectorAll('.task-row[data-id]')) {
    let start=null,axis='',offset=0,longTimer,edited=false;
    const reset=()=>{clearTimeout(longTimer);start=null;axis='';offset=0;row.style.transform='';row.closest('.task-swipe').classList.remove('swiping');};
    row.addEventListener('pointerdown',event=>{
      if(event.target.closest('button'))return;
      start={x:event.clientX,y:event.clientY};axis='';edited=false;
      if(edit&&!row.classList.contains('completed'))longTimer=setTimeout(()=>{edited=true;reset();edit(row.dataset.id);},550);
    });
    row.addEventListener('pointermove',event=>{
      if(!start)return;
      const dx=event.clientX-start.x,dy=event.clientY-start.y;
      if(Math.abs(dx)>8||Math.abs(dy)>8)clearTimeout(longTimer);
      if(!axis&&(Math.abs(dx)>8||Math.abs(dy)>8))axis=dx>0&&dx>Math.abs(dy)*1.4?'x':'y';
      if(axis==='x'){offset=Math.max(0,Math.min(dx,92));row.style.transform='translateX('+offset+'px)';row.closest('.task-swipe').classList.add('swiping');}
    });
    row.addEventListener('pointerup',()=>{const passed=axis==='x'&&offset>=58&&!edited;reset();if(passed)toggle(row.dataset.id);});
    row.addEventListener('pointercancel',reset);
    row.addEventListener('contextmenu',event=>{event.preventDefault();if(edit&&!edited&&!row.classList.contains('completed')){reset();edit(row.dataset.id);}});
  }
}
