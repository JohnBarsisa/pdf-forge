// File readers only. Archives are never unpacked onto the filesystem.
export const TYPES = {
  pdf:{name:'PDF',group:'pdf',mime:'application/pdf'},
  epub:{name:'EPUB',group:'book',mime:'application/epub+zip'},
  fb2:{name:'FB2',group:'book',mime:'application/xml'},
  cbz:{name:'CBZ',group:'comic',mime:'application/vnd.comicbook+zip'},
  cbt:{name:'CBT',group:'comic',mime:'application/x-tar'},
  zip:{name:'ZIP comic',group:'comic',mime:'application/zip'},
  docx:{name:'Word',group:'text',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
  txt:{name:'Text',group:'text',mime:'text/plain'}, md:{name:'Markdown',group:'text',mime:'text/markdown'},
  csv:{name:'CSV',group:'text',mime:'text/csv'}, tsv:{name:'TSV',group:'text',mime:'text/plain'},
  log:{name:'Log',group:'text',mime:'text/plain'}, json:{name:'JSON',group:'text',mime:'application/json'},
  ...Object.fromEntries(Object.entries({png:'png',jpg:'jpeg',jpeg:'jpeg',webp:'webp',gif:'gif',avif:'avif',bmp:'bmp'}).map(([k,v])=>[k,{name:k.toUpperCase(),group:'image',mime:'image/'+v}]))
};
export const extension = (name) => name.split('.').at(-1).toLowerCase();
export const acceptFormats = Object.keys(TYPES).map(e=>'.'+e).join(',');
const M=1024*1024, FILE_MAX=256*M, ENTRY_MAX=36*M, TOTAL_MAX=512*M;
export const maxFileBytes=FILE_MAX;
const natural=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
const decoder=new TextDecoder();
const raster=(name)=>TYPES[extension(name)]?.group==='image';
const safeKey = (p) => p && !p.startsWith('/') && !/[:\\\u0000-\u001f]/.test(p) && !p.split('/').some(x=>x==='..');
const visible = (p)=>safeKey(p)&&!p.split('/').some(x=>x.startsWith('.')||x==='__MACOSX');

export function resolveMember(base, href) {
  if(!href || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(href))return null;
  let ref;try{ref=decodeURIComponent(href.split(/[?#]/,1)[0]);}catch{return null}
  if(!ref||/[\\:\u0000-\u001f]/.test(ref))return null;
  const parts=ref.startsWith('/')?[]:base.split('/').slice(0,-1);
  for(const p of ref.replace(/^\//,'').split('/')){
    if(!p||p==='.')continue;
    if(p==='..'){if(!parts.length)return null;parts.pop();}else parts.push(p);
  }
  const key=parts.join('/'); return safeKey(key)?key:null;
}
export function zipIndex(bytes){
  if(bytes.length>FILE_MAX)throw new Error('This archive is larger than 256 MB.');
  if(bytes.length<22)throw new Error('This is not a valid ZIP-based file.');
  const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let e=-1;
  for(let k=bytes.length-22;k>=Math.max(0,bytes.length-65557);k--){
    if(d.getUint32(k,true)===0x06054b50 && k+22+d.getUint16(k+20,true)===bytes.length){e=k;break;}
  }
  if(e<0)throw new Error('This is not a valid ZIP-based file.');
  const count=d.getUint16(e+10,true), centralSize=d.getUint32(e+12,true), off=d.getUint32(e+16,true);
  if(d.getUint16(e+4,true)||d.getUint16(e+6,true)||count!==d.getUint16(e+8,true)||count>6000||off+centralSize!==e)throw new Error('Unsupported ZIP structure (split, ZIP64, or too many entries).');
  const map=new Map();
  let k=off,total=0;
  for(let i=0;i<count;i++){
    if(k+46>e||d.getUint32(k,true)!==0x02014b50)throw new Error('The archive index is damaged.');
    const flags=d.getUint16(k+8,true), method=d.getUint16(k+10,true), n=d.getUint16(k+28,true), end=k+46+n, len=d.getUint32(k+24,true), packed=d.getUint32(k+20,true), local=d.getUint32(k+42,true);
    if(end>e||!n)throw new Error('The archive index is damaged.');
    if(flags&1)throw new Error('Password-protected ZIP archives are not supported.');
    if(local+30>off||d.getUint32(local,true)!==0x04034b50||d.getUint16(local+8,true)!==method||![0,8].includes(method))throw new Error('The archive entry is damaged or uses unsupported compression.');
    const dataStart=local+30+d.getUint16(local+26,true)+d.getUint16(local+28,true);
    if(dataStart+packed>off||(method===0&&packed!==len)||(!(flags&8)&&(d.getUint32(local+18,true)!==packed||d.getUint32(local+22,true)!==len)))throw new Error('Unexpected expanded archive size.');
    total+=len;if(total>TOTAL_MAX||len>ENTRY_MAX||packed>bytes.length)throw new Error('This archive exceeds the preview size limits.');
    const key=decoder.decode(bytes.subarray(k+46,end));
    if(!safeKey(key)||map.has(key))throw new Error('The archive has unsafe or duplicate entry names.');
    map.set(key,len);k=end+d.getUint16(k+30,true)+d.getUint16(k+32,true);
  }
  if(k!==e)throw new Error('The archive index is damaged.');
  return map;
}
async function openZip(bytes, zip=globalThis.JSZip){
  const index=zipIndex(bytes), unpacked=await zip.loadAsync(bytes);
  return {names:[...index.keys()], async read(name,limit=ENTRY_MAX){
    const expected=index.get(name), entry=unpacked.file(name);
    if(!entry||expected===undefined)throw new Error('This file refers to a missing entry.');
    if(expected>limit)throw new Error('This item is too large to preview.');
    return new Promise((resolve,reject)=>{
      const out=new Uint8Array(expected), stream=entry.internalStream('uint8array');let used=0;
      stream.on('data',chunk=>{
        if(used+chunk.length>expected){stream.pause();reject(new Error('Unexpected expanded archive size.'));return;}
        out.set(chunk,used);used+=chunk.length;
      }).on('error',reject).on('end',()=>used===expected?resolve(out):reject(new Error('The archive entry is incomplete.'))).resume();
    });
  }};
}
export function openTar(bytes){
  if(bytes.length>FILE_MAX)throw new Error('This archive is larger than 256 MB.');
  const map=new Map(), str=(i,n)=>decoder.decode(bytes.subarray(i,i+n)).split('\0',1)[0];
  let pos=0,count=0,terminated=false;
  while(pos+512<=bytes.length){
    if(bytes.subarray(pos,pos+512).every(x=>x===0)){terminated=true;break;}
    const rawSize=str(pos+124,12).trim(), rawSum=str(pos+148,8).trim();
    const declared=/^[0-7]+$/.test(rawSum)?parseInt(rawSum,8):-1;
    let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:bytes[pos+i];
    if(!/^[0-7]+$/.test(rawSize)||declared!==sum||++count>6000)throw new Error('Unsupported or damaged TAR archive.');
    const n=parseInt(rawSize,8), prefix=str(pos+345,155), name=(prefix?prefix+'/':'')+str(pos,100), tag=bytes[pos+156], start=pos+512;
    if(!Number.isSafeInteger(n)||n>ENTRY_MAX||start+n>bytes.length)throw new Error('A TAR entry is invalid or too large.');
    if(tag===0||tag===48){const key=name.replace(/^\.\//,'');if(!safeKey(key)||map.has(key))throw new Error('The archive has unsafe or duplicate entry names.');map.set(key,bytes.subarray(start,start+n));}
    pos=start+Math.ceil(n/512)*512;
  }
  if(!terminated||!count)throw new Error('Unsupported or damaged TAR archive.');
  return {names:[...map.keys()],async read(name,limit=ENTRY_MAX){const data=map.get(name);if(!data||data.length>limit)throw new Error('The item is unavailable or too large to preview.');return data;}};
}
const xml=(text)=>{
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('This document uses an unsupported XML declaration.');
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagNameNS('*','parsererror').length)throw new Error('This document contains invalid XML.');
  return doc;
};
const all=(el,name)=>[...el.getElementsByTagNameNS('*',name)];
const first=(el,name)=>all(el,name)[0];
const plain=async(a,p,limit=4*M)=>decoder.decode(await a.read(p,limit));
const bookText=(el)=>el?.textContent.trim()||'';
const label=(path)=>path.split('/').at(-1).replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ');
async function epubModel(arc){
  const container=xml(await plain(arc,'META-INF/container.xml',1024*1024));
  const root=first(container,'rootfile')?.getAttribute('full-path');
  if(!safeKey(root))throw new Error('The EPUB package file was not found.');
  if(arc.names.includes('META-INF/encryption.xml')){
    const e=xml(await plain(arc,'META-INF/encryption.xml',M));
    const algorithms=all(e,'EncryptionMethod').map(n=>n.getAttribute('Algorithm'));
    if(algorithms.some(a=>!['http://www.idpf.org/2008/embedding','http://ns.adobe.com/pdf/enc#RC'].includes(a)))throw new Error('This EPUB is encrypted or DRM-protected.');
  }
  const packageDoc=xml(await plain(arc,root));
  const manifest=new Map(all(first(packageDoc,'manifest')||packageDoc,'item').map(n=>[n.getAttribute('id'),n]));
  const spine=first(packageDoc,'spine'), chapters=[];
  for(const n of (spine?all(spine,'itemref'):[])){
    if(n.getAttribute('linear')==='no')continue;
    const i=manifest.get(n.getAttribute('idref')), path=resolveMember(root,i?.getAttribute('href'));
    if(!path||!arc.names.includes(path)||!(/\.(xhtml|html|htm)$/i.test(path)||i?.getAttribute('media-type')==='application/xhtml+xml'))continue;
    chapters.push({path,title:label(path)});
  }
  if(!chapters.length)throw new Error('No readable chapters were found in this EPUB.');
  // The navigation document is optional. Reading order always comes from the spine.
  const nav=[...manifest.values()].find(n=>n.getAttribute('properties')?.split(/\s+/).includes('nav'));
  const tocPath=resolveMember(root,nav?.getAttribute('href'));
  if(tocPath){
    try{
      const toc=xml(await plain(arc,tocPath));
      const byPath=new Map(chapters.map(x=>[x.path,x]));
      for(const n of all(toc,'a')){const ch=byPath.get(resolveMember(tocPath,n.getAttribute('href')));if(ch&&bookText(n))ch.title=bookText(n).slice(0,140);}
    }catch{}
  }
  return {title:bookText(first(packageDoc,'title')),byline:bookText(first(packageDoc,'creator')),chapters,arc};
}
const SAFE_TAGS=new Set('p div section article h1 h2 h3 h4 h5 h6 blockquote ul ol li dl dt dd figure figcaption span em i strong b s small sub sup br hr code pre table thead tbody tr th td a'.split(' '));
const IGNORE = new Set('script style iframe frame object embed template form button input textarea select audio video source link meta svg math'.split(' '));
// Build a fresh tree. No scripts, style sheets, event handlers, remote URLs or raw HTML enter the app.
export async function bookFragment(data,owner,readImage,goTo){
  const frag=owner.createDocumentFragment();let imgCount=0, visited=0;
  const walk=async(el,parent,depth)=>{
    if(depth>80||++visited>30000)return;
    if(el.nodeType===3||el.nodeType===4){parent.append(owner.createTextNode(el.nodeValue));return;}
    if(el.nodeType!==1)return;
    const tag=el.localName.toLowerCase();
    if(IGNORE.has(tag))return;
    if(tag==='img'||tag==='image'){
      const href=el.getAttribute('src')||el.getAttribute('href')||el.getAttributeNS('http://www.w3.org/1999/xlink','href');
      if(imgCount++>=50||!href)return;
      try{
        const image=await readImage(href);if(!image)return;
        const node=owner.createElement('img');node.src=image;node.alt=el.getAttribute('alt')||'';node.loading='lazy';parent.append(node);
      }catch{}return;
    }
    const mapped=tag==='title'?'h2':tag==='subtitle'?'h3':tag==='emphasis'?'em':tag==='empty-line'?'br':tag==='poem'||tag==='stanza'?'blockquote':tag==='v'?'div':tag;
    const node=SAFE_TAGS.has(mapped)?owner.createElement(mapped==='a'?'span':mapped):parent;
    if(mapped==='a'&&node!==parent){const dest=goTo(el.getAttribute('href'));if(dest){node.className='book-link';node.dataset.action='item:'+dest;node.tabIndex=0;node.setAttribute('role','link');}}
    if(node!==parent)parent.append(node);
    for(const child of el.childNodes)await walk(child,node,depth+1);
  };
  for(const child of data.childNodes)await walk(child,frag,0);
  return frag;
}
async function wordModel(bytes){
  const arc=await openZip(bytes), d=xml(await plain(arc,'word/document.xml',8*M));
  const body=first(d,'body');
  if(!body)throw new Error('This Word file does not contain a document body.');
  const lines=all(body,'p').map(p=>all(p,'t').map(n=>n.textContent).join(''));
  return {format:'docx',groups:[{title:'Document',text:lines.join('\n')}]};
}
export async function openFormat(bytes,name){
  if(!bytes.length)throw new Error('This file is empty.');
  if(bytes.length>FILE_MAX)throw new Error('This file is larger than 256 MB.');
  const format=extension(name), def=TYPES[format];
  if(!def){
    if(['cbr','cb7','cba','rar','7z'].includes(format))throw new Error('This format is not supported here yet. Supported comic archives are CBZ, CBT and ZIP containing images.');
    throw new Error('This file type is not supported. Open File shelf to see supported formats.');
  }
  if(def.group==='comic'){
    const arc=format==='cbt'?openTar(bytes):await openZip(bytes);
    const pages=arc.names.filter(n=>visible(n)&&raster(n)).sort(natural.compare);
    if(!pages.length)throw new Error('This archive has no supported comic page images.');
    return {format,group:def.group,arc,groups:pages.map((path,i)=>({path,title:'Page '+(i+1)}))};
  }
  if(format==='epub'){
    const m=await epubModel(await openZip(bytes));return {format,group:def.group,...m,groups:m.chapters};
  }
  if(format==='fb2'){
    if(bytes.length>12*M)throw new Error('This FB2 exceeds the 12 MB text preview limit.');
    const d=xml(decoder.decode(bytes)), info=first(d,'title-info'), body=all(d,'body').find(b=>!b.getAttribute('name'))||first(d,'body');
    if(!body)throw new Error('No FictionBook content found.');
    const sections=[...body.children].filter(n=>n.localName==='section');
    return {format,group:def.group,title:bookText(info&&first(info,'book-title')),byline:bookText(info&&first(info,'last-name')),groups:(sections.length?sections:[body]).map((el,i)=>({node:el,title:bookText(first(el,'title')).slice(0,120)||'Section '+(i+1)}))};
  }
  if(def.group==='image')return {format,group:def.group,groups:[{title:'Image',data:bytes,mime:def.mime}]};
  if(format==='docx')return {...await wordModel(bytes),group:def.group};
  if(def.group==='text'){
    if(bytes.length>4*M)throw new Error('This text file exceeds the 4 MB preview limit.');
    const enc=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';
    return {format,group:def.group,groups:[{title:'Document',text:new TextDecoder(enc).decode(bytes)}]};
  }
  throw new Error('Open PDFs in the PDF reader.');
}
export async function chapterFragment(doc, i, owner, imageURL) {
  const item=doc.groups[i];
  if(doc.format==='fb2')return bookFragment(item.node,owner,async()=>null,()=>null);
  const markup=xml(await plain(doc.arc,item.path));
  const body=first(markup,'body')||markup.documentElement;
  const byPath=new Map(doc.groups.map((chapter,j)=>[chapter.path,j+1]));
  return bookFragment(body,owner,async href=>{
    const path=resolveMember(item.path,href);
    if(!path||!raster(path)||!doc.arc.names.includes(path))return null;
    return imageURL(await doc.arc.read(path,ENTRY_MAX),TYPES[extension(path)].mime);
  },href=>byPath.get(resolveMember(item.path,href)));
}
