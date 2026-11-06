"use strict";
const VERSION='1.15';
const NEWS={"1.15":["Timer e orario più spostati verso il centro, per non essere tagliati dagli angoli arrotondati del telefono"],"1.14":["Il timer in alto conta tutta la lettura della giornata, anche se esci dal libro o ne apri un altro"],"1.13":["A schermo intero timer e orario salgono fino al bordo alto dello schermo, dove c’era la barra di Android"],"1.12":["Schermo intero che copre anche la barra di Android","In lettura, in alto a sinistra il timer e a destra l’orario","Statistiche di lettura (minuti di oggi, giorni di fila, totale) in home e in Altro, con obiettivo giornaliero","Parole da imparare: seleziona una parola e tocca Parola, poi ripassale da Altro. Salvate anche sul sito","Nuovo carattere Libre Baskerville"],"1.11":["Salvataggio automatico sul tuo sito (libri, progressi, impostazioni) e ripristino su un nuovo telefono"],"1.10":["Puntina rossa più grande per i libri fissati"],"1.9":["Libri preferiti: fissali in alto con la puntina dal menu del libro","Rimosse le voci AI (OpenAI e Gemini): resta solo la voce del telefono","Novità di ogni versione visibili in Altro e dopo l'aggiornamento"],"1.8":["Voce Gemini (rimossa nella 1.9)"],"1.7":["Evidenziazione parola più sincronizzata","Mini player di ascolto"]};
/* ================= Leggo - stato ================= */
const SKEY='leggo.v1';
const FONTS={
 'Literata':'Literata,Georgia,serif','Baskerville':'"Libre Baskerville",Baskerville,"Baskerville Old Face",Georgia,serif','Lora':'Lora,Georgia,serif','Source Serif':'"Source Serif 4",Georgia,serif',
 'Georgia':'Georgia,"Times New Roman",serif','Palatino':'"Palatino Linotype",Palatino,"Book Antiqua",serif',
 'Atkinson':'"Atkinson Hyperlegible",system-ui,sans-serif','Sans':'system-ui,-apple-system,Roboto,sans-serif','Mono':'ui-monospace,Menlo,Consolas,monospace'
};
const DEF={fam:'Literata',fs:19,lh:1.55,ps:.5,fw:400,ta:'justify',hy:true,ti:0,mt:8,mb:24,ml:4,mr:4,theme:'navy',mode:'scroll',rate:1,pin:false,bar:'day'};
let S={set:{...DEF},profiles:{},key:'',model:'claude-haiku-5-5',web:true,wpm:200,wpp:250,bk:{},log:{},time:{},words:[],goalMin:20,known:{},filter:'all',sort:'recent',view:'grid',last:null,sess:null,
  tts:{engine:'device',voice:'',wps:17},seenV:null};
try{const r=localStorage.getItem(SKEY);if(r){const o=JSON.parse(r);S={...S,...o,set:{...DEF,...(o.set||{})},tts:{...S.tts,...(o.tts||{}),engine:'device'}};['okey','gkey','ovoice','omodel','gvoice','gmodel'].forEach(k=>delete S.tts[k])}}catch(e){}
let st=null;function save(){clearTimeout(st);st=setTimeout(()=>{try{localStorage.setItem(SKEY,JSON.stringify(S))}catch(e){}cloudSoon()},250)}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),2400)}
function applyTheme(){document.documentElement.dataset.t=S.set.theme;const m=document.querySelector('meta[name=theme-color]');if(m)m.content=getComputedStyle(document.body).getPropertyValue('--bg').trim()||'#0c0f20'}
const todayISO=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const dayDiff=(a,b)=>Math.round((new Date(b+'T12:00')-new Date(a+'T12:00'))/864e5);
const addDays=(iso,n)=>{const d=new Date(iso+'T12:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const fmtDate=iso=>new Date(iso+'T12:00').toLocaleDateString('it-IT',{day:'numeric',month:'long'});
const fmtDateY=iso=>new Date(iso+'T12:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});

/* ---------- libreria e progressi ---------- */
let LIB=[];
const bookById=id=>LIB.find(b=>b.id===id);
function BK(id){return S.bk[id]||(S.bk[id]={w:0,max:0,done:false,goal:null,ds:null,pos:null,ann:[],bm:[],chat:{},opened:0})}
const pagesOf=b=>b.ext==='pdf'&&b.pages?b.pages:Math.max(1,Math.ceil(b.words/S.wpp));
const frac=b=>{const s=S.bk[b.id];return s&&b.words?Math.max(0,Math.min(1,s.w/b.words)):0};
const pctTxt=f=>f<=0?'0%':f<.01?'<1%':Math.round(f*100)+'%';
const dur=w=>{const m=Math.max(1,Math.round(w/S.wpm));return m>=60?Math.floor(m/60)+' h '+(m%60?String(m%60).padStart(2,'0')+' min':''):m+' min'};
const statusOf=b=>{const s=S.bk[b.id];return s&&s.done?'done':s&&s.w>0?'reading':'new'};
function ensureDay(id){const s=BK(id);const t=todayISO();if(!s.ds||s.ds.d!==t)s.ds={d:t,w:s.w};return s.ds}
function planInfo(b,liveW){
  const s=S.bk[b.id];if(!s||!s.goal||s.done)return null;
  const g=s.goal,t=todayISO(),td=g.pausedOn||t,n=Math.max(1,g.tot||dayDiff(g.start,g.end)+1),w0=Math.min(g.w0||0,b.words);
  const raw=dayDiff(g.start,td),wait=raw<0,late=raw>=n,L=Math.max(0,Math.min(n-1,raw));
  const step=(b.words-w0)/n,pg=b.words?pagesOf(b)/b.words:0,ds=ensureDay(b.id);
  const k=wait?0:Math.max(0,Math.min(L,Math.floor((ds.w-w0)/step+1e-6)));
  const fromW=w0+k*step,toW=L===n-1?b.words:w0+(L+1)*step,cur=liveW==null?s.w:liveW,span=Math.max(1,toW-fromW),readW=Math.max(0,Math.min(span,cur-fromW));
  return {n,L:L+1,K:k+1,nb:L-k+1,wait,paused:!!g.pausedOn,startsOn:g.start,late,days:Math.max(0,n-raw),fromW,toW,perW:span,perP:span*pg,readW,readP:readW*pg,pctDay:readW/span,
    fromP:Math.round(fromW*pg)+1,toP:Math.min(pagesOf(b),Math.max(1,Math.round(toW*pg))),end:g.end,ok:!wait&&cur>=toW-step*.02};
}
const tapLbl=p=>p.nb>1?'Tappe '+p.K+'-'+p.L:'Tappa '+p.L;
function lessonAt(b,i){const g=BK(b.id).goal;if(!g)return null;const n=Math.max(1,g.tot||dayDiff(g.start,g.end)+1),w0=Math.min(g.w0||0,b.words),step=(b.words-w0)/n;
  const pg=b.words?pagesOf(b)/b.words:0,fw=w0+i*step,tw=i===n-1?b.words:w0+(i+1)*step;return {i,n,fw,tw,date:addDays(g.start,i),fromP:Math.round(fw*pg)+1,toP:Math.min(pagesOf(b),Math.max(1,Math.round(tw*pg)))}}
function chapterAtW(b,w){let c=b.chapters.length-1;for(let i=0;i<b.chapters.length;i++){if(w<b.chapters[i].w0+b.chapters[i].n){c=i;break}}return c}
function commitProgress(w){
  const b=R.b,s=BK(R.id);ensureDay(R.id);const prev=s.w;s.w=Math.max(0,Math.min(b.words,w));
  if(s.w>s.max){const inc=s.w-s.max;if(inc<=2500&&s.w-prev<=2500){const t=todayISO();S.log[t]=S.log[t]||{};S.log[t][R.id]=(S.log[t][R.id]||0)+inc}s.max=s.w}
  if(!s.done&&s.w>=b.words*.985){s.done=true;toast('Libro finito')}
}
const secOf=d=>(S.time&&S.time[d])||0;
const wordsOf=d=>Object.values(S.log[d]||{}).reduce((a,b)=>a+b,0);
const dayRead=d=>secOf(d)>=120||wordsOf(d)>=50;
function streak(){let n=0,d=todayISO();if(!dayRead(d))d=addDays(d,-1);while(dayRead(d)){n++;d=addDays(d,-1)}return n}
function bestStreak(){const ks=[...new Set([...Object.keys(S.time||{}),...Object.keys(S.log||{})])].filter(dayRead).sort();let b=0,c=0,p=null;ks.forEach(d=>{c=p&&dayDiff(p,d)===1?c+1:1;if(c>b)b=c;p=d});return b}
const totalSec=()=>Object.values(S.time||{}).reduce((a,b)=>a+b,0);
const todayWords=()=>wordsOf(todayISO());
const todaySec=()=>secOf(todayISO());
const fmtHM=s=>s>=3600?(s/3600).toFixed(1).replace('.',',')+' h':Math.round(s/60)+' min';
function statsBand(){
  const g=Math.max(1,S.goalMin||20),f=Math.min(1,todaySec()/(g*60)),m=Math.floor(todaySec()/60);
  return '<button class="card stack statband" id="stband" style="text-align:left"><div class="stat"><div><b class="tab">'+m+'</b><span class="small mute">min oggi</span></div><div><b class="tab">'+streak()+'</b><span class="small mute">giorni di fila</span></div><div><b class="tab">'+fmtHM(totalSec())+'</b><span class="small mute">in totale</span></div></div><div class="bar"><i style="width:'+f*100+'%"></i></div><div class="small mute tab">'+(f>=1?'Obiettivo di oggi raggiunto':'Obiettivo '+g+' min · mancano '+Math.max(1,Math.ceil(g-todaySec()/60))+' min')+'</div></button>'
}
function statsSheet(){
  const days=[];for(let i=6;i>=0;i--){const d=addDays(todayISO(),-i);days.push({d,s:secOf(d)})}
  const mx=Math.max(600,...days.map(x=>x.s)),wk=days.reduce((s,x)=>s+x.s,0);
  const wd=d=>new Date(d+'T12:00').toLocaleDateString('it-IT',{weekday:'short'}).replace('.','');
  const cell=(n,l)=>'<div><b class="tab" style="display:block;font-size:22px;font-family:var(--disp)">'+n+'</b><span class="small mute">'+l+'</span></div>';
  sheet('<div class="hd"><h3>Statistiche di lettura</h3><button class="btn sec sm" data-x>Chiudi</button></div>'
   +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">'+cell(fmtHM(todaySec())||'0 min','oggi')+cell(streak(),'giorni di fila')+cell(bestStreak(),'record di giorni')+cell(fmtHM(wk),'ultimi 7 giorni')+cell(fmtHM(totalSec()),'in totale')+cell((S.words||[]).length,'parole imparate')+'</div>'
   +'<div style="display:flex;gap:8px;align-items:flex-end;height:110px;margin-top:6px">'+days.map(x=>'<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end"><div style="width:100%;border-radius:6px;background:'+(x.s>=(S.goalMin||20)*60?'var(--ok)':'var(--acc)')+';height:'+Math.max(3,Math.round(x.s/mx*80))+'px;opacity:'+(x.s?1:.25)+'"></div><span class="small mute">'+wd(x.d)+'</span></div>').join('')+'</div>'
   +'<div class="field"><div class="row"><label for="g-min" class="grow">Obiettivo giornaliero (minuti)</label><span class="small mute tab" id="g-v">'+(S.goalMin||20)+'</span></div><input id="g-min" type="range" min="5" max="180" step="5" value="'+(S.goalMin||20)+'"></div>'
   +'<div class="small mute">Il tempo conta solo con il lettore aperto e lo schermo acceso, e si ferma dopo un minuto e mezzo senza tocchi né scorrimenti. Un giorno vale come letto da 2 minuti in su.</div>',box=>{
    $('#g-min',box).oninput=e=>{S.goalMin=+e.target.value;$('#g-v',box).textContent=S.goalMin;save()}})
}
document.addEventListener('click',e=>{if(e.target.closest('#stband'))statsSheet()});

/* ================= navigazione, schede e gesture indietro ================= */
let curView='lib',popCb=null;
function go(v,noHist){
  if(!noHist){if(v!=='lib'&&curView==='lib')history.pushState({v:1},'');else if(v==='lib'&&curView!=='lib'&&history.state&&history.state.v){history.back();return}}
  curView=v;
  document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!=='v-'+v);
  document.querySelectorAll('#nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.v===v));
  ({lib:rLib,oggi:rOggi,cerca:rCerca,altro:rAltro})[v]()
}
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>go(b.dataset.v));
function sheet(html,after){const s=$('#sh'),bx=$('#sh-box');if(!s.classList.contains('open'))history.pushState({s:1},'');bx.innerHTML=html;s.classList.add('open');bx.scrollTop=0;bx.querySelectorAll('[data-x]').forEach(e=>e.onclick=()=>closeSheet());if(after)after(bx)}
function hideSheet(){$('#sh').classList.remove('open');cancelAI()}
function closeSheet(then){
  if(!$('#sh').classList.contains('open')){if(then)then();return}
  hideSheet();
  if(history.state&&history.state.s){popCb=then||(()=>{});history.back()}else if(then)then()
}
$('#sh').onclick=e=>{if(e.target.id==='sh')closeSheet()};
window.addEventListener('popstate',()=>{
  if(popCb){const f=popCb;popCb=null;f();return}
  if($('#sh').classList.contains('open')){hideSheet();return}
  if($('#reader').classList.contains('open')){closeReader();return}
  if(curView!=='lib')go('lib',true)
});
/* banner in basso (ripresa lettura, salti, nuovo libro) */
let bnT=null;
function hideBanner(){const e=$('#resume');e.hidden=true;e.innerHTML='';clearTimeout(bnT)}
function banner(text,btns,ms){
  const e=$('#resume');e.innerHTML='<span>'+esc(text)+'</span>'+btns.map((b,i)=>'<button class="bm" data-i="'+i+'">'+esc(b.l)+'</button>').join('')+'<button class="x" aria-label="Chiudi">×</button>';
  e.querySelectorAll('.bm').forEach(b=>b.onclick=()=>{const f=btns[+b.dataset.i].fn;hideBanner();f()});e.querySelector('.x').onclick=hideBanner;
  e.hidden=false;e.style.bottom=$('#reader').classList.contains('open')?'calc(86px + env(safe-area-inset-bottom,0))':'calc(70px + env(safe-area-inset-bottom,0))';
  clearTimeout(bnT);bnT=setTimeout(hideBanner,ms||10000)
}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(a.href)},4000)}

