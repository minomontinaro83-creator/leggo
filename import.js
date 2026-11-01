"use strict";
/* ============ Importazione: EPUB, PDF, DOCX, TXT/MD, HTML ============ */
const MAXCH=6000; // parole massime per sezione

/* ---- pulizia HTML: solo blocchi semplici ---- */
const SKIP=new Set(['script','style','head','title','meta','link','svg','math','nav','noscript','iframe','object','audio','video','canvas','form','button','input','select','textarea','template']);
const BLOCKS=new Set(['p','div','section','article','main','body','blockquote','ul','ol','li','pre','table','thead','tbody','tfoot','tr','td','th','figure','figcaption','aside','header','footer','dl','dt','dd','h1','h2','h3','h4','h5','h6','hr','caption','center','address','details','summary','fieldset','html']);
const TAGMAP={strong:'strong',b:'strong',em:'em',i:'em',cite:'em',dfn:'em',u:'u',sup:'sup',sub:'sub'};
const escH=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function imgHtml(n){const s=n.getAttribute&&n.getAttribute('src');return s&&s.startsWith('data:image')?'<img src="'+s+'" alt="">':''}
function inlNode(n){
  if(n.nodeType===3)return escH(n.nodeValue.replace(/\s+/g,' '));
  if(n.nodeType!==1)return '';
  const t=n.localName.toLowerCase();
  if(SKIP.has(t))return '';
  if(t==='br')return '<br>';
  if(t==='img')return imgHtml(n);
  const inner=cleanInline(n),m=TAGMAP[t];
  if(m)return inner.trim()?'<'+m+'>'+inner+'</'+m+'>':inner;
  return BLOCKS.has(t)||/^h[1-6]$/.test(t)?' '+inner+' ':inner;
}
function cleanInline(p){let o='';for(const c of p.childNodes)o+=inlNode(c);return o}
const hasText=h=>/<img/.test(h)||h.replace(/<[^>]*>|&nbsp;|\s/g,'').length>0;
function cleanBlocks(node){
  let out='',buf='';
  const flush=()=>{if(hasText(buf))out+='<p>'+buf.replace(/^(\s|<br>)+|(\s|<br>)+$/g,'')+'</p>';buf=''};
  for(const n of node.childNodes){
    if(n.nodeType===3){buf+=escH(n.nodeValue.replace(/\s+/g,' '));continue}
    if(n.nodeType!==1)continue;
    const t=n.localName.toLowerCase();
    if(SKIP.has(t))continue;
    if(/^h[1-6]$/.test(t)){flush();const x=cleanInline(n).replace(/<br>/g,' ').trim();if(hasText(x))out+='<'+t+'>'+x+'</'+t+'>';continue}
    if(t==='pre'){flush();const x=escH(n.textContent||'').trim();if(x)out+='<pre>'+x+'</pre>';continue}
    if(t==='hr'){flush();out+='<hr>';continue}
    if(t==='blockquote'){flush();const x=cleanBlocks(n);if(x)out+='<blockquote>'+x+'</blockquote>';continue}
    if(t==='ul'||t==='ol'){flush();const x=cleanBlocks(n);if(x)out+='<'+t+'>'+x+'</'+t+'>';continue}
    if(t==='li'){flush();const x=cleanInline(n).trim();if(hasText(x))out+='<li>'+x+'</li>';continue}
    if(t==='table'){flush();n.querySelectorAll('tr').forEach(tr=>{const cells=[...tr.children].map(c=>cleanInline(c).replace(/<br>/g,' ').trim()).filter(Boolean);if(cells.length)out+='<p>'+cells.join(' · ')+'</p>'});continue}
    if(t==='p'||t==='dt'||t==='dd'||t==='figcaption'||t==='caption'||t==='summary'||t==='address'||t==='center'){
      flush();const x=cleanInline(n).replace(/^(\s|<br>)+|(\s|<br>)+$/g,'');if(hasText(x))out+='<p>'+x+'</p>';continue}
    if(t==='img'){buf+=imgHtml(n);continue}
    if(BLOCKS.has(t)){flush();out+=cleanBlocks(n);continue}
    buf+=inlNode(n);
  }
  flush();return out;
}
const parseHtml=s=>new DOMParser().parseFromString(s,'text/html');
const htmlBody=h=>parseHtml('<body>'+h).body;
const textOf=h=>htmlBody(h).textContent;

