// Small keyed DOM updater: keep inputs, focus and task nodes alive within a page.
const key=n=>n.nodeType===1?(n.id||['data-id','data-key','data-nav','data-expand','data-level','data-view'].map(a=>n.hasAttribute(a)?a+':'+n.getAttribute(a):'').find(Boolean)||''):'';
const compatible=(a,b)=>a&&a.nodeType===b.nodeType&&(a.nodeType!==1||a.tagName===b.tagName&&key(a)===key(b));
function update(old,next){
  if(old.nodeType===3){if(old.textContent!==next.textContent)old.textContent=next.textContent;return;}
  if(old.nodeType!==1)return;
  const open=old.tagName==='DETAILS'?old.open:null;
  for(const attr of [...old.attributes])if(!next.hasAttribute(attr.name))old.removeAttribute(attr.name);
  for(const attr of [...next.attributes])if(old.getAttribute(attr.name)!==attr.value)old.setAttribute(attr.name,attr.value);
  children(old,next);
  if(open!==null)old.open=open;
  if(old!==document.activeElement&&['INPUT','SELECT','TEXTAREA'].includes(old.tagName)){if(old.value!==next.value)old.value=next.value;if(old.type==='checkbox'||old.type==='radio')old.checked=next.checked;}
}
function children(old,next){
  let cursor=old.firstChild;const keyed=new Map([...old.childNodes].filter(key).map(n=>[key(n),n]));
  for(const child of [...next.childNodes]){
    let current=key(child)?keyed.get(key(child)):cursor;
    if(!compatible(current,child))current=null;
    if(current){if(current!==cursor)old.insertBefore(current,cursor);update(current,child);cursor=current.nextSibling;}
    else{const inserted=child.cloneNode(true);old.insertBefore(inserted,cursor);}
  }
  while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}
}
export function patchHTML(root,html){const template=document.createElement('template');template.innerHTML=html;children(root,template.content);}
export function motionAllowed(){return document.documentElement.dataset.motion!=='off'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;}
export function animateIn(element,type='page'){
  if(!element||!motionAllowed()||!element.animate)return;
  const sheet=type==='sheet';element.animate([{opacity:0,transform:sheet?'translateY(24px)':'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],{duration:sheet?240:180,easing:'cubic-bezier(.2,0,0,1)'});
}
export function animateResize(element,before){if(!element||!motionAllowed()||!element.animate)return;const after=element.getBoundingClientRect().height;if(Math.abs(after-before)>3)element.animate([{height:before+'px'},{height:after+'px'}],{duration:200,easing:'cubic-bezier(.2,0,0,1)'});}