/* ================= libreria ================= */
const coverHtml=(b,cls)=>'<div class="cover'+(cls?' '+cls:'')+'" style="--h:'+hueOf(b.id)+(b.cover?";background-image:url('"+b.cover+"')":'')+'">'+(b.cover?'':'<span>'+esc(b.title)+'</span>')+'</div>';
function rLib(){
  const v=$('#v-lib');
  let h='<div class="wrap stack"><div class="row"><h1 class="grow">Libreria</h1><button class="btn sm" id="add">+ Aggiungi</button></div>';
  h+=statsBand();
  if(!LIB.length){
    h+='<div class="empty stack"><h2>Nessun libro</h2><div class="mute">Aggiungi un file EPUB, PDF, Word (.docx), TXT o HTML. Resta sul telefono e lo leggi anche offline.</div><button class="btn" id="add2">Aggiungi il primo libro</button></div>';
  }else{
    const cur=S.last&&bookById(S.last);
    if(cur&&statusOf(cur)==='reading'){
      const p=planInfo(cur);
      h+='<button class="card row lrow hero" id="cont" style="gap:14px">'+coverHtml(cur)+'<div class="grow"><div class="eyebrow">Continua a leggere</div><div style="font-family:var(--disp);font-size:19px;font-weight:600;line-height:1.2;margin:2px 0">'+esc(cur.title)+'</div><div class="small mute">'+pctTxt(frac(cur))+(p&&!p.paused&&!p.wait?' · tappa '+p.L+'/'+p.n+' al '+Math.round(p.pctDay*100)+'%':' · '+dur(cur.words*(1-frac(cur)))+' rimanenti')+'</div><div class="bar" style="margin-top:8px"><i style="width:'+frac(cur)*100+'%"></i></div></div></button>';
    }
    const fl=[['all','Tutti'],['reading','In lettura'],['new','Da leggere'],['done','Letti']];
    h+='<div class="row wrap">'+fl.map(f=>'<button class="chip'+(S.filter===f[0]?' on':'')+'" data-f="'+f[0]+'">'+f[1]+'</button>').join('')+'</div>';
    h+='<div class="row"><select class="input grow" id="sort" aria-label="Ordina"><option value="recent">Recenti</option><option value="title">Titolo</option><option value="prog">Avanzamento</option></select><button class="chip" id="vw">'+(S.view==='grid'?'Elenco':'Griglia')+'</button></div>';
    let items=LIB.filter(b=>S.filter==='all'||statusOf(b)===S.filter);
    const key=b=>(S.bk[b.id]&&S.bk[b.id].opened)||0;
    if(S.sort==='title')items.sort((a,b)=>a.title.localeCompare(b.title,'it'));
    else if(S.sort==='prog')items.sort((a,b)=>frac(b)-frac(a));
    else items.sort((a,b)=>(key(b)||b.added)-(key(a)||a.added));
    items.sort((a,b)=>!!(S.bk[b.id]&&S.bk[b.id].pin)-!!(S.bk[a.id]&&S.bk[a.id].pin));
    if(!items.length)h+='<div class="mute" style="padding:16px 0">Nessun libro in questo elenco.</div>';
    else if(S.view==='grid'){
      h+='<div class="grid">'+items.map(b=>{const f=frac(b),st=statusOf(b),p=planInfo(b);
        return '<div class="bk"><button data-o="'+b.id+'" style="text-align:left;display:flex;flex-direction:column;gap:6px">'+coverHtml(b)+(isPin(b)?'<span class="badge pin">'+PIN+'</span>':st==='done'?'<span class="badge ok">Letto</span>':st==='new'?'<span class="badge">Nuovo</span>':'')+'<div class="bar"><i style="width:'+f*100+'%"></i></div><div class="t1">'+esc(b.title)+'</div></button><div class="t2"><span>'+(st==='new'?'Da leggere':pctTxt(f))+'</span><span>'+(p?Math.max(1,Math.round(p.perP))+' pag/g':'')+'</span></div><button class="more" data-m="'+b.id+'" aria-label="Opzioni">⋮</button></div>'}).join('')+'</div>';
    }else{
      h+='<div class="list cards">'+items.map(b=>{const f=frac(b),st=statusOf(b),p=planInfo(b);
        return '<div class="rowc row" style="padding:10px!important"><button class="lrow grow" data-o="'+b.id+'">'+coverHtml(b)+'<div class="grow"><div class="t1" style="font-weight:600">'+(isPin(b)?'<span class="pinic">'+PIN+'</span> ':'')+esc(b.title)+'</div><div class="small mute">'+esc(b.author||'')+'</div><div class="bar" style="margin:6px 0 3px"><i style="width:'+f*100+'%"></i></div><div class="small mute">'+(st==='new'?'Da leggere':st==='done'?'Letto':pctTxt(f))+(p?' · '+Math.max(1,Math.round(p.perP))+' pag/giorno':'')+'</div></div></button><button class="ib" data-m="'+b.id+'" aria-label="Opzioni">⋮</button></div>'}).join('')+'</div>';
    }
  }
  v.innerHTML=h+'</div>';
  const ad=()=>$('#fpick').click();const a1=$('#add'),a2=$('#add2');if(a1)a1.onclick=ad;if(a2)a2.onclick=ad;
  v.querySelectorAll('[data-o]').forEach(e=>e.onclick=()=>openBook(e.dataset.o));
  v.querySelectorAll('[data-m]').forEach(e=>e.onclick=()=>bookSheet(bookById(e.dataset.m)));
  v.querySelectorAll('[data-f]').forEach(e=>e.onclick=()=>{S.filter=e.dataset.f;save();rLib()});
  const so=$('#sort',v);if(so){so.value=S.sort;so.onchange=()=>{S.sort=so.value;save();rLib()}}
  const vw=$('#vw',v);if(vw)vw.onclick=()=>{S.view=S.view==='grid'?'list':'grid';save();rLib()};
  const ct=$('#cont',v);if(ct)ct.onclick=()=>openBook(S.last);
}
$('#fpick').onchange=async e=>{const f=[...e.target.files];e.target.value='';if(f.length)await addFiles(f)};

/* ---------- aggiunta libri ---------- */
function impUI(t,pct,sub){const e=$('#imp');e.classList.add('on');$('#imp-t').textContent=t;$('#imp-b').style.width=Math.round((pct||0)*100)+'%';$('#imp-s').textContent=sub||''}
async function storeBook(res,override){
  const m=res.meta;if(override){if(override.title)m.title=override.title;if(override.author!=null)m.author=override.author}
  await IDB.put('books',m);await IDB.put('content',{ch:res.content},m.id);await IDB.put('files',res.blob,m.id);
  const i=LIB.findIndex(b=>b.id===m.id);if(i>=0)LIB[i]=m;else LIB.push(m);
  S.known[m.id]={title:m.title,author:m.author,ext:m.ext};save();GIDX=null;
}
async function addFiles(files,overrides){
  const errs=[],added=[];
  try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
  for(let i=0;i<files.length;i++){
    const f=files[i];
    try{
      impUI('Importo '+(i+1)+' di '+files.length,0,f.name);
      const res=await importFile(f,p=>impUI('Importo '+(i+1)+' di '+files.length,p,f.name));
      if(bookById(res.meta.id)){errs.push(f.name+': già in libreria');continue}
      impUI('Salvo…',.97,f.name);await storeBook(res,overrides&&overrides[res.meta.id]);added.push(res.meta);
    }catch(e){errs.push(f.name+': '+(e.message||'errore'))}
  }
  $('#imp').classList.remove('on');
  if(curView==='lib')rLib();
  if(errs.length)sheet('<div class="hd"><h3>Non importato</h3><button class="btn sec sm" data-x>Chiudi</button></div><div class="stack">'+errs.map(x=>'<div class="warn">'+esc(x)+'</div>').join('')+'</div>');
  else if(added.length===1)banner('Aggiunto: '+added[0].title,[{l:'Apri',fn:()=>openBook(added[0].id)},{l:'Obiettivo',fn:()=>goalSheet(added[0])}],12000);
  else if(added.length)toast(added.length+' libri aggiunti');
  return added;
}