/* ---- suddivisione in capitoli ---- */
function splitByHeadings(html,levels,defTitle){
  const kids=[...htmlBody(html).children];const out=[];let cur={t:defTitle,h:''};
  const words=c=>wc(textOf(c.h));
  for(const k of kids){
    const m=/^h([1-6])$/i.exec(k.localName);
    if(m&&levels.includes(+m[1])){
      const title=k.textContent.replace(/\s+/g,' ').trim();
      if(cur.h&&words(cur)>0||/<img/.test(cur.h)){out.push(cur);cur={t:title||defTitle,h:''}}
      else cur.t=title||cur.t;
      continue;
    }
    cur.h+=k.outerHTML;
  }
  if(cur.h)out.push(cur);
  return out;
}
function capWords(chs,max){
  const out=[];
  for(const ch of chs){
    const kids=[...htmlBody(ch.h).children];const w=kids.map(k=>wc(k.textContent));const tot=w.reduce((a,b)=>a+b,0);
    if(tot<=max){out.push(ch);continue}
    const k=Math.ceil(tot/max),target=tot/k;let part=1,acc=0,cur='';
    kids.forEach((el,i)=>{
      cur+=el.outerHTML;acc+=w[i];
      if(acc>=target&&part<k){out.push({t:ch.t+' ('+part+'/'+k+')',h:cur,pg0:ch.pg0});part++;acc=0;cur=''}
    });
    if(cur)out.push({t:ch.t+' ('+part+'/'+k+')',h:cur,pg0:ch.pg0});
  }
  return out;
}
function finalize(meta,chs){
  chs=capWords(chs.filter(c=>c.h&&(wc(textOf(c.h))>0||/<img/.test(c.h))),MAXCH);
  if(!chs.length)throw new Error('Nessun testo leggibile nel file');
  let w0=0;const chapters=[],content=[];
  chs.forEach((c,i)=>{
    let h=c.h;const b=htmlBody(h);const f=b.firstElementChild;
    if(f&&/^h[1-6]$/i.test(f.localName)&&norm(f.textContent).replace(/\W/g,'')&&norm(c.t).includes(norm(f.textContent).replace(/\s+/g,' ').trim().slice(0,30))){f.remove();h=b.innerHTML}
    const n=wc(textOf(h));
    chapters.push({t:(c.t||'Sezione '+(i+1)).slice(0,140),n,w0,pg0:c.pg0||0});content.push(h);w0+=n;
  });
  return {meta:{...meta,words:w0,chapters},content};
}

