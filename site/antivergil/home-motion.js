const dialog = document.querySelector('#consent');
const categories = ['preferences','statistics','marketing'];
const key = 'antivergil-consent-v1';
let choices;
try { choices = JSON.parse(localStorage.getItem(key)); } catch {}
function showConsent(){
  for(const name of categories) dialog.querySelector('[name="'+name+'"]').checked = !!choices?.[name];
  showTab('consent-main');
  dialog.showModal();
}
function showTab(id){
  for(const button of dialog.querySelectorAll('[data-tab]')) button.setAttribute('aria-pressed', String(button.dataset.tab===id));
  for(const panel of dialog.querySelectorAll('[data-panel]')) panel.hidden = panel.id!==id;
}
dialog.addEventListener('click', event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.dataset.tab){showTab(button.dataset.tab);return;}
  if(!button.dataset.choice)return;
  choices=Object.fromEntries(categories.map(name=>[name,button.dataset.choice==='all'||(button.dataset.choice==='selection'&&dialog.querySelector('[name="'+name+'"]').checked)]));
  try {localStorage.setItem(key,JSON.stringify(choices));}catch{}
  dialog.close();
});
dialog.addEventListener('cancel',e=>{if(!choices)e.preventDefault()});
document.querySelector('#cookies').onclick=showConsent;
if(!choices)showConsent();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const word=document.querySelector('h1');
const letters=word.textContent.split('');
word.setAttribute('aria-label',word.textContent);
word.replaceChildren(...letters.map((letter,i)=>{
  const span=document.createElement('span');span.textContent=letter;span.ariaHidden='true';span.style.setProperty('--i',i);return span;
}));
function scramble(event){
  if(reduced.matches)return;
  const label=event.currentTarget;
  if(label.dataset.running)return;
  const original=label.textContent;
  label.dataset.running='1';
  const start=performance.now();
  function frame(now){
    const count=Math.floor((now-start)/30);
    label.textContent=Array.from(original,(c,i)=>i<count||c===' '?c:String.fromCharCode(65+Math.floor(Math.random()*26))).join('');
    if(count<original.length)requestAnimationFrame(frame);else delete label.dataset.running;
  }
  requestAnimationFrame(frame);
}
for(const tile of gallery.children){
  const label=tile.querySelector('span');
  tile.onpointerenter=()=>scramble({currentTarget:label});
}
const originals=[...gallery.children];
for(const tile of originals){const copy=tile.cloneNode(true);copy.tabIndex=-1;copy.setAttribute('aria-hidden','true');gallery.append(copy);}
let previous=0,offset=0,lastManual=0;
gallery.addEventListener('scroll',()=>{offset=gallery.scrollLeft}, {passive:true});
for(const type of ['wheel','touchmove','pointerdown'])gallery.addEventListener(type,()=>lastManual=performance.now(),{passive:true});
function drift(now){
  const dt=Math.min(50,now-previous);previous=now;
  if(!document.hidden&&!reduced.matches&&!gallery.matches(':hover,:focus-within')&&now-lastManual>1600){
    const period=gallery.children[originals.length].offsetLeft-gallery.children[0].offsetLeft;
    if(period>0){offset=(offset+dt*.032)%period;gallery.scrollLeft=Math.floor(offset);offset+=.5;}
  }
  requestAnimationFrame(drift);
}
requestAnimationFrame(drift);