/* ---------- scheda libro, obiettivo, modifica, elimina ---------- */
const PIN='📌';
function isPin(b){return !!(S.bk[b.id]&&S.bk[b.id].pin)}
function bookSheet(b){
  if(!b)return;const s=S.bk[b.id]||{};const p=planInfo(b);
  sheet('<div class="hd"><h3>Libro</h3><button class="btn sec sm" data-x>Chiudi</button></div><div class="lrow">'+coverHtml(b)+'<div class="grow"><div style="font-family:var(--disp);font-size:18px;font-weight:600;line-height:1.2">'+esc(b.title)+'</div><div class="small mute">'+esc(b.author||'Autore sconosciuto')+'</div><div class="small mute tab" style="margin-top:4px">'+b.ext.toUpperCase()+' · '+b.words.toLocaleString('it-IT')+' parole · '+pagesOf(b)+' pagine · '+pctTxt(frac(b))+'</div>'+(p?'<div class="small" style="margin-top:4px;color:var(--acc)">Finire entro '+fmtDate(p.end)+' · '+Math.max(1,Math.round(p.perP))+' pag/giorno</div>':'')+'</div></div>'
   +'<div class="stack"><button class="btn" id="bo">'+(s.w>0?'Continua a leggere':'Comincia a leggere')+'</button><button class="btn sec" id="bp">'+(isPin(b)?'Togli dai preferiti':'Fissa in alto (preferito)')+'</button><button class="btn sec" id="bg">Obiettivo di lettura</button><button class="btn sec" id="be">Modifica titolo e autore</button><button class="btn sec" id="bd">'+(s.done?'Segna come da leggere':'Segna come letto')+'</button><button class="btn sec" id="bf">Scarica il file originale</button><button class="btn sec" id="bx" style="color:var(--warn);border-color:var(--warn)">Rimuovi dalla libreria</button></div>',box=>{
    $('#bo',box).onclick=()=>closeSheet(()=>openBook(b.id));
    $('#bp',box).onclick=()=>{const x=BK(b.id);x.pin=!x.pin;save();closeSheet(()=>rLib())};
    $('#bg',box).onclick=()=>goalSheet(b);
    $('#be',box).onclick=()=>editSheet(b);
    $('#bd',box).onclick=()=>{const x=BK(b.id);x.done=!x.done;if(x.done){x.w=b.words;x.max=b.words}else if(x.w>=b.words*.985){x.w=0;x.max=0;x.pos=null}save();closeSheet(()=>rLib())};
    $('#bf',box).onclick=async()=>{const f=await IDB.get('files',b.id);if(f)download(f,b.title.replace(/[\\/:*?"<>|]/g,'')+'.'+b.ext);else toast('File non trovato')};
    $('#bx',box).onclick=()=>removeSheet(b)})
}
function editSheet(b){
  sheet('<div class="hd"><h3>Titolo e autore</h3><button class="btn sec sm" data-x>Chiudi</button></div><div class="field"><label for="et">Titolo</label><input class="input" id="et" type="text" value="'+esc(b.title)+'"></div><div class="field"><label for="ea">Autore</label><input class="input" id="ea" type="text" value="'+esc(b.author||'')+'"></div><button class="btn" id="es">Salva</button>',box=>{
    $('#es',box).onclick=async()=>{b.title=$('#et',box).value.trim()||b.title;b.author=$('#ea',box).value.trim();await IDB.put('books',b);S.known[b.id]={...S.known[b.id],title:b.title,author:b.author};save();closeSheet(()=>{if(curView==='lib')rLib()})}})
}
function removeSheet(b){
  sheet('<div class="hd"><h3>Rimuovere il libro?</h3></div><div class="small mute">«'+esc(b.title)+'». Puoi tenere segnalibri, note e progressi: se riaggiungi lo stesso file tornano al loro posto.</div><div class="stack"><button class="btn" id="r1">Rimuovi e tieni note e progressi</button><button class="btn sec" id="r2" style="color:var(--warn);border-color:var(--warn)">Rimuovi tutto</button><button class="btn sec" data-x>Annulla</button></div>',box=>{
    const doit=async all=>{await IDB.del('books',b.id);await IDB.del('content',b.id);await IDB.del('files',b.id);LIB=LIB.filter(x=>x.id!==b.id);if(all){delete S.bk[b.id];delete S.known[b.id]}if(S.last===b.id)S.last=null;GIDX=null;save();closeSheet(()=>{rLib();toast('Libro rimosso')})};
    $('#r1',box).onclick=()=>doit(false);$('#r2',box).onclick=()=>doit(true)})
}
function goalSheet(b){
  const s=BK(b.id),g=s.goal;let mode=g&&g.mode!=='date'?g.mode:(g?'date':'days'),n=g?g.n:30,date=g&&g.mode==='date'?g.end:addDays(todayISO(),30),sd=todayISO();
  const endOf=()=>mode==='days'?addDays(sd,Math.max(1,n)-1):mode==='weeks'?addDays(sd,Math.max(1,n)*7-1):date;
  const draw=box=>{
    const end=endOf(),days=dayDiff(sd,end)+1,remW=Math.max(0,b.words-s.w),pg=pagesOf(b)/b.words;
    $('#g-pv',box).innerHTML=days<1?'<span class="warn">La data di fine deve essere dopo la partenza.</span>':'Parti il <b>'+fmtDate(sd)+'</b> dalla pagina '+Math.round(s.w*pg+1)+', finisci entro <b>'+fmtDateY(end)+'</b>. Il libro viene diviso in <b>'+days+(days===1?' tappa':' tappe')+'</b>, una al giorno: circa <b>'+Math.max(1,Math.round(remW*pg/days))+' pagine</b> ciascuna, '+dur(remW/days)+' di lettura. Le trovi in Indice > Giorni.';
    $('#g-n',box).hidden=mode==='date';$('#g-d',box).hidden=mode!=='date';
    box.querySelectorAll('#g-m button').forEach(x=>x.classList.toggle('on',x.dataset.v===mode));
  };
  const manage=g?'<h3>Gestisci</h3><div class="stack"><button class="btn sec" id="g-p">'+(g.pausedOn?'Riprendi (le tappe slittano di '+Math.max(0,dayDiff(g.pausedOn,todayISO()))+' giorni)':'Metti in pausa')+'</button><button class="btn sec" id="g-z">Azzera la lettura e riparti da zero</button><button class="btn sec" id="g-r" style="color:var(--warn);border-color:var(--warn)">Rimuovi obiettivo</button></div>':'';
  sheet('<div class="hd"><h3>Obiettivo di lettura</h3><button class="btn sec sm" data-x>Chiudi</button></div><div class="small mute">'+esc(b.title)+(g?' · le impostazioni qui sotto ricalcolano le tappe dal punto in cui sei ora':'')+'</div><div class="seg" id="g-m"><button data-v="days">Giorni</button><button data-v="weeks">Settimane</button><button data-v="date">Data</button></div><div class="field" id="g-n"><label for="g-nv">Quanti giorni o settimane hai a disposizione</label><input id="g-nv" type="number" min="1" max="999" value="'+n+'"></div><div class="field" id="g-d"><label for="g-dv">Finire entro</label><input id="g-dv" type="date" value="'+date+'" min="'+todayISO()+'"></div><div class="field"><label for="g-sv">Parti da</label><input id="g-sv" type="date" value="'+sd+'" min="'+todayISO()+'"></div><div class="small" id="g-pv"></div><button class="btn" id="g-s">'+(g?'Riparti da qui':'Avvia la lettura')+'</button>'+manage,box=>{
    draw(box);
    box.querySelectorAll('#g-m button').forEach(x=>x.onclick=()=>{mode=x.dataset.v;draw(box)});
    $('#g-nv',box).oninput=e=>{n=+e.target.value||1;draw(box)};$('#g-dv',box).onchange=e=>{date=e.target.value||date;draw(box)};$('#g-sv',box).onchange=e=>{sd=e.target.value||todayISO();draw(box)};
    $('#g-s',box).onclick=()=>{const tot=dayDiff(sd,endOf())+1;if(tot<1)return toast('Controlla le date');s.goal={mode,n,end:endOf(),start:sd,w0:s.w,tot};s.ds={d:todayISO(),w:s.w};save();closeSheet(()=>{go(curView);toast(sd>todayISO()?'La lettura parte il '+fmtDate(sd):'Lettura avviata')})};
    const p=$('#g-p',box);if(p)p.onclick=()=>{if(g.pausedOn){const d=Math.max(0,dayDiff(g.pausedOn,todayISO()));g.start=addDays(g.start,d);g.end=addDays(g.end,d);delete g.pausedOn;s.ds=null;ensureDay(b.id)}else g.pausedOn=todayISO();save();closeSheet(()=>{go(curView);toast(g.pausedOn?'Libro in pausa':'Lettura ripresa')})};
    const z=$('#g-z',box);if(z)z.onclick=()=>zeroSheet(b);
    const r=$('#g-r',box);if(r)r.onclick=()=>{s.goal=null;save();closeSheet(()=>go(curView))}})
}
function zeroSheet(b){
  sheet('<div class="hd"><h3>Azzerare la lettura?</h3></div><div class="small mute">Il libro torna alla pagina 1 e le tappe ricominciano da oggi con la stessa durata. Segnalibri, note ed evidenziazioni restano.</div><div class="stack"><button class="btn" id="z1">Azzera e riparti da oggi</button><button class="btn sec" data-x>Annulla</button></div>',box=>{
    $('#z1',box).onclick=()=>{const s=BK(b.id),g=s.goal;s.w=0;s.max=0;s.done=false;s.pos=null;s.ds={d:todayISO(),w:0};if(g){const tot=Math.max(1,g.tot||dayDiff(g.start,g.end)+1);S.bk[b.id].goal={mode:'days',n:tot,end:addDays(todayISO(),tot-1),start:todayISO(),w0:0,tot}}save();closeSheet(()=>{go(curView);toast('Lettura azzerata')})}})
}

/* ================= Oggi ================= */
function rOggi(){
  const v=$('#v-oggi'),t=todayISO();
  const plans=LIB.map(b=>({b,p:planInfo(b)})).filter(x=>x.p);
  let h='<div class="wrap stack"><div><div class="eyebrow">'+new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'})+'</div><h1>Oggi</h1></div>';
  const tw=todayWords();
  h+=statsBand();
  if(!plans.length)h+='<div class="empty stack"><div class="mute">Nessun obiettivo attivo. Apri un libro dalla libreria e imposta in quanti giorni o settimane vuoi finirlo: qui vedrai quante pagine leggere ogni giorno.</div></div>';
  plans.forEach(({b,p})=>{
    const f=p.pctDay;
    h+='<button class="card stack" data-o="'+b.id+'" style="text-align:left"><div class="lrow">'+coverHtml(b)+'<div class="grow"><div style="font-family:var(--disp);font-size:17px;font-weight:600;line-height:1.2">'+esc(b.title)+'</div>'
     +(p.late?'<div class="small warn">Scadenza passata il '+fmtDate(p.end)+'</div>':'<div class="small mute">'+(p.paused?'<b style="color:var(--warn)">In pausa</b> · ':p.wait?'<b>Parte il '+fmtDate(p.startsOn)+'</b> · ':'')+'<b>'+tapLbl(p)+'</b> di '+p.n+' · entro il '+fmtDate(p.end)+'</div>')
     +'<div style="margin-top:6px;font-size:15px">'+(p.paused?'<span class="mute">Riprendi dal libro: Obiettivo di lettura</span>':p.wait?'Prima tappa pag. <b>'+p.fromP+'</b> - <b>'+p.toP+'</b>':p.ok?'<b style="color:var(--ok)">Obiettivo di oggi raggiunto</b>':'Oggi pag. <b>'+p.fromP+'</b> - <b>'+p.toP+'</b> <span class="mute">('+Math.max(1,Math.round(p.perP))+(Math.round(p.perP)<=1?' pagina, ':' pagine, ')+dur(p.perW)+')</span>')+(p.nb>1&&!p.ok&&!p.paused&&!p.wait?'<div class="small warn">'+(p.nb-1)+(p.nb===2?' tappa arretrata':' tappe arretrate')+' sommate a quella di oggi</div>':'')+'</div></div></div><div class="bar"><i style="width:'+f*100+'%"></i></div><div class="small mute tab">'+(p.nb>1?'Tappe sommate':'Tappa di oggi')+' al '+Math.round(f*100)+'% · libro al '+pctTxt(frac(b))+'</div></button>';
  });
  v.innerHTML=h+'</div>';
  v.querySelectorAll('[data-o]').forEach(e=>e.onclick=()=>openBook(e.dataset.o));
}

/* ================= Cerca in tutta la libreria ================= */
let GIDX=null;
async function buildGlobalIdx(){
  if(GIDX)return GIDX;GIDX=[];
  for(let i=0;i<LIB.length;i++){
    const b=LIB[i];impUI('Preparo la ricerca',i/LIB.length,b.title);await tick();
    const ct=await IDB.get('content',b.id);if(!ct)continue;
    ct.ch.forEach((h,c)=>[...htmlBody(h).children].forEach((el,bi)=>{const t=el.textContent.replace(/\s+/g,' ').trim();if(t)GIDX.push({id:b.id,c,b:bi,t,n:norm(t)})}));
  }
  $('#imp').classList.remove('on');return GIDX;
}
function snippet(t,n,words){const w=words.find(x=>n.includes(x))||words[0];const i=Math.max(0,n.indexOf(w));const a=Math.max(0,i-70);return (a>0?'…':'')+t.slice(a,a+200)+(a+200<t.length?'…':'')}
function hiHtml(t,words){let x=esc(t);const re=new RegExp('('+words.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','gi');return x.replace(re,'<mark style="background:var(--h1);color:inherit">$1</mark>')}
function rCerca(){
  const v=$('#v-cerca');
  v.innerHTML='<div class="wrap stack"><h1>Cerca</h1><div class="small mute">Cerca una parola o una frase in tutti i tuoi libri.</div><div class="row"><input class="input grow" id="q" type="search" placeholder="Parola o frase" autocomplete="off"><button class="btn sm" id="qg">Cerca</button></div><div class="small mute" id="qi"></div><div class="list" id="qr"></div></div>';
  const run=async()=>{
    const q=norm($('#q').value.trim());if(q.length<3){$('#qi').textContent=q?'Scrivi almeno 3 lettere':'';$('#qr').innerHTML='';return}
    if(!LIB.length){$('#qi').textContent='La libreria è vuota';return}
    const idx=await buildGlobalIdx();const words=q.split(/\s+/);const res=[];
    for(const r of idx){if(words.every(w=>r.n.includes(w))){res.push(r);if(res.length>=300)break}}
    $('#qi').textContent=res.length>=300?'Prime 300 corrispondenze':res.length+(res.length===1?' corrispondenza':' corrispondenze');
    $('#qr').innerHTML=res.map((r,i)=>{const b=bookById(r.id);return '<button class="item" data-i="'+i+'" style="align-items:flex-start;flex-direction:column;gap:3px"><span class="small" style="color:var(--acc);font-weight:600">'+esc(b.title)+' · '+esc(b.chapters[r.c].t)+'</span><span>'+hiHtml(snippet(r.t,r.n,words),words)+'</span></button>'}).join('');
    $('#qr').querySelectorAll('.item').forEach(e=>e.onclick=()=>{const r=res[+e.dataset.i];openBook(r.id,{c:r.c,b:r.b,off:30})})
  };
  $('#qg').onclick=run;$('#q').onkeydown=e=>{if(e.key==='Enter')run()};
}

/* ================= Altro ================= */
const kindOf={bm:'Segnalibri',notes:'Note',hl:'Evidenziazioni',dif:'Da capire'};
function annCount(kind){let n=0;LIB.forEach(b=>{const s=S.bk[b.id];if(!s)return;if(kind==='bm')n+=s.bm.length;else{const g=new Set();s.ann.forEach(a=>{if(kind==='notes'&&a.txt)g.add(a.gid);if(kind==='hl'&&a.k==='h'&&a.col)g.add(a.gid);if(kind==='dif'&&a.k==='q')g.add(a.gid)});n+=g.size}});return n}
function rAltro(){
  const v=$('#v-altro');
  const missing=Object.keys(S.known).filter(id=>!bookById(id));
  v.innerHTML='<div class="wrap stack"><h1>Altro</h1>'
  +'<div class="list cards">'+Object.keys(kindOf).map(k=>'<button class="item rowc" data-l="'+k+'"><span class="grow">'+kindOf[k]+'</span><span class="mute tab">'+annCount(k)+'</span></button>').join('')+'</div>'
  +'<div class="list cards"><button class="item rowc" id="o-stats"><span class="grow">Statistiche di lettura</span><span class="mute tab">'+streak()+' giorni di fila</span></button><button class="item rowc" id="o-words"><span class="grow">Parole da imparare</span><span class="mute tab">'+(S.words||[]).length+'</span></button></div>'
  +(missing.length?'<div class="card stack"><h3>Libri da riaggiungere ('+missing.length+')</h3><div class="small mute">I tuoi dati li riguardano ma il file non è su questo telefono. Aggiungi lo stesso file e ritrovi note e progressi.</div>'+missing.map(id=>'<div class="small">· '+esc(S.known[id].title||id)+(S.known[id].author?' - '+esc(S.known[id].author):'')+'</div>').join('')+'<button class="btn sec sm" id="m-add">Aggiungi file</button></div>':'')
  +'<h2>Impostazioni</h2>'
  +'<div class="card stack"><h3>Intelligenza artificiale</h3><div class="field"><label for="k">Chiave API Claude</label><input id="k" type="password" autocomplete="off" class="input" value="'+esc(S.key)+'"></div><div class="field"><label for="m">Modello</label><input id="m" class="input" type="text" value="'+esc(S.model)+'"></div><label class="row"><span class="grow">Cerca sul web nelle spiegazioni</span><input type="checkbox" id="w"'+(S.web?' checked':'')+'></label><div class="small mute">La chiave resta solo su questo dispositivo.</div></div>'
  +'<div class="card stack"><h3>Lettura</h3><div class="field"><div class="row"><label for="wpm" class="grow">Parole al minuto</label><span class="small mute tab" id="wpmv">'+S.wpm+'</span></div><input id="wpm" type="range" min="100" max="400" step="10" value="'+S.wpm+'"></div><div class="field"><div class="row"><label for="wpp" class="grow">Parole per pagina (libri senza pagine fisse)</label><span class="small mute tab" id="wppv">'+S.wpp+'</span></div><input id="wpp" type="range" min="150" max="400" step="10" value="'+S.wpp+'"></div></div>'
  +'<div class="card stack"><h3>Copia di sicurezza</h3><div class="small mute">Per cambiare telefono. La copia dei dati contiene segnalibri, note, evidenziazioni, progressi, obiettivi e impostazioni, chiavi API comprese. La copia completa contiene anche i libri.</div><div class="small tab" id="b-last">'+(S.lastBackup?'Ultima copia il '+fmtDateY(S.lastBackup):'Nessuna copia scaricata finora')+'</div><div class="row wrap"><button class="btn sec sm" id="b-exp">Scarica dati</button><button class="btn sec sm" id="b-zip">Scarica copia completa</button><button class="btn sec sm" id="b-imp">Importa</button></div></div>'
  +'<div class="card stack"><h3>Salvataggio sul sito</h3><div class="small mute">Copia automatica di libri, progressi e impostazioni sul tuo sito. Per cambiare telefono, inserisci qui indirizzo e chiave e tocca Ripristina.</div><div class="field"><label for="cl-u">Indirizzo del file PHP</label><input class="input" id="cl-u" type="url" autocomplete="off" placeholder="https://tuosito.it/ebook1000-sync.php" value="'+esc(CL().url)+'"></div><div class="field"><label for="cl-k">Chiave</label><input class="input" id="cl-k" type="password" autocomplete="off" value="'+esc(CL().key)+'"></div><label class="row"><span class="grow">Salva in automatico</span><input type="checkbox" id="cl-a"'+(CL().auto?' checked':'')+'></label><div class="small tab" id="cl-s">'+clStatus()+'</div><div class="row wrap"><button class="btn sec sm" id="cl-now">Salva ora</button><button class="btn sec sm" id="cl-res">Ripristina dal sito</button></div></div>'
  +'<div class="card stack"><h3>Versione</h3><div class="small tab" id="ver">Versione '+VERSION+'</div><div class="small mute" id="ver-s"></div><div class="small" id="ver-n">'+newsHtml(VERSION)+'</div><div class="row wrap"><button class="btn sec sm" id="ver-c">Controlla aggiornamenti</button><button class="btn sec sm" id="ver-u">Aggiorna ora</button></div><div class="small mute">L’aggiornamento non tocca libri, note, segnalibri e progressi.</div></div>'
  +'<div class="card stack"><h3>Spazio</h3><div class="small mute" id="stg">Calcolo…</div></div>'
  +'<div class="small mute">I libri restano sul telefono. Nessun file viene inviato a nessuno, salvo i brani che chiedi di spiegare all’AI.</div></div>';
  v.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>openLib(b.dataset.l));
  $('#o-stats',v).onclick=statsSheet;$('#o-words',v).onclick=wordsSheet;
  const ma=$('#m-add',v);if(ma)ma.onclick=()=>$('#fpick').click();
  $('#k').onchange=e=>{S.key=e.target.value.trim();save()};$('#m').onchange=e=>{S.model=e.target.value.trim()||'claude-haiku-5-5';save()};$('#w').onchange=e=>{S.web=e.target.checked;save()};
  $('#wpm').oninput=e=>{S.wpm=+e.target.value;$('#wpmv').textContent=S.wpm;save()};$('#wpp').oninput=e=>{S.wpp=+e.target.value;$('#wppv').textContent=S.wpp;save()};
  $('#ver-c').onclick=async()=>{const e=$('#ver-s');e.textContent='Controllo…';const r=await remoteVersion();if(r==null||r===VERSION){e.textContent=r==null?'Non riesco a controllare: serve la connessione.':'Hai già l’ultima versione ('+VERSION+').';return}e.innerHTML='Disponibile la versione '+r+'. Tocca Aggiorna ora.<br>'+newsHtml(r,remoteVersion.news)};
  $('#ver-u').onclick=applyUpdate;
  $('#cl-u').onchange=e=>{CL().url=e.target.value.trim();CL().up={};CL().h='';save()};$('#cl-k').onchange=e=>{CL().key=e.target.value.trim();save()};$('#cl-a').onchange=e=>{CL().auto=e.target.checked;save()};
  $('#cl-now').onclick=()=>{if(!clOk()){toast('Inserisci indirizzo e chiave');return}cloudPush(true)};$('#cl-res').onclick=()=>{if(!clOk()){toast('Inserisci indirizzo e chiave');return}cloudRestore()};
  $('#b-exp').onclick=exportData;$('#b-zip').onclick=exportZip;$('#b-imp').onclick=importSheet;
  if(navigator.storage&&navigator.storage.estimate)navigator.storage.estimate().then(e=>{const mb=x=>(x/1048576).toFixed(0);$('#stg').textContent='Occupati '+mb(e.usage)+' MB su circa '+mb(e.quota)+' disponibili.'}).catch(()=>{$('#stg').textContent=''});else $('#stg').textContent='';
}
function openLib(kind){
  let h='<div class="hd"><h2>'+kindOf[kind]+'</h2><button class="btn sec sm" data-x>Chiudi</button></div>',n=0;
  LIB.forEach(b=>{
    const s=S.bk[b.id];if(!s)return;let items=[];
    if(kind==='bm')items=s.bm.map(x=>({c:x.c,b:x.b,t:x.t,col:0,txt:''}));
    else{const seen=new Set();s.ann.forEach(a=>{if(seen.has(a.gid))return;const all=s.ann.filter(x=>x.gid===a.gid);const first=all[0];
      const ok=kind==='notes'?all.some(x=>x.txt):kind==='hl'?first.k==='h'&&first.col:first.k==='q';
      if(ok){seen.add(a.gid);items.push({c:first.c,b:first.b,t:all.map(x=>x.t).join(' ')||'',col:first.col,txt:all.map(x=>x.txt).join(' ')})}})}
    if(!items.length)return;items.sort((x,y)=>x.c-y.c||x.b-y.b);
    h+='<h3 style="margin-top:6px">'+esc(b.title)+'</h3>';
    items.forEach(it=>{n++;h+='<button class="stack hl-it c'+(it.col||0)+'" data-o="'+b.id+'" data-c="'+it.c+'" data-b="'+it.b+'" style="text-align:left;padding-bottom:8px"><span class="small" style="color:var(--acc);font-weight:600">'+esc(b.chapters[it.c]?b.chapters[it.c].t:'')+'</span><span class="small">'+esc((it.t||'').slice(0,200))+'</span>'+(it.txt?'<span class="q-note ai">'+esc(it.txt)+'</span>':'')+'</button>'});
  });
  if(!n)h+='<div class="mute">Ancora niente. Seleziona del testo nel lettore per aggiungerne.</div>';
  sheet(h,box=>box.querySelectorAll('[data-o]').forEach(e=>e.onclick=()=>closeSheet(()=>openBook(e.dataset.o,{c:+e.dataset.c,b:+e.dataset.b,off:30}))))
}

/* ================= parole da imparare ================= */
const WINT=[1,3,7,16,35,90];
function sentenceAround(d){
  try{const bl=d.blocks[0],el=htmlBody(R.content[R.c]).children[bl.b];if(!el)return '';const t=el.textContent;
    let x=0;for(let i=bl.s-1;i>=0;i--){if('.!?…'.includes(t[i])){x=i+1;break}}
    let z=t.length;for(let i=bl.e;i<t.length;i++){if('.!?…'.includes(t[i])){z=i+1;break}}
    return t.slice(x,z).replace(/\s+/g,' ').trim().slice(0,320)
  }catch(e){return ''}
}
function askMeaning(w,ctx,box){
  const st=$('#wd-st',box);st.textContent='Cerco il significato…';
  askClaude([{role:'user',content:'Spiega in italiano, in una o due righe, il significato di «'+w+'»'+(ctx?' nel contesto di questa frase: «'+ctx+'»':'')+'. Se non sei sicuro del significato, dillo. Rispondi solo con il significato.'}],{max:300}).then(t=>{$('#wd-m',box).value=t;st.textContent=''}).catch(e=>{st.textContent=e.message})
}
function wordSheet(d){
  const w0=d.text.length>60?d.text.slice(0,60):d.text,ctx=sentenceAround(d);
  sheet('<div class="hd"><h3>Parola da imparare</h3><button class="btn sec sm" data-x>Chiudi</button></div>'
   +'<div class="field"><label for="wd-w">Parola o espressione</label><input class="input" id="wd-w" value="'+esc(w0)+'"></div>'
   +(ctx?'<div class="small" style="border-left:3px solid var(--line);padding-left:8px;color:var(--mute)">'+esc(ctx)+'</div>':'')
   +'<div class="field"><label for="wd-m">Significato</label><textarea id="wd-m" placeholder="Scrivilo tu oppure chiedilo all’AI"></textarea></div>'
   +'<div class="row wrap"><button class="btn sec" id="wd-ai">Chiedi all’AI</button><button class="btn grow" id="wd-s">Salva</button></div><div class="small mute" id="wd-st"></div>',box=>{
    $('#wd-ai',box).onclick=()=>{const w=$('#wd-w',box).value.trim();if(!w)return toast('Scrivi la parola');askMeaning(w,ctx,box)};
    $('#wd-s',box).onclick=()=>{const w=$('#wd-w',box).value.trim();if(!w)return toast('Scrivi la parola');const m=$('#wd-m',box).value.trim();
      S.words=S.words||[];const ex=S.words.find(x=>norm(x.w)===norm(w));
      if(ex){if(m)ex.mean=m;if(!ex.ctx)ex.ctx=ctx;ex.ts=Date.now()}
      else S.words.push({id:'w'+Date.now().toString(36)+Math.random().toString(36).slice(2,4),w,ctx,mean:m,bid:R.id,book:R.b.title,ts:Date.now(),n:0,next:Date.now()});
      save();closeSheet(()=>{endSel();toast('Parola salvata')})}})
}
function wordEdit(id){
  const x=(S.words||[]).find(y=>y.id===id);if(!x)return;
  sheet('<div class="hd"><h3>Parola</h3><button class="btn sec sm" data-x>Chiudi</button></div>'
   +'<div class="field"><label for="wd-w">Parola o espressione</label><input class="input" id="wd-w" value="'+esc(x.w)+'"></div>'
   +(x.ctx?'<div class="small" style="border-left:3px solid var(--line);padding-left:8px;color:var(--mute)">'+esc(x.ctx)+'</div>':'')
   +(x.book?'<div class="small mute">'+esc(x.book)+'</div>':'')
   +'<div class="field"><label for="wd-m">Significato</label><textarea id="wd-m">'+esc(x.mean||'')+'</textarea></div>'
   +'<div class="row wrap"><button class="btn sec" id="wd-ai">Chiedi all’AI</button><button class="btn grow" id="wd-s">Salva</button><button class="btn sec" id="wd-d" style="color:var(--warn);border-color:var(--warn)">Elimina</button></div><div class="small mute" id="wd-st"></div>',box=>{
    $('#wd-ai',box).onclick=()=>{const w=$('#wd-w',box).value.trim();if(!w)return toast('Scrivi la parola');askMeaning(w,x.ctx,box)};
    $('#wd-s',box).onclick=()=>{const w=$('#wd-w',box).value.trim();if(!w)return toast('Scrivi la parola');x.w=w;x.mean=$('#wd-m',box).value.trim();x.ts=Date.now();save();closeSheet(()=>wordsSheet())};
    $('#wd-d',box).onclick=()=>{S.words=S.words.filter(y=>y.id!==id);save();closeSheet(()=>wordsSheet())}})
}
function reviewSheet(){
  const due=(S.words||[]).filter(x=>(x.next||0)<=Date.now()).sort((p,q)=>(p.next||0)-(q.next||0));
  if(!due.length){toast('Niente da ripassare adesso');return}
  let i=0;
  sheet('<div class="hd"><h3>Ripasso</h3><button class="btn sec sm" data-x>Chiudi</button></div><div class="stack" id="rv"></div>',box=>{
    const rv=$('#rv',box);
    const front=x=>'<div class="small mute tab">'+(i+1)+' di '+due.length+'</div><div style="font-family:var(--disp);font-size:24px;font-weight:600">'+esc(x.w)+'</div>'+(x.ctx?'<div class="small" style="color:var(--mute);font-style:italic">'+esc(x.ctx)+'</div>':'');
    const show=()=>{
      if(i>=due.length){rv.innerHTML='<div class="mute">Ripasso finito. Alla prossima.</div>';return}
      const x=due[i];rv.innerHTML=front(x)+'<button class="btn" id="rv-s">Mostra il significato</button>';
      $('#rv-s',rv).onclick=()=>{rv.innerHTML=front(x)+'<div class="ai">'+esc(x.mean||'Significato non inserito')+'</div><div class="row"><button class="btn sec grow" id="rv-no">Ancora no</button><button class="btn grow" id="rv-ok">La so</button></div>';
        $('#rv-ok',rv).onclick=()=>{x.n=(x.n||0)+1;x.next=Date.now()+WINT[Math.min(x.n-1,WINT.length-1)]*864e5;save();i++;show()};
        $('#rv-no',rv).onclick=()=>{x.n=0;x.next=Date.now()+10*60*1000;save();i++;show()}}
    };show()})
}
function wordsSheet(){
  const L=(S.words||[]).slice().sort((p,q)=>(q.ts||0)-(p.ts||0)),due=L.filter(x=>(x.next||0)<=Date.now()).length;
  sheet('<div class="hd"><h3>Parole da imparare ('+L.length+')</h3><button class="btn sec sm" data-x>Chiudi</button></div>'
   +(L.length?'<button class="btn" id="w-rv">Ripasso'+(due?' ('+due+')':'')+'</button><input class="input" id="w-q" type="search" placeholder="Cerca">':'<div class="mute">Ancora nessuna parola. Nel lettore seleziona una parola e tocca Parola.</div>')
   +'<div class="stack" id="w-l"></div>',box=>{
    const draw=()=>{const q=L.length?norm($('#w-q',box).value.trim()):'';
      $('#w-l',box).innerHTML=L.filter(x=>!q||norm(x.w+' '+(x.mean||'')).includes(q)).map(x=>'<button class="stack hl-it c0" data-w="'+x.id+'" style="text-align:left;padding-bottom:8px"><span class="small" style="color:var(--acc);font-weight:600">'+esc(x.w)+'</span><span class="small">'+esc(x.mean||'Significato da inserire')+'</span>'+(x.ctx?'<span class="small mute" style="font-style:italic">'+esc(x.ctx.slice(0,160))+'</span>':'')+'</button>').join('');
      $('#w-l',box).querySelectorAll('[data-w]').forEach(e=>e.onclick=()=>closeSheet(()=>wordEdit(e.dataset.w)))};
    draw();if(L.length){$('#w-q',box).oninput=draw;$('#w-rv',box).onclick=()=>closeSheet(()=>reviewSheet())}})
}

/* ================= copia di sicurezza ================= */
function dataObj(withKeys){
  const copy=JSON.parse(JSON.stringify({...S,sess:null}));if(!withKeys){copy.key=''}
  return {app:'leggo',v:1,date:todayISO(),S:copy,books:LIB.map(b=>({id:b.id,title:b.title,author:b.author,ext:b.ext}))}
}
function exportData(){try{S.lastBackup=todayISO();save();download(new Blob([JSON.stringify(dataObj(true))],{type:'application/json'}),'ebook1000-dati-'+todayISO()+'.json');toast('Copia scaricata');rAltro()}catch(e){toast('Download non disponibile')}}
async function exportZip(){
  try{
    S.lastBackup=todayISO();save();const files=[{name:'leggo.json',data:new TextEncoder().encode(JSON.stringify(dataObj(true)))}];
    for(let i=0;i<LIB.length;i++){impUI('Preparo la copia completa',i/LIB.length,LIB[i].title);await tick();const f=await IDB.get('files',LIB[i].id);if(f)files.push({name:'books/'+LIB[i].id+'.'+LIB[i].ext,data:f})}
    const z=await Zip.write(files);$('#imp').classList.remove('on');download(z,'ebook1000-completo-'+todayISO()+'.zip');toast('Copia completa scaricata');rAltro()
  }catch(e){$('#imp').classList.remove('on');toast('Errore: '+(e.message||'copia non riuscita'))}
}
function mergeData(o){
  if(!o||o.app!=='leggo'||!o.S)throw new Error('File non valido');
  const key=S.key,keep=S.bk,keepT={...(S.time||{})},keepW=[...(S.words||[])];
  const bk={...keep};Object.keys(o.S.bk||{}).forEach(id=>{if(!keep[id]||(o.S.bk[id].opened||0)>=(keep[id].opened||0))bk[id]=o.S.bk[id]});
  S={...S,...o.S,bk,set:{...DEF,...(o.S.set||{})},tts:{...S.tts,...(o.S.tts||{})},known:{...S.known,...(o.S.known||{})},log:{...(o.S.log||{}),...S.log},sess:null};
  const tm={...(o.S.time||{})};Object.keys(keepT).forEach(d=>{tm[d]=Math.max(tm[d]||0,keepT[d])});S.time=tm;
  const wm=new Map();[...(o.S.words||[]),...keepW].forEach(x=>{const k=norm(x.w),p=wm.get(k);if(!p||(x.ts||0)>(p.ts||0)||((x.ts||0)===(p.ts||0)&&(x.n||0)>(p.n||0)))wm.set(k,x)});S.words=[...wm.values()];
  if(!S.goalMin)S.goalMin=20;
  (o.books||[]).forEach(b=>{S.known[b.id]={title:b.title,author:b.author,ext:b.ext}});
  if(!o.S.key)S.key=key;save();applyTheme()
}
function importSheet(){
  sheet('<div class="hd"><h3>Importa copia</h3><button class="btn sec sm" data-x>Chiudi</button></div><div class="small mute">Scegli il file dati (.json) oppure la copia completa (.zip). I dati più recenti per ogni libro hanno la precedenza.</div><input type="file" id="fi" accept=".json,.zip,application/json,application/zip"><div class="field"><label for="ft">Oppure incolla il testo della copia</label><textarea id="ft"></textarea></div><button class="btn" id="fgo">Importa il testo</button>',box=>{
    $('#fi',box).onchange=async e=>{const f=e.target.files[0];if(!f)return;
      try{
        if(/\.zip$/i.test(f.name)){
          closeSheet(async()=>{
            try{
              impUI('Leggo la copia',.02,f.name);const z=await Zip.read(await f.arrayBuffer());const o=JSON.parse(await z.text('leggo.json'));mergeData(o);
              const names=z.names.filter(n=>/^books\//.test(n));const ov={};
              for(let i=0;i<names.length;i++){const u8=await z.get(names[i]);const id=names[i].replace(/^books\/|\.[^.]+$/g,'');const kn=S.known[id]||{};
                if(bookById(id))continue;
                try{impUI('Importo '+(i+1)+' di '+names.length,i/names.length,kn.title||names[i]);const file=new File([u8],names[i].split('/').pop());const res=await importFile(file,()=>{});await storeBook(res,{title:kn.title,author:kn.author})}catch(er){toast((kn.title||names[i])+': '+er.message)}}
              $('#imp').classList.remove('on');go(curView);toast('Copia importata')
            }catch(er){$('#imp').classList.remove('on');toast('Errore: '+er.message)}
          })
        }else{mergeData(JSON.parse(await f.text()));closeSheet(()=>{go(curView);toast('Dati importati')})}
      }catch(er){toast('File non valido')}};
    $('#fgo',box).onclick=()=>{try{mergeData(JSON.parse($('#ft',box).value));closeSheet(()=>{go(curView);toast('Dati importati')})}catch(er){toast('Testo non valido')}}})
}

/* ================= lettore ================= */
const R={id:null,b:null,content:null,c:0,bw:[],cw:0,sel:null,pages:1,page:0,seekDrag:false,back:null,pgNow:0,idx:null};
/* ---------- timer di lettura, orologio, schermo intero ---------- */
const RT={sess:0,act:Date.now(),tick:0};
const fmtClock=s=>{const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0')};
['pointerdown','touchmove','keydown'].forEach(ev=>document.addEventListener(ev,()=>{RT.act=Date.now()},{passive:true,capture:true}));
document.addEventListener('scroll',()=>{RT.act=Date.now()},{passive:true,capture:true});
function clockNow(){const n=new Date();$('#rs-c').textContent=String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0')}
setInterval(()=>{
  if(!$('#reader').classList.contains('open'))return;
  clockNow();
  const listening=LS.on&&!LS.paused,counting=!document.hidden&&(listening||Date.now()-RT.act<90000);
  if(counting){RT.sess++;const t=todayISO();S.time=S.time||{};S.time[t]=(S.time[t]||0)+1;if(++RT.tick%15===0)save()}
  $('#rs-t').textContent=fmtClock(todaySec());$('#rs-t').classList.toggle('idle',!counting)
},1000);
const inFs=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
function setFs(on){
  try{const el=document.documentElement;
    if(on&&!inFs()){const p=el.requestFullscreen||el.webkitRequestFullscreen;if(p){const r=p.call(el,{navigationUI:'hide'});if(r&&r.catch)r.catch(()=>{})}}
    else if(!on&&inFs()){const x=document.exitFullscreen||document.webkitExitFullscreen;if(x){const r=x.call(document);if(r&&r.catch)r.catch(()=>{})}}
  }catch(e){}
}
function toggleImmersive(){const r=$('#reader'),on=!r.classList.contains('immersive');r.classList.toggle('immersive',on);setFs(on);setTimeout(()=>{if(S.set.mode==='pages')layoutPages()},230)}
document.addEventListener('fullscreenchange',()=>{if(!inFs()&&$('#reader').classList.contains('immersive')){$('#reader').classList.remove('immersive');setTimeout(()=>{if(S.set.mode==='pages')layoutPages()},230)}});
function applyFmt(){
  const s=S.set,t=$('#rtext').style;
  t.setProperty('--rf',FONTS[s.fam]||FONTS.Georgia);t.setProperty('--fs',s.fs+'px');t.setProperty('--lh',s.lh);t.setProperty('--ps',s.ps+'em');t.setProperty('--fw',s.fw);
  t.setProperty('--ta',s.ta);t.setProperty('--hy',s.hy?'auto':'manual');t.setProperty('--ti',s.ti+'em');
  t.setProperty('--mt',s.mt+'px');t.setProperty('--mb',s.mb+'px');t.setProperty('--ml',s.ml+'px');t.setProperty('--mr',s.mr+'px');
  $('#reader').classList.toggle('paged',s.mode==='pages');$('#reader').classList.toggle('pinbar',!!s.pin);$('#rtext').lang='it';applyTheme()
}
async function openBook(id,loc){
  const b=bookById(id);if(!b)return;
  const ct=await IDB.get('content',id);if(!ct){toast('Contenuto del libro non trovato');return}
  R.id=id;R.b=b;R.content=ct.ch;R.sel=null;R.idx=null;R.back=null;R.pgNow=0;
  const s=BK(id);s.opened=Date.now();S.last=id;ensureDay(id);
  const p=loc||s.pos||{c:0,b:0,off:0};
  const c=Math.max(0,Math.min(p.c||0,R.content.length-1));
  const was=$('#reader').classList.contains('open');if(!was)RT.sess=0;RT.act=Date.now();clockNow();$('#rs-t').textContent=fmtClock(todaySec());
  $('#reader').classList.add('open');$('#reader').classList.remove('immersive');applyFmt();drawChapter(c);hideSel();hideBanner();
  if(!was)history.pushState({r:1},'');
  const fix=()=>restoreAnchor({c,b:p.b||0,off:p.off||0});
  setTimeout(fix,60);return fix
}
function closeReader(){stopListen();savePos();setFs(false);$('#reader').classList.remove('open','immersive');S.sess={view:curView,rd:false};save();hideSel();hideBanner();go(curView)}
$('#r-close').onclick=()=>{if(history.state&&history.state.r)history.back();else closeReader()};

function annClass(a){return (a.k==='q'?'dif':a.col?'hl'+a.col:'')+(a.txt?' hasnote':'')}
function wrapRange(el,s,e,cls,gid){
  if(e<=s)return;const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let pos=0,n;const todo=[];
  while((n=w.nextNode())){const len=n.nodeValue.length;const a=Math.max(s,pos),z=Math.min(e,pos+len);if(a<z)todo.push([n,a-pos,z-pos]);pos+=len;if(pos>=e)break}
  todo.forEach(([n,a,z])=>{const r=document.createRange();r.setStart(n,a);r.setEnd(n,z);const m=document.createElement('mark');m.className=cls;m.dataset.g=gid;r.surroundContents(m)})
}
function drawChapter(c){
  R.c=c;const ch=R.b.chapters[c],last=c===R.b.chapters.length-1;
  const body=htmlBody(R.content[c]);R.bw=[];let acc=0;
  [...body.children].forEach((k,i)=>{k.setAttribute('data-i',i);R.bw[i]=acc;acc+=wc(k.textContent)});R.cw=acc;
  const s=BK(R.id);
  let end;
  if(!last)end='<div class="done-box"><button class="btn sec" id="c-next">Capitolo successivo</button><div class="small mute" style="margin-top:8px">'+esc(R.b.chapters[c+1].t)+'</div></div>';
  else end='<div class="done-box">'+(s.done?'<div class="mute">Libro segnato come letto</div><br><button class="btn sec" id="d-undo">Togli il segno</button>':'<div class="mute">Fine del libro</div><br><button class="btn" id="d-done">Segna come letto</button>')+'</div>';
  $('#rtext').innerHTML='<h2 class="ct">'+esc(ch.t)+'</h2>'+body.innerHTML+end;
  const root=$('#rtext');
  s.ann.filter(a=>a.c===c).forEach(a=>{const el=root.querySelector(':scope > [data-i="'+a.b+'"]');if(el)wrapRange(el,a.s,a.e,annClass(a),a.gid)});
  s.bm.filter(x=>x.c===c).forEach(x=>{const el=root.querySelector(':scope > [data-i="'+x.b+'"]');if(el)el.classList.add('bmk')});
  const pl=planInfo(R.b);
  if(pl&&!pl.late&&!pl.paused&&!pl.wait&&pl.toW<R.b.words&&chapterAtW(R.b,pl.toW)===c){const tw=pl.toW-R.b.chapters[c].w0;let bi=0;R.bw.forEach((x,i)=>{if(x<=tw)bi=i});const el=root.querySelector(':scope > [data-i="'+bi+'"]');
    if(el){const m=document.createElement('div');m.className='lesson-end';m.textContent='Fine della tappa di oggi ('+pl.L+' di '+pl.n+')';el.after(m)}}
  $('#r-title').textContent=R.b.title;
  const n=$('#c-next');if(n)n.onclick=()=>chapterStep(1);
  const dd=$('#d-done');if(dd)dd.onclick=()=>{const x=BK(R.id);x.done=true;x.w=R.b.words;x.max=R.b.words;save();drawChapter(R.c);toast('Libro letto')};
  const du=$('#d-undo');if(du)du.onclick=()=>{BK(R.id).done=false;save();drawChapter(R.c)};
  layoutPages();updateInfo()
}
function refresh(){const sc=$('#rscroll').scrollTop,pg=R.page;drawChapter(R.c);$('#rscroll').scrollTop=sc;if(S.set.mode==='pages')showPage(pg)}
function chapterStep(dir){const c=R.c+dir;if(c<0||c>=R.b.chapters.length)return;savePos();drawChapter(c);$('#rscroll').scrollTop=0;showPage(0);savePos()}
$('#r-prev').onclick=()=>{if(S.set.mode==='pages'&&R.page>0)return showPage(R.page-1);chapterStep(-1)};
$('#r-next').onclick=()=>{if(S.set.mode==='pages'&&R.page<R.pages-1)return showPage(R.page+1);chapterStep(1)};

/* paginazione orizzontale */
function layoutPages(){
  const sc=$('#rscroll'),t=$('#rtext');
  if(S.set.mode!=='pages'){t.style.removeProperty('column-width');t.style.width='';t.style.height='';R.pages=1;return}
  const w=sc.clientWidth,h=sc.clientHeight;t.style.width=w+'px';t.style.height=h+'px';t.style.columnWidth=(w-S.set.ml-S.set.mr)+'px';t.style.columnGap=(S.set.ml+S.set.mr)+'px';
  requestAnimationFrame(()=>{R.pages=Math.max(1,Math.round(t.scrollWidth/w));updateInfo()})
}
function showPage(p){const t=$('#rtext'),w=$('#rscroll').clientWidth;R.page=Math.max(0,Math.min(R.pages-1,p));t.scrollLeft=R.page*w;updateInfo()}
function gotoPageOf(el){const t=$('#rtext'),w=$('#rscroll').clientWidth;const x=el.getBoundingClientRect().left-t.getBoundingClientRect().left+t.scrollLeft;showPage(Math.floor(x/w))}

/* posizione e progresso */
function chPr(){const sc=$('#rscroll');if(S.set.mode==='pages')return R.pages>1?R.page/(R.pages-1):0;const m=sc.scrollHeight-sc.clientHeight;return m>0?Math.max(0,Math.min(1,sc.scrollTop/m)):0}
function curW(){const ch=R.b.chapters[R.c];return ch.w0+chPr()*ch.n}
function anchorEl(){
  const sc=$('#rscroll'),top=sc.getBoundingClientRect().top,left=sc.getBoundingClientRect().left,pg=S.set.mode==='pages';
  for(const e of document.querySelectorAll('#rtext > [data-i]')){const r=e.getBoundingClientRect();if(pg?(r.right>left+4&&r.left<left+sc.clientWidth):(r.bottom>top+2))return e}
  return null
}
function getAnchor(){try{const e=anchorEl();if(!e)return null;const sc=$('#rscroll');return {c:R.c,b:+e.dataset.i,off:S.set.mode==='pages'?0:Math.round(e.getBoundingClientRect().top-sc.getBoundingClientRect().top)}}catch(e){return null}}
function restoreAnchor(a){
  if(!a||!R.b)return false;if(a.c!=null&&a.c!==R.c)drawChapter(a.c);
  const el=$('#rtext > [data-i="'+a.b+'"]');if(!el)return false;
  if(S.set.mode==='pages')gotoPageOf(el);else{const sc=$('#rscroll');sc.scrollTop+=el.getBoundingClientRect().top-sc.getBoundingClientRect().top-(a.off||0)}
  updateInfo();return true
}
function savePos(){
  if(!R.id||!$('#reader').classList.contains('open'))return;
  const a=getAnchor();const s=BK(R.id);if(a)s.pos=a;commitProgress(curW());S.sess={view:curView,rd:true,id:R.id};save()
}
function flushNow(){try{if($('#reader').classList.contains('open'))savePos();clearTimeout(st);localStorage.setItem(SKEY,JSON.stringify(S))}catch(e){}}
let pgT=0;
function barDay(p){return !!p&&!p.paused&&!p.wait&&S.set.bar==='day'}
function updateInfo(){
  if(!R.b)return;const b=R.b,w=curW(),f=b.words?Math.min(1,w/b.words):0;
  const pg=b.ext==='pdf'&&R.pgNow?R.pgNow:Math.max(1,Math.min(pagesOf(b),Math.round(f*pagesOf(b))||1));
  const p=planInfo(b,w),day=barDay(p),mode=S.set.bar;
  if(!R.seekDrag)$('#r-seek').value=day?Math.round(Math.max(0,Math.min(1,p.pctDay))*1000):Math.round(f*1000);
  let t;
  if(day){const pr=Math.round(p.pctDay*100);t=tapLbl(p)+' di '+p.n+' · '+(p.ok?'completata':pr+'%')+' · pag. '+Math.max(p.fromP,Math.min(p.toP,pg))+' di '+p.fromP+'-'+p.toP+(p.ok?'':' · '+dur(p.toW-w)+' alla fine')}
  else{t='Cap. '+(R.c+1)+'/'+b.chapters.length+' · libro '+pctTxt(f)+' · pag. '+pg+' di '+pagesOf(b)+' · '+dur(b.words-w);
    if(p&&!p.paused&&!p.wait&&mode==='both')t+=' · '+tapLbl(p).toLowerCase()+' '+p.L+'/'+p.n+' al '+Math.round(p.pctDay*100)+'%'}
  $('#r-info').textContent=t;
  $('#r-tp').style.width=(f*100)+'%'
}
$('#rscroll').addEventListener('scroll',()=>{
  if(S.set.mode==='pages')return;updateInfo();clearTimeout(savePos.h);savePos.h=setTimeout(savePos,500);
  if(R.b&&R.b.ext==='pdf'){const n=Date.now();if(n-pgT>200){pgT=n;const e=anchorEl();if(e&&e.dataset.pg){R.pgNow=+e.dataset.pg;updateInfo()}}}
});
window.addEventListener('resize',()=>{if($('#reader').classList.contains('open'))layoutPages()});
setInterval(()=>{if($('#reader').classList.contains('open'))savePos()},2500);
let hiddenAt=0,lastAnc=null;
document.addEventListener('visibilitychange',()=>{
  const open=$('#reader').classList.contains('open');
  if(document.visibilityState==='hidden'){if(open){lastAnc=getAnchor();hiddenAt=Date.now()}flushNow()}
  else if(open&&lastAnc){const a=lastAnc,long=Date.now()-hiddenAt>15000;
    [200,700].forEach(t=>setTimeout(()=>{const c=getAnchor();if(!c||c.b!==a.b||c.c!==a.c||Math.abs((c.off||0)-(a.off||0))>40)restoreAnchor(a)},t));
    if(long)setTimeout(()=>showResume(a),300)}
});
window.addEventListener('pagehide',flushNow);document.addEventListener('freeze',flushNow);
function snippetOf(c,b){const el=htmlBody(R.content[c]).children[b];return el?el.textContent.replace(/\s+/g,' ').trim().slice(0,160):''}
function showResume(a){
  if(!a||a.b==null)return;const sn=snippetOf(a.c,a.b);const has=BK(R.id).bm.some(x=>x.c===a.c&&x.b===a.b);
  banner('Ripreso da «'+sn.slice(0,38)+(sn.length>38?'…':'')+'»',[{l:has?'Togli segnalibro':'Segnalibro qui',fn:()=>{toggleBm(a.c,a.b);refresh()}}],10000)
}
function toggleBm(c,b){const s=BK(R.id);const i=s.bm.findIndex(x=>x.c===c&&x.b===b);if(i>=0){s.bm.splice(i,1);toast('Segnalibro tolto')}else{s.bm.push({id:'b'+Date.now().toString(36),c,b,t:snippetOf(c,b),ts:Date.now()});toast('Segnalibro aggiunto')}save()}

/* barra di avanzamento: salto nel libro */
function jumpW(w,silent){
  const chs=R.b.chapters;let c=chs.length-1;for(let i=0;i<chs.length;i++){if(w<chs[i].w0+chs[i].n){c=i;break}}
  const before=getAnchor();if(before)R.back=before;
  if(c!==R.c){savePos();drawChapter(c)}
  const tw=Math.max(0,w-chs[c].w0);let bi=0;R.bw.forEach((x,i)=>{if(x<=tw)bi=i});
  restoreAnchor({c,b:bi,off:20});savePos();
  if(R.back&&!silent)banner('Hai cambiato punto',[{l:'Torna dov’ero',fn:()=>{const x=R.back;restoreAnchor(x);savePos()}}],8000)
}
$('#r-seek').addEventListener('input',e=>{R.seekDrag=true;const v=e.target.value/1000,p=planInfo(R.b,curW());
  if(barDay(p)){const w=p.fromW+v*(p.toW-p.fromW);$('#r-info').textContent='Vai al '+Math.round(v*100)+'% della tappa · pag. '+Math.max(1,Math.round(w/R.b.words*pagesOf(R.b)))}
  else $('#r-info').textContent='Vai al '+pctTxt(v)+' · pag. '+Math.max(1,Math.round(v*pagesOf(R.b)))+' di '+pagesOf(R.b)});
$('#r-seek').addEventListener('change',e=>{R.seekDrag=false;const v=e.target.value/1000,p=planInfo(R.b,curW());
  jumpW(barDay(p)?p.fromW+v*(p.toW-p.fromW):v*R.b.words)});

/* tocchi nel testo */
let tStart=null;
$('#rscroll').addEventListener('pointerdown',e=>{tStart={x:e.clientX,y:e.clientY}});
$('#rscroll').addEventListener('click',e=>{
  if(tStart&&(Math.abs(e.clientX-tStart.x)>8||Math.abs(e.clientY-tStart.y)>8))return;
  if(String(window.getSelection()).length>0)return;
  if(e.target.closest('button,a,input'))return;
  const mk=e.target.closest('mark');if(mk){annSheet(mk.dataset.g);return}
  const w=$('#rscroll').clientWidth;
  if(S.set.mode==='pages'){const x=e.clientX;if(x<w*.22)return pageEdge(-1);if(x>w*.78)return pageEdge(1)}
  toggleImmersive()
});
function pageEdge(d){if(d>0){if(R.page<R.pages-1)showPage(R.page+1);else chapterStep(1)}else{if(R.page>0)showPage(R.page-1);else chapterStep(-1)}}

/* ---------- selezione e annotazioni ---------- */
const offIn=(el,node,off)=>{const q=document.createRange();q.selectNodeContents(el);q.setEnd(node,off);return q.toString().length};
function getSelDesc(){
  const sel=window.getSelection();if(!sel.rangeCount||sel.isCollapsed)return null;
  const r=sel.getRangeAt(0),root=$('#rtext');if(!root.contains(r.commonAncestorContainer))return null;
  const blocks=[];
  root.querySelectorAll(':scope > [data-i]').forEach(el=>{
    if(!r.intersectsNode(el))return;const rng=document.createRange();rng.selectNodeContents(el);
    const s=r.compareBoundaryPoints(Range.START_TO_START,rng)>0?offIn(el,r.startContainer,r.startOffset):0;
    const e=r.compareBoundaryPoints(Range.END_TO_END,rng)<0?offIn(el,r.endContainer,r.endOffset):el.textContent.length;
    if(e>s)blocks.push({b:+el.dataset.i,s,e})});
  const text=sel.toString().replace(/\s+/g,' ').trim();
  return blocks.length&&text?{blocks,text}:null
}
let selT=null;
document.addEventListener('selectionchange',()=>{
  if(!$('#reader').classList.contains('open'))return;clearTimeout(selT);
  selT=setTimeout(()=>{const d=getSelDesc();if(d){R.sel=d;showSelBar()}else if(R.sel&&window.getSelection().isCollapsed){R.sel=null;hideSel()}},150)
});
function showSelBar(){$('#selbar').classList.add('open');$('#sb-info').textContent=R.sel.text.length+' caratteri'}
function hideSel(){$('#selbar').classList.remove('open')}
function endSel(){R.sel=null;try{window.getSelection().removeAllRanges()}catch(e){}hideSel()}
$('#selbar').addEventListener('pointerdown',e=>e.preventDefault());
function newGid(){return 'a'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)}
function addAnn(d,k,col,txt){const s=BK(R.id),gid=newGid();d.blocks.forEach((bl,i)=>s.ann.push({id:gid+'_'+i,gid,k,c:R.c,b:bl.b,s:bl.s,e:bl.e,col:col||0,txt:i===0?(txt||''):'',t:i===0?d.text.slice(0,300):'',ts:Date.now()}));save();return gid}
function overlaps(a,d){return a.c===R.c&&d.blocks.some(bl=>bl.b===a.b&&a.s<bl.e&&bl.s<a.e)}
function clearAnn(d,kinds){const s=BK(R.id);const gids=new Set(s.ann.filter(a=>kinds.includes(a.k)&&overlaps(a,d)).map(a=>a.gid));s.ann=s.ann.filter(a=>!gids.has(a.gid));save()}
document.querySelectorAll('#sb-sw button').forEach(b=>b.onclick=()=>{
  if(!R.sel)return;const c=+b.dataset.c;
  if(c){clearAnn(R.sel,['h']);addAnn(R.sel,'h',c,'')}else clearAnn(R.sel,['h','q']);
  endSel();refresh()});
$('#sb-x').onclick=()=>endSel();
$('#sb-dif').onclick=()=>{if(!R.sel)return;clearAnn(R.sel,['q']);addAnn(R.sel,'q',0,'');endSel();refresh();toast('Segnato come da capire')};
$('#sb-word').onclick=()=>{if(R.sel)wordSheet(R.sel)};
$('#sb-bm').onclick=()=>{if(!R.sel)return;const b=R.sel.blocks[0].b;toggleBm(R.c,b);endSel();refresh()};
$('#sb-copy').onclick=async()=>{if(!R.sel)return;try{await navigator.clipboard.writeText(R.sel.text+' ('+R.b.title+(R.b.author?', '+R.b.author:'')+')');toast('Copiato')}catch(e){toast('Copia non riuscita')}};
$('#sb-note').onclick=()=>{if(!R.sel)return;const d=R.sel;sheet('<div class="hd"><h3>Nota</h3><button class="btn sec sm" data-x>Chiudi</button></div><div class="small mute">'+esc(d.text.slice(0,200))+'</div><div class="field"><textarea id="ne" placeholder="Il tuo appunto"></textarea></div><button class="btn" id="ns">Salva</button>',box=>{
  $('#ns',box).onclick=()=>{const v=$('#ne',box).value.trim();if(!v)return toast('Scrivi una nota');addAnn(d,'h',0,v);closeSheet(()=>{endSel();refresh()})}})};
$('#sb-ai').onclick=()=>{if(R.sel)aiPanel(R.sel)};
function annSheet(gid){
  const s=BK(R.id),recs=s.ann.filter(a=>a.gid===gid);if(!recs.length)return;const first=recs[0];
  sheet('<div class="hd"><h3>'+(first.k==='q'?'Da capire':'Evidenziazione')+'</h3><button class="btn sec sm" data-x>Chiudi</button></div><div class="small">'+esc(recs.map(r=>r.t).join(' ').slice(0,400))+'</div>'
   +(first.k==='h'?'<div class="sw" id="as-sw"><button data-c="1"></button><button data-c="2"></button><button data-c="3"></button><button data-c="4"></button><button data-c="0" style="background:transparent;font-size:16px">×</button></div>':'')
   +'<div class="field"><label for="an">Nota</label><textarea id="an" placeholder="Il tuo appunto">'+esc(first.txt||'')+'</textarea></div><div class="row wrap"><button class="btn grow" id="as">Salva</button><button class="btn sec" id="aa">Spiega con l’AI</button><button class="btn sec" id="ad" style="color:var(--warn);border-color:var(--warn)">Elimina</button></div>',box=>{
    box.querySelectorAll('#as-sw button').forEach(b=>b.onclick=()=>{first.col=+b.dataset.c;recs.forEach(r=>r.col=first.col);save();closeSheet(()=>refresh())});
    $('#as',box).onclick=()=>{first.txt=$('#an',box).value.trim();if(first.k==='h'&&!first.col&&!first.txt)s.ann=s.ann.filter(a=>a.gid!==gid);save();closeSheet(()=>refresh())};
    $('#ad',box).onclick=()=>{s.ann=s.ann.filter(a=>a.gid!==gid);save();closeSheet(()=>refresh())};
    $('#aa',box).onclick=()=>aiPanel({blocks:recs.map(r=>({b:r.b,s:r.s,e:r.e})),text:recs.map(r=>r.t).join(' ')})})
}

/* ---------- indice, segnalibri, note, cerca nel libro ---------- */
function tocSheet(tab){
  tab=tab||'cap';const b=R.b,s=BK(R.id);
  const tabs=[['cap','Capitoli'],['gg','Giorni'],['bm','Segnalibri'],['ann','Note'],['find','Cerca']];
  let body='';
  if(tab==='cap')body='<div class="list">'+b.chapters.map((c,i)=>'<button class="item" data-c="'+i+'" style="'+(i===R.c?'color:var(--acc);font-weight:600':'')+'"><span class="grow">'+esc(c.t)+'</span><span class="small mute tab">'+pctTxt(c.w0/b.words)+'</span></button>').join('')+'</div>';
  else if(tab==='gg'){const g=s.goal;if(!g)body='<div class="mute">Nessun obiettivo per questo libro. Impostalo da Libreria > Obiettivo di lettura.</div>';
    else{const n=Math.max(1,g.tot||dayDiff(g.start,g.end)+1),pi=planInfo(b,curW()),cw=curW();body='<div class="list">';
      for(let i=0;i<n;i++){const l=lessonAt(b,i),isT=pi&&pi.L===i+1,dn=cw>=l.tw-1;
        body+='<button class="item" data-w="'+l.fw+'" style="'+(isT?'color:var(--acc);font-weight:600':'')+'"><span class="grow">Giorno '+(i+1)+' · '+fmtDate(l.date)+'<br><span class="small mute">pag. '+l.fromP+' - '+l.toP+' · '+esc(b.chapters[chapterAtW(b,l.fw)].t)+'</span></span><span class="small tab">'+(dn?'letto':isT?'oggi':'')+'</span></button>'}
      body+='</div>'}}
  else if(tab==='bm')body=s.bm.length?s.bm.slice().sort((x,y)=>x.c-y.c||x.b-y.b).map(x=>'<button class="stack" data-c="'+x.c+'" data-b="'+x.b+'" style="text-align:left;border-bottom:1px solid var(--line);padding-bottom:8px"><span class="small" style="color:var(--acc);font-weight:600">'+esc(b.chapters[x.c].t)+'</span><span class="small">'+esc(x.t||'')+'</span></button>').join(''):'<div class="mute">Nessun segnalibro. Seleziona del testo e tocca Segnalibro.</div>';
  else if(tab==='ann'){const seen=new Set();const items=[];s.ann.forEach(a=>{if(seen.has(a.gid))return;seen.add(a.gid);const all=s.ann.filter(x=>x.gid===a.gid);if(all[0].col||all.some(x=>x.txt)||all[0].k==='q')items.push(all)});
    items.sort((x,y)=>x[0].c-y[0].c||x[0].b-y[0].b);
    body=items.length?items.map(all=>'<button class="stack hl-it c'+(all[0].col||0)+'" data-c="'+all[0].c+'" data-b="'+all[0].b+'" style="text-align:left;padding-bottom:8px"><span class="small" style="color:var(--acc);font-weight:600">'+esc(b.chapters[all[0].c].t)+(all[0].k==='q'?' · da capire':'')+'</span><span class="small">'+esc(all.map(x=>x.t).join(' ').slice(0,200))+'</span>'+(all.some(x=>x.txt)?'<span class="q-note ai">'+esc(all.map(x=>x.txt).join(' '))+'</span>':'')+'</button>').join(''):'<div class="mute">Nessuna nota o evidenziazione in questo libro.</div>'}
  else body='<div class="row"><input class="input grow" id="fq" type="search" placeholder="Cerca in questo libro" autocomplete="off"><button class="btn sm" id="fg">Cerca</button></div><div class="small mute" id="fi"></div><div class="list" id="fr"></div>';
  sheet('<div class="hd"><h3>'+esc(b.title)+'</h3><button class="btn sec sm" data-x>Chiudi</button></div><div class="seg" id="t-seg">'+tabs.map(t=>'<button data-t="'+t[0]+'" class="'+(t[0]===tab?'on':'')+'">'+t[1]+'</button>').join('')+'</div><div class="stack">'+body+'</div>',box=>{
    box.querySelectorAll('#t-seg button').forEach(x=>x.onclick=()=>tocSheet(x.dataset.t));
    const jump=(c,bi)=>closeSheet(()=>{const a=getAnchor();if(a)R.back=a;savePos();restoreAnchor({c,b:bi,off:20});if(R.back)banner('Hai cambiato punto',[{l:'Torna dov’ero',fn:()=>{restoreAnchor(R.back);savePos()}}],8000);savePos()});
    box.querySelectorAll('[data-c]').forEach(e=>e.onclick=()=>jump(+e.dataset.c,e.dataset.b!=null?+e.dataset.b:0));
    box.querySelectorAll('[data-w]').forEach(e=>e.onclick=()=>closeSheet(()=>jumpW(+e.dataset.w)));
    if(tab==='find'){
      const run=()=>{const q=norm($('#fq',box).value.trim());if(q.length<3){$('#fi',box).textContent=q?'Scrivi almeno 3 lettere':'';$('#fr',box).innerHTML='';return}
        if(!R.idx){R.idx=[];R.content.forEach((h,c)=>[...htmlBody(h).children].forEach((el,bi)=>{const t=el.textContent.replace(/\s+/g,' ').trim();if(t)R.idx.push({c,b:bi,t,n:norm(t)})}))}
        const words=q.split(/\s+/),res=[];for(const r of R.idx){if(words.every(w=>r.n.includes(w))){res.push(r);if(res.length>=200)break}}
        $('#fi',box).textContent=res.length+(res.length===1?' corrispondenza':' corrispondenze');
        $('#fr',box).innerHTML=res.map((r,i)=>'<button class="item" data-i="'+i+'" style="align-items:flex-start;flex-direction:column;gap:3px"><span class="small" style="color:var(--acc);font-weight:600">'+esc(b.chapters[r.c].t)+'</span><span>'+hiHtml(snippet(r.t,r.n,words),words)+'</span></button>').join('');
        $('#fr',box).querySelectorAll('.item').forEach(e=>e.onclick=()=>{const r=res[+e.dataset.i];jump(r.c,r.b)})};
      $('#fg',box).onclick=run;$('#fq',box).onkeydown=e=>{if(e.key==='Enter')run()};$('#fq',box).focus()
    }
  })
}
$('#r-toc').onclick=()=>tocSheet();$('#r-title').onclick=()=>tocSheet();

/* ---------- aspetto ---------- */
$('#r-fmt').onclick=()=>fmtSheet();
function fmtSheet(){
  const s=S.set;
  const rng=(id,l,min,max,step,val,u)=>'<div class="field"><div class="row"><label for="'+id+'" class="grow">'+l+'</label><span class="small mute tab" id="'+id+'v">'+val+(u||'')+'</span></div><input id="'+id+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'"></div>';
  const segb=(id,opts,val)=>'<div class="seg" id="'+id+'">'+opts.map(o=>'<button data-v="'+o[0]+'" class="'+(val==o[0]?'on':'')+'">'+o[1]+'</button>').join('')+'</div>';
  const profs=Object.keys(S.profiles);
  sheet('<div class="hd"><h2>Aspetto</h2><button class="btn sec sm" data-x>Chiudi</button></div>'
  +'<div class="field"><label>Tema</label>'+segb('f-theme',[['navy','Notte'],['light','Chiaro'],['sepia','Seppia'],['black','Nero']],s.theme)+'</div>'
  +'<div class="field"><label>Scorrimento</label>'+segb('f-mode',[['scroll','Verticale'],['pages','Pagine orizzontali']],s.mode)+'</div>'
  +'<div class="field"><label for="f-fam">Carattere</label><select id="f-fam" class="input">'+Object.keys(FONTS).map(f=>'<option'+(f===s.fam?' selected':'')+'>'+f+'</option>').join('')+'</select></div>'
  +rng('f-fs','Dimensione',12,36,1,s.fs,' px')+rng('f-lh','Interlinea',1.1,2.4,.05,s.lh)+rng('f-ps','Spazio tra paragrafi',0,2,.1,s.ps,' em')+rng('f-fw','Spessore',300,700,100,s.fw)+rng('f-ti','Rientro prima riga',0,3,.25,s.ti,' em')
  +'<div class="field"><label>Allineamento</label>'+segb('f-ta',[['justify','Giustificato'],['left','A sinistra']],s.ta)+'</div>'
  +'<label class="row"><span class="grow">Sillabazione</span><input type="checkbox" id="f-hy"'+(s.hy?' checked':'')+'></label>'
  +'<div class="field"><label>Barra in basso mostra</label>'+segb('f-bar',[['day','Tappa del giorno'],['book','Tutto il libro'],['both','Entrambe']],s.bar)+'<div class="small mute">La barra in alto mostra sempre tutto il libro. Senza obiettivo, quella in basso mostra il libro.</div></div>'
  +'<label class="row"><span class="grow">Barra di avanzamento sempre visibile<br><span class="small mute">Resta in basso anche a schermo intero</span></span><input type="checkbox" id="f-pin"'+(s.pin?' checked':'')+'></label>'
  +'<h3>Margini</h3>'+rng('f-mt','Alto',0,80,1,s.mt,' px')+rng('f-mb','Basso',0,80,1,s.mb,' px')+rng('f-ml','Sinistro',0,80,1,s.ml,' px')+rng('f-mr','Destro',0,80,1,s.mr,' px')
  +'<h3>Profili</h3><div class="row wrap">'+profs.map(p=>'<button class="chip" data-p="'+esc(p)+'">'+esc(p)+'</button>').join('')+'</div><div class="row"><input class="input grow" id="f-pn" type="text" placeholder="Nome del profilo (es. Notte)"><button class="btn sm" id="f-ps2">Salva</button></div>',box=>{
    const upd=(k,v,redraw)=>{S.set[k]=v;save();applyFmt();if(redraw)refresh();else layoutPages()};
    const bindR=(id,k,u)=>{$('#'+id,box).oninput=e=>{const v=+e.target.value;$('#'+id+'v',box).textContent=v+(u||'');upd(k,v)}};
    bindR('f-fs','fs',' px');bindR('f-lh','lh');bindR('f-ps','ps',' em');bindR('f-fw','fw');bindR('f-ti','ti',' em');bindR('f-mt','mt',' px');bindR('f-mb','mb',' px');bindR('f-ml','ml',' px');bindR('f-mr','mr',' px');
    $('#f-fam',box).onchange=e=>upd('fam',e.target.value);
    const bindS=(id,k,cb)=>box.querySelectorAll('#'+id+' button').forEach(b=>b.onclick=()=>{box.querySelectorAll('#'+id+' button').forEach(x=>x.classList.toggle('on',x===b));upd(k,b.dataset.v);if(cb)cb()});
    bindS('f-theme','theme');bindS('f-bar','bar',()=>updateInfo());bindS('f-ta','ta');bindS('f-mode','mode',()=>{applyFmt();refresh()});
    $('#f-hy',box).onchange=e=>upd('hy',e.target.checked);
    $('#f-pin',box).onchange=e=>{upd('pin',e.target.checked);setTimeout(layoutPages,260)};
    box.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{S.set={...DEF,...S.profiles[b.dataset.p]};save();applyFmt();refresh();fmtSheet()});
    $('#f-ps2',box).onclick=()=>{const n=$('#f-pn',box).value.trim();if(!n)return toast('Scrivi un nome');S.profiles[n]={...S.set};save();toast('Profilo salvato');fmtSheet()}})
}

/* ================= AI ================= */
let abortCtl=null;function cancelAI(){if(abortCtl){abortCtl.abort();abortCtl=null}}
const SYS='Sei un assistente di lettura che aiuta un lettore adulto, avvocato, a capire i libri che legge. Rispondi in italiano, in modo chiaro e conciso. Non inventare mai nulla: se non sei sicuro o non trovi una fonte, dillo. Cita autori, opere o pagine web solo se reali e verificabili, con titolo. Distingui sempre ciò che il testo dice da ciò che è interpretazione.';
async function askClaude(messages,{web=false,max=1800}={}){
  if(!S.key)throw new Error('Inserisci la chiave API in Altro › Impostazioni.');
  cancelAI();abortCtl=new AbortController();
  const body={model:S.model,max_tokens:max,system:SYS,messages};
  if(web)body.tools=[{type:'web_search_20250305',name:'web_search',max_uses:3}];
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',signal:abortCtl.signal,headers:{'content-type':'application/json','x-api-key':S.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error((j.error&&j.error.message)||('Errore '+r.status));
  return (j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('').trim()
}
const fmtAI=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/^#+\s*(.+)$/gm,'<b>$1</b>');
function visibleText(max){const e=anchorEl();let i=e?+e.dataset.i:0,out='';const kids=document.querySelectorAll('#rtext > [data-i]');for(;i<kids.length&&out.length<max;i++)out+=kids[i].textContent+'\n';return out.trim()}
function chapterText(){return textOf(R.content[R.c]).replace(/\s+/g,' ').trim()}
function aiPanel(sel){
  const b=R.b,ch=b.chapters[R.c];const s=BK(R.id);
  const passage0=sel?sel.text:visibleText(3500);
  const scopeLbl=sel?'Testo selezionato':'Quello che stai leggendo';
  const hk='c'+R.c+(sel?'|'+norm(sel.text).slice(0,40):'');s.chat=s.chat||{};const hist=s.chat[hk]||(s.chat[hk]=[]);
  const PRE=[['Spiega il brano','Spiega in modo chiaro cosa dice questo brano, i passaggi difficili e il senso complessivo.'],
   ['Riassumi il capitolo','Riassumi il capitolo in modo chiaro e fedele, in al massimo 200 parole.',()=>chapterText().slice(0,40000)],
   ['Termini e riferimenti','Spiega i termini difficili, i nomi e i riferimenti storici, culturali o letterari presenti nel brano.'],
   ['Contesto dell’opera','Dammi il contesto dell’opera e dell’autore utile per capire questo brano. Se non conosci con certezza l’opera, dillo.'],
   ['Domande di verifica','Proponi 5 domande di verifica sul brano, poi le risposte in fondo.']];
  sheet('<div class="hd"><h3>Chiedi all’AI</h3><button class="btn sec sm" data-x>Chiudi</button></div><div class="small mute">'+esc(b.title)+' · '+esc(ch.t)+' · '+scopeLbl+'</div>'
   +'<div class="small" style="border-left:3px solid var(--line);padding-left:8px;color:var(--mute)">'+esc(passage0.slice(0,220))+(passage0.length>220?'…':'')+'</div>'
   +'<div class="row wrap" id="ai-pre">'+PRE.map((p,i)=>'<button class="chip" data-i="'+i+'">'+p[0]+'</button>').join('')+'</div>'
   +'<div class="stack" id="ai-log"></div>'
   +'<div class="field"><label for="ai-q">La tua domanda</label><textarea id="ai-q" placeholder="Per esempio: che cosa intende l’autore con questa frase?"></textarea></div>'
   +'<div class="row"><button class="btn grow" id="ai-send">Chiedi</button><button class="btn sec" id="ai-clear">Azzera</button></div>',box=>{
    const log=$('#ai-log',box);
    const draw=()=>{log.innerHTML=hist.map((h,i)=>'<div class="stack"><div class="q-note"><b>'+esc(h.label||h.q)+'</b></div><div class="ai">'+fmtAI(h.a)+'</div><div class="row wrap"><button class="btn sec sm" data-sv="'+i+'">Salva come nota</button></div></div>').join('<hr style="border:0;border-top:1px solid var(--line);width:100%">');
      log.querySelectorAll('[data-sv]').forEach(x=>x.onclick=()=>{const h=hist[+x.dataset.sv];const d=sel||{blocks:(()=>{const a=getAnchor();return [{b:a?a.b:0,s:0,e:Math.min(40,(htmlBody(R.content[R.c]).children[a?a.b:0]||{textContent:''}).textContent.length)}]})(),text:passage0.slice(0,120)};addAnn(d,'h',0,'AI - '+(h.label||h.q)+'\n'+h.a);toast('Salvata come nota')})};
    const send=async(q,label,passage)=>{
      q=q.trim();if(!q)return;const btn=$('#ai-send',box);btn.disabled=true;
      const wait=document.createElement('div');wait.innerHTML='<span class="spin"></span> Sto cercando…';log.appendChild(wait);wait.scrollIntoView({block:'nearest'});
      try{
        const ctx='Libro: «'+b.title+'»'+(b.author?' di '+b.author:'')+'. Capitolo: '+ch.t+'.\nBrano:\n'+(passage||passage0).slice(0,40000)+'\n\n';
        const msgs=[];hist.forEach((h,i)=>{msgs.push({role:'user',content:(i===0?ctx+'Domanda: ':'')+h.q});msgs.push({role:'assistant',content:h.a})});
        msgs.push({role:'user',content:(hist.length?'':ctx+'Domanda: ')+q+(S.web?'\n\n(Se serve, cerca sul web e cita le fonti trovate.)':'')});
        const a=await askClaude(msgs,{web:S.web});
        hist.push({q,label,a});if(hist.length>12)hist.shift();save();$('#ai-q',box).value='';draw();log.lastElementChild&&log.lastElementChild.scrollIntoView({block:'start'});
      }catch(e){if(e.name!=='AbortError'){wait.innerHTML='<span style="color:var(--warn)">'+esc(e.message)+'</span>';btn.disabled=false;return}}
      wait.remove();btn.disabled=false};
    box.querySelectorAll('#ai-pre [data-i]').forEach(x=>x.onclick=()=>{const p=PRE[+x.dataset.i];send(p[1],p[0],p[2]?p[2]():null)});
    $('#ai-send',box).onclick=()=>send($('#ai-q',box).value);
    $('#ai-clear',box).onclick=()=>{hist.length=0;save();draw()};
    draw()})
}
$('#r-ai').onclick=()=>aiPanel(null);

/* ================= ascolto ================= */
let LS={on:false,q:[],i:0,paused:false,gen:0},KA=null,estT=null,hlT=null,gotBoundary=false;
const buzz=ms=>{try{navigator.vibrate&&navigator.vibrate(ms||14)}catch(e){}};
/* frasi con la posizione nel blocco */
function sentPieces(raw){
  const out=[],re=/[^.!?;:]+[.!?;:]?\s*/g;let m;
  while((m=re.exec(raw))){let t=m[0],base=m.index;const lead=t.length-t.trimStart().length;t=t.trim();let off=base+lead;
    while(t.length>150){let k=t.lastIndexOf(',',140);if(k<60)k=t.lastIndexOf(' ',140);if(k<1)k=140;const piece=t.slice(0,k+1);out.push({off,text:piece});const rest=t.slice(k+1);const l2=rest.length-rest.trimStart().length;off+=k+1+l2;t=rest.trim()}
    if(t)out.push({off,text:t})}
  return out
}
function buildQueue(fromBlock){
  const kids=[...document.querySelectorAll('#rtext > [data-i]')].filter(k=>+k.dataset.i>=fromBlock);
  const pieces=[];kids.forEach(k=>sentPieces(k.textContent).forEach(p=>pieces.push({b:+k.dataset.i,off:p.off,text:p.text})));
  return pieces.map(p=>({parts:[p],text:p.text}))
}
function itVoices(){try{return speechSynthesis.getVoices().filter(v=>/^it/i.test(v.lang)).map(v=>({v,sc:(/natural|neural|online|network/i.test(v.name+v.voiceURI)?2:0)+(/google/i.test(v.name)?1:0)+(v.localService?0:1)})).sort((a,b)=>b.sc-a.sc).map(x=>x.v)}catch(e){return[]}}
function pickVoice(){const l=itVoices();return l.find(v=>v.voiceURI===S.tts.voice)||l[0]||null}
/* parola evidenziata */
function textPos(el,off){const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n,pos=0,last=null;while((n=w.nextNode())){const l=n.nodeValue.length;if(off<=pos+l)return [n,off-pos];pos+=l;last=n}return last?[last,last.nodeValue.length]:null}
function clearHl(){const h=$('#hlw');if(h)h.innerHTML='';try{CSS.highlights&&CSS.highlights.delete('tts')}catch(e){}}
function hlWord(b,off,scroll){
  const el=document.querySelector('#rtext > [data-i="'+b+'"]');if(!el)return;
  const t=el.textContent;if(off>=t.length)off=Math.max(0,t.length-1);
  let s0=off,e0=off;while(s0>0&&!/\s/.test(t[s0-1]))s0--;while(e0<t.length&&!/\s/.test(t[e0]))e0++;
  if(e0<=s0)return;const p1=textPos(el,s0),p2=textPos(el,e0);if(!p1||!p2)return;
  const r=document.createRange();r.setStart(p1[0],p1[1]);r.setEnd(p2[0],p2[1]);
  const sc=$('#rscroll');let h=$('#hlw');if(!h){h=document.createElement('div');h.id='hlw';sc.appendChild(h)}
  const draw=()=>{const sr=sc.getBoundingClientRect();h.innerHTML='';[...r.getClientRects()].forEach(q=>{if(q.width<2)return;const d=document.createElement('i');d.style.cssText='left:'+(q.left-sr.left+sc.scrollLeft-3)+'px;top:'+(q.top-sr.top+sc.scrollTop-1)+'px;width:'+(q.width+6)+'px;height:'+(q.height+2)+'px';h.appendChild(d)})};
  draw();
  try{if(window.Highlight&&CSS.highlights)CSS.highlights.set('tts',new Highlight(r))}catch(e){}
  if(scroll){const sr=sc.getBoundingClientRect(),q=r.getBoundingClientRect();
    if(S.set.mode==='pages'){const t2=$('#rtext');const x=q.left-t2.getBoundingClientRect().left+t2.scrollLeft;const pg=Math.floor(x/sc.clientWidth);if(pg!==R.page){showPage(pg);requestAnimationFrame(draw)}}
    else if(q.bottom>sr.bottom-90||q.top<sr.top+30){sc.scrollBy({top:q.top-sr.top-sc.clientHeight*.3,behavior:'smooth'});setTimeout(draw,120);setTimeout(draw,450)}}
}
function wcum(ch){if(ch.cum)return ch.cum;const t=ch.text,c=new Float32Array(t.length);let a=0;for(let i=0;i<t.length;i++){const x=t[i];a+=1+(/[.!?]/.test(x)?10:/[;:]/.test(x)?6:x===','?3:x==='\n'?12:0);c[i]=a}return ch.cum=c}
function posAtW(ch,w){const c=wcum(ch);let lo=0,hi=c.length-1;while(lo<hi){const m=(lo+hi)>>1;if(c[m]>=w)hi=m;else lo=m+1}return lo}
function posToBlock(ch,pc){let part=ch.parts[0];for(const p of ch.parts){if((p.cum||0)<=pc)part=p;else break}return {b:part.b,off:part.off+Math.max(0,pc-(part.cum||0))}}
function listenMark(ch,pc,scroll){
  const x=posToBlock(ch,pc);hlWord(x.b,x.off,scroll!==false);
  if(R.b&&x.b!=null){const s=BK(R.id);s.pos={c:R.c,b:x.b,off:20};const w=R.b.chapters[R.c].w0+(R.bw[x.b]||0);commitProgress(w);S.sess={view:curView,rd:true,id:R.id};save()}
}
/* sessione multimediale (schermata di blocco, notifiche, Always On Display) */
function silentWav(){const n=8000,b=new Uint8Array(44+n),dv=new DataView(b.buffer);const w=(o,s)=>[...s].forEach((c,i)=>b[o+i]=c.charCodeAt(0));w(0,'RIFF');dv.setUint32(4,36+n,true);w(8,'WAVEfmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,8000,true);dv.setUint32(28,8000,true);dv.setUint16(32,1,true);dv.setUint16(34,8,true);w(36,'data');dv.setUint32(40,n,true);b.fill(128,44);return new Blob([b],{type:'audio/wav'})}
function mediaMeta(){
  if(!('mediaSession' in navigator)||!R.b)return;
  try{navigator.mediaSession.metadata=new MediaMetadata({title:R.b.title,artist:R.b.author||'Ebook 1000',album:R.b.chapters[R.c].t,artwork:[{src:R.b.cover||new URL('icon-512.png',location.href).href,sizes:'512x512'}]})}catch(e){}
}
function mediaState(){if('mediaSession' in navigator)try{navigator.mediaSession.playbackState=!LS.on?'none':LS.paused?'paused':'playing'}catch(e){}}
function mediaInit(){
  if(!('mediaSession' in navigator)||mediaInit.done)return;mediaInit.done=true;
  const h=(a,f)=>{try{navigator.mediaSession.setActionHandler(a,f)}catch(e){}};
  h('play',()=>{if(LS.on)setPaused(false)});h('pause',()=>{if(LS.on)setPaused(true)});h('stop',()=>stopListen());
  h('previoustrack',()=>skipL(-1));h('nexttrack',()=>skipL(1));h('seekbackward',()=>skipL(-3));h('seekforward',()=>skipL(3))
}
function keepAlive(on){
  try{if(on){if(!KA){KA=new Audio(URL.createObjectURL(silentWav()));KA.loop=true;KA.volume=.02}KA.play().catch(()=>{})}else if(KA)KA.pause()}catch(e){}
}
/* controlli */
function lpUpdate(){
  const p=$('#lp');if(!p)return;p.hidden=!LS.on;if(!LS.on)return;
  $('#lp-pp').textContent=LS.paused?'▶':'❚❚';$('#lp-r').textContent=S.set.rate.toFixed(1)+'×';
  const li=document.getElementById('l-i');if(li)li.textContent=LS.i+1
}
function respeak(){LS.gen++;try{speechSynthesis.cancel()}catch(e){}clearInterval(estT);speechNext()}
function setPaused(p){
  if(!LS.on)return;LS.paused=p;
  if(p){try{speechSynthesis.cancel()}catch(e){}LS.gen++;clearInterval(estT);keepAlive(false)}
  else{keepAlive(true);respeak()}
  mediaState();lpUpdate();const b=document.getElementById('l-pp');if(b)b.textContent=p?'Riprendi':'Pausa'
}
function setRate(r){S.set.rate=Math.max(.6,Math.min(2,Math.round(r*10)/10));save();lpUpdate();const rr=document.getElementById('l-r');if(rr)rr.value=S.set.rate;if(LS.on&&!LS.paused)respeak()}
function skipL(d){if(!LS.on)return;LS.i=Math.max(0,Math.min(LS.q.length-1,LS.i+d));LS.paused=false;keepAlive(true);respeak();mediaState()}
$('#lp-pp').onclick=()=>{buzz();setPaused(!LS.paused)};
$('#lp-stop').onclick=()=>{buzz(25);stopListen()};
$('#lp-prev').onclick=()=>{buzz();skipL(-1)};$('#lp-next').onclick=()=>{buzz();skipL(1)};
$('#lp-m').onclick=()=>{buzz();setRate(S.set.rate-.1)};$('#lp-p').onclick=()=>{buzz();setRate(S.set.rate+.1)};
$('#lp-set').onclick=()=>{buzz();listenSheet()};
/* avvio e coda */
function startListen(){
  if(!('speechSynthesis' in window)){toast('Sintesi vocale non disponibile');return false}
  stopAudio();const a=getAnchor();const q=buildQueue(a?a.b:0);
  if(!q.length){toast('Niente da leggere qui');return false}
  LS={on:true,q,i:0,paused:false,gen:(LS.gen||0)+1};mediaInit();mediaMeta();keepAlive(true);mediaState();lpUpdate();speechNext();return true
}
function listen(){if(LS.on)return listenSheet();startListen()}
function stopAudio(){try{speechSynthesis.cancel()}catch(e){}clearInterval(estT)}
function stopListen(){LS.on=false;LS.gen++;stopAudio();keepAlive(false);clearHl();mediaState();lpUpdate()}
async function nextChapterListen(){
  if(R.c>=R.b.chapters.length-1){stopListen();toast('Fine del libro');return}
  savePos();drawChapter(R.c+1);$('#rscroll').scrollTop=0;showPage(0);
  const q=buildQueue(0);if(!q.length){return nextChapterListen()}
  LS.q=q;LS.i=0;LS.gen++;mediaMeta();speechNext()
}
async function speechNext(){
  if(!LS.on)return;if(LS.i>=LS.q.length){await nextChapterListen();return}
  lpUpdate();const gen=LS.gen,i=LS.i,ch=LS.q[i];listenMark(ch,0,!document.hidden);
  const u=new SpeechSynthesisUtterance(ch.text);u.lang='it-IT';u.rate=S.set.rate;const v=pickVoice();if(v)u.voice=v;
  gotBoundary=false;let t0=0;const c=wcum(ch),tot=c[c.length-1];
  u.onstart=()=>{if(gen!==LS.gen)return;t0=Date.now();clearInterval(estT);
    estT=setInterval(()=>{if(gen!==LS.gen){clearInterval(estT);return}if(gotBoundary||LS.paused)return;const el=(Date.now()-t0)/1000;listenMark(ch,posAtW(ch,el*(S.tts.wps||17)*S.set.rate),!document.hidden)},120)};
  u.onboundary=e=>{if(gen!==LS.gen)return;gotBoundary=true;clearInterval(estT);listenMark(ch,e.charIndex,!document.hidden)};
  u.onend=()=>{
    if(gen===LS.gen&&t0&&!gotBoundary){const el=(Date.now()-t0)/1000;if(el>.6){const m=tot/el/S.set.rate;S.tts.wps=Math.max(8,Math.min(45,(S.tts.wps||17)*.5+m*.5));save()}}
    if(LS.on&&gen===LS.gen&&!LS.paused){clearInterval(estT);LS.i++;speechNext()}};
  u.onerror=()=>{};
  speechSynthesis.speak(u)
}
function listenSheet(){
  const T=S.tts,dv=itVoices();
  sheet('<div class="hd"><h3>Ascolto</h3><button class="btn sec sm" data-x>Chiudi</button></div><div class="small mute">'+(LS.on?'Parte <span id="l-i" class="tab">'+(LS.i+1)+'</span> di '+LS.q.length+'. ':'')+'I controlli restano in basso mentre ascolti.</div>'
   +'<div class="field"><label for="l-r">Velocità</label><input id="l-r" type="range" min="0.6" max="2" step="0.1" value="'+S.set.rate+'"></div>'
   +'<div class="field"><label for="l-dv">Voce italiana del telefono</label><select id="l-dv" class="input"><option value="">Automatica (la migliore)</option>'+dv.map(v=>'<option value="'+esc(v.voiceURI)+'"'+(v.voiceURI===T.voice?' selected':'')+'>'+esc(v.name)+(v.localService?'':' (rete)')+'</option>').join('')+'</select></div>'
   +'<div class="row">'+(LS.on?'':'<button class="btn grow" id="l-go">Avvia l’ascolto</button>')+'</div>',box=>{
    $('#l-r',box).onchange=e=>setRate(+e.target.value);
    $('#l-dv',box).onchange=e=>{T.voice=e.target.value;save();if(LS.on)respeak()};
    const go2=$('#l-go',box);if(go2)go2.onclick=()=>closeSheet(()=>startListen())})
}
$('#r-listen').onclick=()=>{buzz(10);listen()};
try{speechSynthesis.onvoiceschanged=()=>{}}catch(e){}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&LS.on&&R.b){const c=LS.q[LS.i];if(c)listenMark(c,0,true)}});

function todayBanner(){
  const pl=LIB.map(b=>({b,p:planInfo(b)})).filter(x=>x.p&&!x.p.ok&&!x.p.late&&!x.p.paused&&!x.p.wait).sort((x,y)=>(y.b.id===S.last)-(x.b.id===S.last))[0];
  if(!pl)return;const {b,p}=pl,t=b.title.length>28?b.title.slice(0,27)+'…':b.title;
  banner('Oggi: '+tapLbl(p).toLowerCase()+' di '+p.n+(p.nb>1?' ('+p.nb+' arretrate)':'')+' di «'+t+'» · pag. '+p.fromP+'-'+p.toP,[{l:'Leggi',fn:()=>openBook(b.id)}],14000)
}
async function remoteVersion(){try{const r=await fetch('app.js?v='+Date.now(),{cache:'no-store'});const t=await r.text();const m=/const VERSION='([^']+)'/.exec(t);let n=null;try{const x=/const NEWS=(\{.*\});/.exec(t);if(x)n=JSON.parse(x[1])}catch(e){}remoteVersion.news=n;return m?m[1]:null}catch(e){return null}}
function newsHtml(v,news){const a=(news||NEWS)[v];return a?'<b>Novità '+v+'</b><br>'+a.map(x=>'• '+esc(x)).join('<br>'):''}
async function applyUpdate(){
  toast('Aggiorno…');flushNow();
  const files=['index.html','style.css','util.js','import.js','app.js','sw.js','manifest.webmanifest','pdf.js','pdf.worker.js','icon-192.png','icon-512.png'];
  try{if('serviceWorker' in navigator){const rs=await navigator.serviceWorker.getRegistrations();for(const r of rs)await r.unregister()}if(window.caches){for(const k of await caches.keys())await caches.delete(k)}}catch(e){}
  /* riscarica i file saltando la cache del browser, altrimenti si rivede la versione vecchia */
  try{await Promise.all(files.map(f=>fetch(f+'?u='+Date.now(),{cache:'reload'}).catch(()=>0)));await Promise.all(files.map(f=>fetch(f,{cache:'reload'}).catch(()=>0)))}catch(e){}
  location.reload()
}
/* ================= salvataggio sul sito ================= */
function CL(){return S.cloud||(S.cloud={url:'',key:'',auto:true,last:0,h:'',up:{},err:''})}
function clOk(){const c=CL();return !!(c.url&&c.key)}
function clStatus(){const c=CL();if(!clOk())return 'Non configurato';if(c.err)return 'Errore: '+c.err;return c.last?'Ultimo salvataggio: '+new Date(c.last).toLocaleString('it-IT'):'Nessun salvataggio ancora'}
function clShow(t){const e=document.getElementById('cl-s');if(e)e.textContent=t}
async function clReq(a,q,opt){const c=CL();const r=await fetch(c.url+(c.url.includes('?')?'&':'?')+'a='+a+(q?'&'+q:'')+'&_='+Date.now()+Math.random().toString(36).slice(2,6),{...(opt||{}),cache:'no-store',headers:{'X-Key':c.key,...((opt&&opt.headers)||{})}});if(!r.ok)throw new Error(r.status===403?'chiave errata':r.status===409?'trasferimento interrotto':'risposta '+r.status);return r}
async function clPut(name,u8){const CH=1048576;if(!u8.length)return;for(let o=0;o<u8.length;o+=CH)await clReq('put','n='+encodeURIComponent(name)+'&o='+o+'&t='+u8.length,{method:'POST',body:u8.subarray(o,o+CH),headers:{'Content-Type':'application/octet-stream'}})}
function clHash(t){let h=5381;for(let i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return t.length+':'+h}
let clBusy=false,clT=null;
function cloudSoon(){clearTimeout(clT);if(clOk()&&CL().auto)clT=setTimeout(()=>cloudPush(false),30000)}
async function cloudPush(manual){
  if(clBusy||!clOk()||(!manual&&!navigator.onLine))return;clBusy=true;const c=CL();
  const keep=()=>{try{localStorage.setItem(SKEY,JSON.stringify(S))}catch(e){}};
  try{
    const o=dataObj(false);o.S.key='';delete o.S.cloud;const js=JSON.stringify(o),h=clHash(js);
    if(manual||h!==c.h){clShow('Salvo i dati…');await clPut('state.json',new TextEncoder().encode(js));c.h=h}
    const todo=LIB.filter(b=>!c.up[b.id]);
    for(let i=0;i<todo.length;i++){const b=todo[i];clShow('Carico libro '+(i+1)+' di '+todo.length+'…');const f=await IDB.get('files',b.id);
      if(f){const u8=f instanceof Blob?new Uint8Array(await f.arrayBuffer()):new Uint8Array(f.buffer?f.buffer:f);await clPut('book-'+b.id+'.'+b.ext,u8)}
      c.up[b.id]=1;keep()}
    c.last=Date.now();c.err='';keep();if(manual)toast('Salvato sul sito')
  }catch(e){c.err=e.message==='Failed to fetch'?'sito non raggiungibile (indirizzo o CORS)':e.message;keep();if(manual)toast('Salvataggio non riuscito')}
  finally{clBusy=false;clShow(clStatus())}
}
async function cloudRestore(){
  try{
    impUI('Leggo il sito',.02,'');const list=await (await clReq('list')).json();const names=list.map(x=>x.n);
    if(names.includes('state.json')){const o=await (await clReq('get','n=state.json')).json();mergeData(o)}
    const bs=names.filter(n=>/^book-/.test(n));let added=0;
    for(let i=0;i<bs.length;i++){const n=bs[i];const id=n.replace(/^book-|\.[^.]+$/g,'');CL().up[id]=1;if(bookById(id))continue;const kn=S.known[id]||{};
      try{impUI('Scarico '+(i+1)+' di '+bs.length,i/bs.length,kn.title||n);const buf=await (await clReq('get','n='+encodeURIComponent(n))).arrayBuffer();
        const file=new File([buf],'libro.'+n.split('.').pop());const res=await importFile(file,()=>{});await storeBook(res,{title:kn.title,author:kn.author});added++}
      catch(er){toast((kn.title||n)+': '+er.message)}}
    save();$('#imp').classList.remove('on');go(curView);toast('Ripristinato: '+added+' libri')
  }catch(e){$('#imp').classList.remove('on');toast('Errore: '+(e.message==='Failed to fetch'?'sito non raggiungibile':e.message))}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&clOk()&&CL().auto)cloudPush(false)});
/* ================= avvio ================= */
(async function boot(){
  applyTheme();
  try{await IDB.open();LIB=await IDB.all('books')}catch(e){toast('Database locale non disponibile')}
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
  go('lib',true);
  const firstRun=S.seenV==null&&!LIB.length&&!Object.keys(S.bk).length;
  if(S.seenV!==VERSION){S.seenV=VERSION;save();if(!firstRun&&NEWS[VERSION])setTimeout(()=>sheet('<div class="hd"><h3>Aggiornato alla '+VERSION+'</h3><button class="btn sec sm" data-x>Chiudi</button></div><div class="small stack">'+newsHtml(VERSION)+'</div>',()=>{}),1200)}
  setTimeout(()=>{if(!$('#reader').classList.contains('open')&&$('#resume').hidden&&!$('#sh').classList.contains('open'))todayBanner()},900);
  setTimeout(()=>{if(clOk()&&CL().auto)cloudPush(false)},6000);
  setTimeout(async()=>{const r=await remoteVersion();if(r&&r!==VERSION&&!$('#reader').classList.contains('open'))banner('Nuova versione '+r+' disponibile'+(remoteVersion.news&&remoteVersion.news[r]?': '+remoteVersion.news[r][0]:''),[{l:'Aggiorna',fn:applyUpdate}],20000)},2500);
  const q=S.sess;if(!q)return;
  try{
    if(q.view&&q.view!=='lib'&&document.getElementById('v-'+q.view))go(q.view);
    if(q.rd&&q.id&&bookById(q.id)){
      const fix=await openBook(q.id);let touched=false;$('#rscroll').addEventListener('pointerdown',()=>{touched=true},{once:true});
      const fx=()=>{if(!touched&&fix)fix()};[150,500,1200,2500].forEach(t=>setTimeout(fx,t));
      if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>setTimeout(fx,150));
      setTimeout(()=>{if(!touched){const a=BK(q.id).pos;if(a)showResume(a)}},1400)
    }
  }catch(e){}
})();