/* ---- EPUB ---- */
const dirOf=p=>p.includes('/')?p.slice(0,p.lastIndexOf('/')+1):'';
function resolvePath(base,href){
  href=href.split('#')[0].split('?')[0];if(!href)return base.replace(/\/$/,'');
  const parts=(base+href).split('/'),out=[];
  for(const x of parts){if(x==='..')out.pop();else if(x&&x!=='.')out.push(x)}
  return out.join('/');
}
async function parseEpub(buf,prog){
  const z=await Zip.read(buf);
  const xml=async n=>{const t=await z.text(n);return t?new DOMParser().parseFromString(t,'application/xml'):null};
  const cont=await xml('META-INF/container.xml');if(!cont)throw new Error('EPUB non valido');
  const rf=cont.getElementsByTagNameNS('*','rootfile')[0];if(!rf)throw new Error('EPUB non valido');
  const opfPath=rf.getAttribute('full-path'),base=dirOf(opfPath);const opf=await xml(opfPath);
  const tag=(d,n)=>[...d.getElementsByTagNameNS('*',n)];
  const man={};tag(opf,'item').forEach(it=>{man[it.getAttribute('id')]={href:resolvePath(base,it.getAttribute('href')||''),type:it.getAttribute('media-type')||'',props:it.getAttribute('properties')||''}});
  const spine=tag(opf,'itemref').map(r=>man[r.getAttribute('idref')]).filter(Boolean);
  const dc=n=>{const e=opf.getElementsByTagNameNS('*',n)[0];return e?e.textContent.replace(/\s+/g,' ').trim():''};
  const title=dc('title'),author=tag(opf,'creator').map(e=>e.textContent.trim()).filter(Boolean).join(', ');
  // copertina
  let cover=null;
  try{
    let ci=null;const cm=tag(opf,'meta').find(m=>m.getAttribute('name')==='cover');
    if(cm&&man[cm.getAttribute('content')])ci=man[cm.getAttribute('content')];
    if(!ci)ci=Object.values(man).find(m=>/cover-image/.test(m.props));
    if(!ci)ci=Object.values(man).find(m=>/image/.test(m.type)&&/cover/i.test(m.href));
    if(ci){const d=await z.get(ci.href);if(d)cover=await shrinkImage(new Blob([d],{type:ci.type||'image/jpeg'}),320,.8)}
  }catch(e){}
  // sommario
  const tocMap={};
  try{
    const navItem=Object.values(man).find(m=>/\bnav\b/.test(m.props));
    if(navItem){
      const nd=parseHtml((await z.text(navItem.href))||'');const nb=dirOf(navItem.href);
      const nav=[...nd.querySelectorAll('nav')].find(n=>/toc/.test(n.getAttribute('epub:type')||n.getAttribute('type')||''))||nd.querySelector('nav');
      if(nav)nav.querySelectorAll('a[href]').forEach(a=>{const p=resolvePath(nb,a.getAttribute('href'));const t=a.textContent.replace(/\s+/g,' ').trim();if(t&&!(p in tocMap))tocMap[p]=t});
    }
    if(!Object.keys(tocMap).length){
      const ncxItem=Object.values(man).find(m=>/dtbncx|ncx/.test(m.type));
      if(ncxItem){const nx=await xml(ncxItem.href);const nb=dirOf(ncxItem.href);
        if(nx)tag(nx,'navPoint').forEach(np=>{const lab=np.getElementsByTagNameNS('*','text')[0],ct=np.getElementsByTagNameNS('*','content')[0];if(lab&&ct){const p=resolvePath(nb,ct.getAttribute('src')||'');const t=lab.textContent.replace(/\s+/g,' ').trim();if(t&&!(p in tocMap))tocMap[p]=t}})}
    }
  }catch(e){}
  const chs=[];let k=0;
  for(const it of spine){
    k++;if(prog)prog(k/spine.length);await tick();
    if(!/html|xml/.test(it.type))continue;
    const raw=await z.text(it.href);if(!raw)continue;
    let doc=new DOMParser().parseFromString(raw,'application/xhtml+xml');
    if(doc.getElementsByTagName('parsererror').length)doc=parseHtml(raw);
    const bd=doc.body||doc.documentElement;
    // immagini incorporate
    const dir=dirOf(it.href);
    for(const im of [...bd.querySelectorAll('img')]){
      const s=im.getAttribute('src')||'';if(!s||s.startsWith('data:'))continue;
      try{const d=await z.get(resolvePath(dir,s));if(d){const ext=(s.split('.').pop()||'jpeg').toLowerCase();const mt={png:'image/png',gif:'image/gif',svg:'image/svg+xml',webp:'image/webp',jpg:'image/jpeg',jpeg:'image/jpeg'}[ext]||'image/jpeg';if(mt!=='image/svg+xml')im.setAttribute('src',await imageToDataUrl(d,mt));else im.removeAttribute('src')}else im.removeAttribute('src')}catch(e){im.removeAttribute('src')}
    }
    const html=cleanBlocks(bd);
    const w=wc(textOf(html));
    if(!w&&!/<img/.test(html))continue;
    const h1=htmlBody(html).querySelector('h1,h2,h3');
    const label=tocMap[it.href]||null;
    const prev=chs[chs.length-1];
    if(!label&&prev&&w<250&&!h1){prev.h+=html;continue}   // pezzi di capitolo
    chs.push({t:label||(h1?h1.textContent.replace(/\s+/g,' ').trim():null),h:html});
  }
  return {meta:{title,author,cover},chs};
}

