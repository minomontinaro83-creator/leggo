"use strict";
/* ---------- utilità ---------- */
const $=(s,r)=>(r||document).querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const wc=t=>{const m=String(t).match(/\S+/g);return m?m.length:0};
const tick=()=>new Promise(r=>setTimeout(r,0));
const hueOf=s=>{let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h%360};

/* ---------- database locale (IndexedDB) ---------- */
const IDB={
  db:null,
  open(){return new Promise((ok,ko)=>{const r=indexedDB.open('leggo',1);
    r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('books',{keyPath:'id'});d.createObjectStore('content');d.createObjectStore('files')};
    r.onsuccess=()=>{IDB.db=r.result;ok()};r.onerror=()=>ko(r.error)})},
  tx(store,mode,fn){return new Promise((ok,ko)=>{const t=IDB.db.transaction(store,mode);const rq=fn(t.objectStore(store));
    t.oncomplete=()=>ok(rq&&rq.result);t.onerror=()=>ko(t.error);t.onabort=()=>ko(t.error)})},
  get:(st,k)=>IDB.tx(st,'readonly',s=>s.get(k)),
  put:(st,v,k)=>IDB.tx(st,'readwrite',s=>k===undefined?s.put(v):s.put(v,k)),
  del:(st,k)=>IDB.tx(st,'readwrite',s=>s.delete(k)),
  all:st=>IDB.tx(st,'readonly',s=>s.getAll())
};

/* ---------- ZIP: lettura (inflate nativo) e scrittura (senza compressione) ---------- */
async function inflateRaw(raw){
  const ds=new DecompressionStream('deflate-raw');const w=ds.writable.getWriter();w.write(raw);w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u8){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=CRC[(c^u8[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
const Zip={
  async read(buf){
    const u8=buf instanceof Uint8Array?buf:new Uint8Array(buf);const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
    let e=u8.length-22;for(;e>=Math.max(0,u8.length-65557);e--)if(dv.getUint32(e,true)===0x06054b50)break;
    if(e<0||dv.getUint32(e,true)!==0x06054b50)throw new Error('File ZIP non valido');
    const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const ent=new Map(),low=new Map(),dec=new TextDecoder();
    for(let i=0;i<n;i++){
      if(dv.getUint32(p,true)!==0x02014b50)break;
      const method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),el=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lho=dv.getUint32(p+42,true);
      const name=dec.decode(u8.subarray(p+46,p+46+nl));ent.set(name,{method,csize,lho});low.set(name.toLowerCase(),name);p+=46+nl+el+cl;
    }
    const key=name=>{if(ent.has(name))return name;let d=name;try{d=decodeURIComponent(name)}catch(_){}if(ent.has(d))return d;return low.get(d.toLowerCase())||null};
    return {
      names:[...ent.keys()],has:name=>!!key(name),
      async get(name){const k=key(name);if(!k)return null;const x=ent.get(k);
        const lnl=dv.getUint16(x.lho+26,true),lel=dv.getUint16(x.lho+28,true);const s=x.lho+30+lnl+lel;const raw=u8.subarray(s,s+x.csize);
        if(x.method===0)return raw;if(x.method===8)return inflateRaw(raw);throw new Error('Compressione ZIP non supportata')},
      async text(name){const d=await this.get(name);return d?new TextDecoder().decode(d):null}
    };
  },
  async write(files){ // files: [{name,data:Uint8Array|Blob}]
    const enc=new TextEncoder(),parts=[],cd=[];let off=0;
    for(const f of files){
      const nm=enc.encode(f.name);const isBlob=f.data instanceof Blob;
      const bytes=isBlob?new Uint8Array(await f.data.arrayBuffer()):f.data;const crc=crc32(bytes),size=bytes.length;
      const lh=new DataView(new ArrayBuffer(30));lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x800,true);lh.setUint32(14,crc,true);lh.setUint32(18,size,true);lh.setUint32(22,size,true);lh.setUint16(26,nm.length,true);
      parts.push(lh.buffer,nm,bytes);
      const ch=new DataView(new ArrayBuffer(46));ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x800,true);ch.setUint32(16,crc,true);ch.setUint32(20,size,true);ch.setUint32(24,size,true);ch.setUint16(28,nm.length,true);ch.setUint32(42,off,true);
      cd.push(ch.buffer,nm);off+=30+nm.length+size;
    }
    let cdSize=0;cd.forEach(x=>cdSize+=x.byteLength||x.length);
    const eo=new DataView(new ArrayBuffer(22));eo.setUint32(0,0x06054b50,true);eo.setUint16(8,files.length,true);eo.setUint16(10,files.length,true);eo.setUint32(12,cdSize,true);eo.setUint32(16,off,true);
    return new Blob([...parts,...cd,eo.buffer],{type:'application/zip'});
  }
};

/* ---------- immagini ---------- */
function blobToDataUrl(b){return new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=ko;r.readAsDataURL(b)})}
async function shrinkImage(blob,maxW,q){
  try{
    const url=URL.createObjectURL(blob);
    const im=await new Promise((ok,ko)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=ko;i.src=url});
    const sc=Math.min(1,maxW/im.naturalWidth);const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(im.naturalWidth*sc));cv.height=Math.max(1,Math.round(im.naturalHeight*sc));
    cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);URL.revokeObjectURL(url);return cv.toDataURL('image/jpeg',q||.78);
  }catch(e){return null}
}
async function imageToDataUrl(u8,mime){ // immagini dentro ai libri: riduce quelle grandi
  const blob=new Blob([u8],{type:mime||'image/jpeg'});
  if(blob.size>350000||/tiff|bmp|x-emf|x-wmf/.test(mime||'')){const d=await shrinkImage(blob,1100,.8);if(d)return d}
  return blobToDataUrl(blob);
}
