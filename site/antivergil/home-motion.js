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
  const img=tile.querySelector('img');
  const title=tile.textContent.replace(' ↗','');
  const frame=document.createElement('div');
  frame.className='photo-window';
  frame.append(img);
  const caption=document.createElement('div');
  caption.className='tile-caption';
  for(const part of title.split(' ')){
    const line=document.createElement('div');
    const word=document.createElement('strong');
    word.textContent=part;
    line.append(word);
    caption.append(line);
  }
  tile.setAttribute('aria-label',title);
  tile.replaceChildren(frame,caption);
}
gallery.addEventListener('pointermove',event=>{
  if(reduced.matches || event.pointerType==='touch')return;
  const frame=event.target.closest('.photo-window');
  if(!frame)return;
  const rect=frame.getBoundingClientRect();
  frame.style.setProperty('--pan',((event.clientX-rect.left)/rect.width-.5)*9+'%');
  frame.style.setProperty('--lift',((event.clientY-rect.top)/rect.height-.5)*5+'%');
});
for(const link of document.querySelectorAll('nav a')){
  link.addEventListener('pointerenter',()=>scramble({currentTarget:link}));
}
const originals=[...gallery.children];
for(const tile of originals){const copy=tile.cloneNode(true);copy.tabIndex=-1;copy.setAttribute('aria-hidden','true');gallery.append(copy);}
const track=document.createElement('div');
track.className='gallery-track';
track.append(...gallery.children);
for(const tile of originals){const copy=tile.cloneNode(true);copy.tabIndex=-1;copy.setAttribute("aria-hidden","true");track.append(copy);}
gallery.append(track);
const motion=track.animate(
  [{transform:'translate3d(0,0,0)'},{transform:'translate3d(-33.3333333333%,0,0)'}],
  {duration:1000,iterations:Infinity,easing:'linear'}
);
function resizeTrack(){
  const duration=track.getBoundingClientRect().width/3/32*1000;
  if(duration>0)motion.effect.updateTiming({duration});
}
new ResizeObserver(resizeTrack).observe(track);
resizeTrack();
let resumeTimer;
function syncPlayback(){
  clearTimeout(resumeTimer);
  if(reduced.matches || document.hidden || gallery.matches(':hover,:focus-within'))motion.pause();
  else motion.play();
}
for(const event of ['pointerenter','pointerleave','focusin'])gallery.addEventListener(event,syncPlayback);
gallery.addEventListener('focusout',()=>requestAnimationFrame(syncPlayback));
reduced.addEventListener('change',syncPlayback);
document.addEventListener('visibilitychange',syncPlayback);
syncPlayback();

const footerMenu = document.querySelector('footer details');
if (footerMenu) {
  let closeTimer;
  let menuPinned = false;
  const summary = footerMenu.querySelector('summary');
  const closeMenu = () => {
    clearTimeout(closeTimer);
    footerMenu.open = false;
    menuPinned = false;
  };
  footerMenu.addEventListener('pointerenter', () => {
    clearTimeout(closeTimer);
    footerMenu.open = true;
  });
  footerMenu.addEventListener('pointerleave', () => {
    clearTimeout(closeTimer);
    if (!menuPinned) closeTimer = setTimeout(() => { footerMenu.open = false; }, 140);
  });
  summary.addEventListener('click', event => {
    event.preventDefault();
    clearTimeout(closeTimer);
    if (!footerMenu.open) {
      footerMenu.open = true;
      menuPinned = true;
    } else if (!menuPinned) {
      menuPinned = true;
    } else {
      closeMenu();
    }
  });
  footerMenu.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });
  document.addEventListener('pointerdown', event => {
    if (menuPinned && !footerMenu.contains(event.target)) closeMenu();
  });
}