/* ---- DOCX (lettura diretta dell'XML) ---- */
async function parseDocx(buf,prog){
  const z=await Zip.read(buf);
  const xml=async n=>{const t=await z.text(n);return t?new DOMParser().parseFromString(t,'application/xml'):null};
  const doc=await xml('word/document.xml');if(!doc)throw new Error('DOCX non valido');
  const styles=await xml('word/styles.xml'),rels=await xml('word/_rels/document.xml.rels'),core=await xml('docProps/core.xml');
  const styleName={};
  if(styles)[...styles.getElementsByTagNameNS('*','style')].forEach(s=>{const id=s.getAttributeNS('*','styleId')||s.getAttribute('w:styleId');const nm=s.getElementsByTagNameNS('*','name')[0];if(id&&nm)styleName[id]=(nm.getAttribute('w:val')||'').toLowerCase()});
  const relTarget={};
  if(rels)[...rels.getElementsByTagNameNS('*','Relationship')].forEach(r=>{relTarget[r.getAttribute('Id')]=r.getAttribute('Target')});
  const el=(n,name)=>[...n.children].find(c=>c.localName===name);
  const val=n=>n?(n.getAttribute('w:val')??n.getAttribute('val')):null;
  const on=n=>n&&!['0','false','none'].includes(val(n)||'');
  async function runs(node){
    let out='';
    for(const c of node.children){
      const t=c.localName;
      if(t==='r'){
        const rp=el(c,'rPr');let s='';
        for(const x of c.children){
          if(x.localName==='t')s+=escH(x.textContent);
          else if(x.localName==='tab')s+=' ';
          else if(x.localName==='br'||x.localName==='cr')s+='<br>';
          else if(x.localName==='drawing'||x.localName==='pict'){
            const bl=x.getElementsByTagNameNS('*','blip')[0];const rid=bl&&(bl.getAttribute('r:embed')||bl.getAttribute('embed'));
            if(rid&&relTarget[rid]){try{const d=await z.get(resolvePath('word/',relTarget[rid]));if(d){const ext=(relTarget[rid].split('.').pop()||'').toLowerCase();s+='<img src="'+await imageToDataUrl(d,{png:'image/png',gif:'image/gif',jpg:'image/jpeg',jpeg:'image/jpeg'}[ext]||'image/jpeg')+'" alt="">'}}catch(e){}}
          }
        }
        if(s&&rp){
          if(on(el(rp,'b')))s='<strong>'+s+'</strong>';
          if(on(el(rp,'i')))s='<em>'+s+'</em>';
          if(on(el(rp,'u')))s='<u>'+s+'</u>';
          const va=val(el(rp,'vertAlign'));if(va==='superscript')s='<sup>'+s+'</sup>';else if(va==='subscript')s='<sub>'+s+'</sub>';
        }
        out+=s;
      }else if(['hyperlink','ins','smartTag','sdt','sdtContent','fldSimple','customXml'].includes(t))out+=await runs(c);
    }
    return out;
  }
  async function para(p){
    const ppr=el(p,'pPr');let lvl=0,list=false;
    if(ppr){
      const ps=val(el(ppr,'pStyle'));const nm=ps?(styleName[ps]||ps.toLowerCase()):'';
      let m=/heading\s*(\d)|titolo\s*(\d)/.exec(nm);
      if(m)lvl=+(m[1]||m[2]);else if(nm==='title'||nm==='titolo')lvl=1;else if(nm==='subtitle'||nm==='sottotitolo')lvl=2;
      const ol=el(ppr,'outlineLvl');if(!lvl&&ol)lvl=+val(ol)+1;
      if(el(ppr,'numPr')&&!lvl)list=true;
    }
    const h=(await runs(p)).replace(/^(\s|<br>)+|(\s|<br>)+$/g,'');
    if(!hasText(h))return '';
    if(lvl)return '<h'+Math.min(4,lvl)+'>'+h.replace(/<\/?(strong|em)>/g,'').replace(/<br>/g,' ')+'</h'+Math.min(4,lvl)+'>';
    return list?'<li>'+h+'</li>':'<p>'+h+'</p>';
  }
  const body=doc.getElementsByTagNameNS('*','body')[0];let html='',n=0;
  const items=[...body.children];
  async function walk(list){
    for(const c of list){
      n++;if(n%200===0){if(prog)prog(Math.min(.95,n/items.length/1.1));await tick()}
      if(c.localName==='p')html+=await para(c);
      else if(c.localName==='tbl'){for(const tr of c.getElementsByTagNameNS('*','tr')){const cells=[];for(const tc of tr.children){if(tc.localName!=='tc')continue;let t='';for(const p of tc.getElementsByTagNameNS('*','p'))t+=' '+textOf(await para(p));if(t.trim())cells.push(escH(t.replace(/\s+/g,' ').trim()))}if(cells.length)html+='<p>'+cells.join(' · ')+'</p>'}}
      else if(c.localName==='sdt'){const sc=[...c.children].find(x=>x.localName==='sdtContent');if(sc)await walk([...sc.children])}
    }
  }
  await walk(items);
  html=html.replace(/(<li>.*?<\/li>)+/g,m=>'<ul>'+m+'</ul>');
  const t=core&&core.getElementsByTagNameNS('*','title')[0],a=core&&core.getElementsByTagNameNS('*','creator')[0];
  return {meta:{title:t?t.textContent.trim():'',author:a?a.textContent.trim():''},html};
}

/* ---- TXT / Markdown ---- */
function decodeText(buf){
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buf).replace(/^﻿/,'')}
  catch(e){return new TextDecoder('windows-1252').decode(buf)}
}
const HEADRE=/^(capitolo|chapter|parte|part|libro|book|prologo|prefazione|introduzione|epilogo|appendice|canto|atto)\b.{0,70}$/i;
function txtToHtml(t){
  t=t.replace(/\r\n?/g,'\n');
  let paras=t.split(/\n[ \t]*\n+/);
  if(paras.length<6&&t.split('\n').length>30)paras=t.split('\n');
  let out='';
  for(let p of paras){
    p=p.replace(/\s*\n\s*/g,' ').trim();if(!p)continue;
    const m=/^(#{1,4})\s+(.+)$/.exec(p);
    if(m)out+='<h'+m[1].length+'>'+escH(m[2])+'</h'+m[1].length+'>';
    else if(p.length<90&&HEADRE.test(p))out+='<h2>'+escH(p)+'</h2>';
    else out+='<p>'+escH(p.replace(/\*\*(.+?)\*\*/g,'$1').replace(/(^|\s)_(.+?)_(?=\s|$)/g,'$1$2'))+'</p>';
  }
  return out;
}

/* ---- PDF (pdf.js caricato al primo uso) ---- */
let pdfReady=null;
function loadPdfJs(){
  if(window.pdfjsLib)return Promise.resolve();
  if(pdfReady)return pdfReady;
  pdfReady=new Promise((ok,ko)=>{const s=document.createElement('script');s.src='pdf.js';s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc='pdf.worker.js';ok()};s.onerror=()=>ko(new Error('Impossibile caricare il lettore PDF'));document.head.appendChild(s)});
  return pdfReady;
}
const median=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[s.length>>1]};
function pageLines(items){
  const lines=[];let cur=null;
  for(const it of items){
    if(it.str===undefined)continue;
    const tr=it.transform,h=Math.hypot(tr[2],tr[3])||it.height||10,x=tr[4],y=tr[5];
    if(cur&&Math.abs(y-cur.y)<h*.5){
      const gap=x-cur.xEnd;if(gap>h*.12&&!cur.text.endsWith(' ')&&!it.str.startsWith(' '))cur.text+=' ';
      cur.text+=it.str;cur.xEnd=Math.max(cur.xEnd,x+it.width);cur.h=Math.max(cur.h,h);
    }else{if(cur)lines.push(cur);if(!it.str.trim()){cur=null;continue}cur={text:it.str,x,y,xEnd:x+it.width,h}}
  }
  if(cur)lines.push(cur);
  return lines.map(l=>({...l,text:l.text.replace(/\s+/g,' ').trim()})).filter(l=>l.text);
}
async function parsePdf(buf,prog){
  await loadPdfJs();
  const pdf=await pdfjsLib.getDocument({data:new Uint8Array(buf.slice(0))}).promise;const N=pdf.numPages;
  let cover=null,title='',author='';
  try{const p1=await pdf.getPage(1);const v0=p1.getViewport({scale:1});const vp=p1.getViewport({scale:320/v0.width});const cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;await p1.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;cover=cv.toDataURL('image/jpeg',.72);p1.cleanup()}catch(e){}
  try{const m=await pdf.getMetadata();title=(m.info&&m.info.Title)||'';author=(m.info&&m.info.Author)||''}catch(e){}
  const pages=[];let chars=0;
  for(let i=1;i<=N;i++){
    const pg=await pdf.getPage(i);const tc=await pg.getTextContent();const ls=pageLines(tc.items);pg.cleanup();
    ls.forEach(l=>chars+=l.text.length);pages.push(ls);
    if(i%5===0){if(prog)prog(.05+.85*i/N);await tick()}
  }
  if(chars<30*N)throw new Error('PDF senza testo (probabilmente una scansione): non posso leggerlo come testo');
  // intestazioni e piè di pagina ripetuti
  const cnt={};const key=l=>norm(l.text).replace(/\d+/g,'#');
  pages.forEach(ls=>{const s=new Set();[ls[0],ls[1],ls[ls.length-2],ls[ls.length-1]].forEach(l=>{if(l)s.add(key(l))});s.forEach(k=>cnt[k]=(cnt[k]||0)+1)});
  const thr=Math.max(3,N*.3);
  const clean=pages.map(ls=>ls.filter((l,i)=>{const edge=i<2||i>=ls.length-2;return !(edge&&(cnt[key(l)]>=thr||/^\d{1,4}$/.test(l.text)))}));
  const hs=[],gaps=[],xs=[],ends=[];
  clean.forEach(ls=>ls.forEach((l,i)=>{hs.push(l.h);xs.push(Math.round(l.x));ends.push(l.xEnd);if(i)gaps.push(ls[i-1].y-l.y)}));
  const medH=median(hs)||10;const medGap=median(gaps.filter(g=>g>0&&g<medH*3))||medH*1.3;
  const xc={};xs.forEach(x=>xc[x]=(xc[x]||0)+1);const left=+Object.keys(xc).sort((a,b)=>xc[b]-xc[a])[0]||0;
  const right=[...ends].sort((a,b)=>a-b)[Math.floor(ends.length*.9)]||0;
  const endP=/[.!?…:;»”"')\]]\s*$/;
  const blocks=[];
  clean.forEach((ls,pi)=>{
    let cur=null,prev=null;
    const push=()=>{if(cur){blocks.push(cur);cur=null}};
    for(const l of ls){
      const head=l.h>medH*1.3&&l.text.length<140;
      if(head){
        const last=blocks[blocks.length-1];
        if(cur&&!cur.hd)push();
        if(cur&&cur.hd&&Math.abs(cur.h-l.h)<1&&prev.y-l.y<l.h*2){cur.text+=' '+l.text}
        else{push();cur={hd:true,text:l.text,pg:pi+1,h:l.h,lvl:l.h>medH*1.7?2:3}}
        prev=l;continue;
      }
      if(cur&&cur.hd)push();
      const gap=prev?prev.y-l.y:0;
      const nw=!cur||gap>medGap*1.5||gap<0&&false||(prev&&l.x>left+medH*1.1&&endP.test(cur.text))||(prev&&prev.xEnd<right*.78&&endP.test(cur.text)&&l.x<=left+medH*.5&&gap>medGap*.9&&/^[A-ZÀ-Ý“"«\d]/.test(l.text));
      if(nw){push();cur={hd:false,text:l.text,pg:pi+1}}
      else if(/[a-zà-ÿ]-$/.test(cur.text)&&/^[a-zà-ÿ]/.test(l.text))cur.text=cur.text.slice(0,-1)+l.text;
      else cur.text+=' '+l.text;
      prev=l;
    }
    push();
  });
  // paragrafi spezzati dal cambio pagina
  const merged=[];
  for(const b of blocks){
    const m=merged[merged.length-1];
    if(m&&!m.hd&&!b.hd&&b.pg===m.pg+1&&!endP.test(m.text)&&/^[a-zà-ÿ]/.test(b.text)){m.text+=' '+b.text;m.pg=b.pg}else merged.push({...b});
  }
  // capitoli
  let starts=[];
  try{
    const ol=await pdf.getOutline();
    if(ol&&ol.length){
      for(const o of ol.slice(0,300)){
        try{let d=o.dest;if(typeof d==='string')d=await pdf.getDestination(d);if(d&&d[0]){const pi=typeof d[0]==='object'?await pdf.getPageIndex(d[0]):d[0];starts.push({t:(o.title||'').replace(/\s+/g,' ').trim(),pg:pi+1})}}catch(e){}
      }
      starts=starts.filter(s=>s.t).sort((a,b)=>a.pg-b.pg).filter((s,i,a)=>!i||s.pg!==a[i-1].pg);
    }
  }catch(e){}
  const chs=[];
  const hOf=b=>b.hd?'<h'+b.lvl+' data-pg="'+b.pg+'">'+escH(b.text)+'</h'+b.lvl+'>':'<p data-pg="'+b.pg+'">'+escH(b.text)+'</p>';
  if(starts.length>=2){
    if(starts[0].pg>1)starts.unshift({t:'Inizio',pg:1});
    starts.forEach((s,i)=>chs.push({t:s.t,h:'',pg0:s.pg,from:s.pg,to:i+1<starts.length?starts[i+1].pg-1:N}));
    // un capitolo che inizia nella stessa pagina del successivo: lo sposta in avanti
    merged.forEach(b=>{let c=chs.find(c=>b.pg>=c.from&&b.pg<=c.to);if(!c)c=chs[chs.length-1];c.h+=hOf(b)});
  }else{
    const step=12;for(let a=1;a<=N;a+=step){const z=Math.min(N,a+step-1);chs.push({t:'Pagine '+a+(z>a?'-'+z:''),h:'',pg0:a,from:a,to:z})}
    merged.forEach(b=>{const c=chs[Math.min(chs.length-1,Math.floor((b.pg-1)/step))];c.h+=hOf(b)});
  }
  return {meta:{title,author,cover,pages:N},chs};
}

/* ---- ingresso unico ---- */
async function sha(buf){const h=await crypto.subtle.digest('SHA-256',buf);return [...new Uint8Array(h)].slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join('')}
const baseName=n=>n.replace(/\.[^.]+$/,'').replace(/[_]+/g,' ').trim();
async function importFile(file,prog){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(!['epub','pdf','docx','txt','md','markdown','html','htm','xhtml'].includes(ext)){
    if(ext==='doc')throw new Error('Il formato .doc non è supportato: salvalo come .docx da Word');
    throw new Error('Formato .'+ext+' non supportato');
  }
  const buf=await file.arrayBuffer();const id=await sha(buf);
  let meta={title:'',author:'',cover:null},chs,res;
  if(ext==='epub'){res=await parseEpub(buf,prog);meta={...meta,...res.meta};chs=res.chs}
  else if(ext==='pdf'){res=await parsePdf(buf,prog);meta={...meta,...res.meta};chs=res.chs}
  else if(ext==='docx'){res=await parseDocx(buf,prog);meta={...meta,...res.meta};
    let lv=[1];const c1=(res.html.match(/<h1>/g)||[]).length;if(c1<2)lv=(res.html.match(/<h2>/g)||[]).length>=3?[1,2]:[1,2,3];
    chs=splitByHeadings(res.html,lv,'Testo');if(chs.length<2)chs=splitByHeadings(res.html,[1,2,3,4],'Testo')}
  else if(ext==='html'||ext==='htm'||ext==='xhtml'){const d=parseHtml(decodeText(buf));const html=cleanBlocks(d.body);const t=d.querySelector('title');meta.title=t?t.textContent.trim():'';chs=splitByHeadings(html,[1,2],'Testo')}
  else{const html=txtToHtml(decodeText(buf));chs=splitByHeadings(html,[1,2,3],'Testo');if(chs.length<2)chs=[{t:'Testo',h:html}]}
  let title=(meta.title||'').trim();if(!title||/^(\(anonymous\)|untitled|senza titolo|microsoft word.*)$/i.test(title)||/^[\w-]+\.(docx?|pdf|indd|tmp)$/i.test(title))title=baseName(file.name);
  const out=finalize({id,title,author:(meta.author||'').trim(),ext:ext==='markdown'?'md':ext==='htm'||ext==='xhtml'?'html':ext,size:file.size,added:Date.now(),cover:meta.cover||null,pages:meta.pages||0},chs);
  return {...out,blob:file};
}
