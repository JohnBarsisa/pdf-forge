import * as js from './vendor/pdf.min.mjs';
import {icon} from './icons.mjs';
import * as pdf from './pdf-tools.mjs';
import {TYPES,acceptFormats,extension,openFormat,chapterFragment,maxFileBytes} from './formats.mjs';
import {listPins,getPin,setPin,removePin} from './shelf-store.mjs';
const asset=p=>new URL(p,import.meta.url).href;
js.GlobalWorkerOptions.workerSrc=asset('./vendor/pdf.worker.min.mjs');
const $=sel=>document.querySelector(sel), desktop=window.forgeDesktop;
const esc=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('forge.'+key))??fallback}catch{return fallback}};
const persist=(key,v)=>{try{localStorage.setItem('forge.'+key,JSON.stringify(v))}catch{}};
const tools={
view:['View PDFs','Open, search and read','#78baff'],
edit:['Edit PDFs','Text and markup','#ff8d92'],
merge:['Merge & Split','Organize pages','#ce9cff'],
convert:['Convert PDFs','Text and page images','#fdb075'],
in:['Documents to PDF','Images and text files','#78d9b2'],
out:['PDF to Documents','Editable Word text','#85b5ff'],
sign:['Sign PDFs','Add a visual signature','#ff97bb'],
compress:['Compress PDFs','Lossless PDF rewrite','#b6a2ff']
};
const palettes=[['ember','Ember','#f78b5e'],['copper','Copper','#dda36b'],['crimson','Crimson','#d35678'],['aubergine','Aubergine','#b485d4'],['forest','Forest','#63ae82'],['olive','Olive','#aab65b']];
let prefs={mode:'dark',palette:'ember',density:'comfortable',...read('appearance',{})}, recent=read('recent',[]).filter(x=>x.name!=='Summit Field Notes.pdf');
let area='home', docs=[], active=null, queue=[], queueKind='pdf', tool='', draft='', token=0, readerJob, drawing=null, pageView=null;
let thumbsObserver, readingUrls=[], shelfFilter='all', shelfQuery='', shelfSort='name', pins=[];
let progress=read('reading-progress',[]);
const sampleFiles={
  pdf:['Summit Field Notes.pdf','./art/summit-field-notes.pdf','Field report · 3 pages'],
  epub:['The Lantern Ridge.epub','./art/lantern-ridge.epub','Illustrated ebook · 3 chapters'],
  cbz:['Signal at Dusk.cbz','./art/signal-at-dusk.cbz','Original comic · 3 pages']
};
const kind=d=>TYPES[d?.format]||TYPES.pdf;
const pdfActive=()=>active?.format==='pdf'?active:null;
const docKey=d=>JSON.stringify([d.name,d.originalSize,d.modified||0]);
const atProgress=d=>progress.find(x=>x.id===docKey(d))?.page||1;
function setProgress(d) {
  const id=docKey(d);progress=[{id,page:d.page},...progress.filter(x=>x.id!==id)].slice(0,100);
  persist('reading-progress',progress);
}
const openCount=d=>d.format==='pdf'?d.doc.numPages:d.groups.length;
const pinned=d=>pins.find(x=>x.id===d.pinId||x.key===docKey(d));
let zoom=1, query='', matches=[], matchIndex=0, busy=false, toastTimer, dragDepth=0;
const screen=$('#screen'), dlg=$('#dialog'), picker=$('#picker');
const btn=(label,action,i='',cls='',disabled=false)=>'<button type="button" class="btn '+cls+'" data-action="'+action+'" '+(disabled?'disabled':'')+'>'+ (i?icon(i):'') +'<span>'+label+'</span></button>';
const ib=(label,action,i,disabled=false)=>'<button type="button" class="btn ghost icon-only" aria-label="'+label+'" title="'+label+'" data-action="'+action+'" '+(disabled?'disabled':'')+'>'+icon(i)+'</button>';
const nav=(label,action,i,selected)=>'<button class="nav-btn" data-action="'+action+'" title="'+label+'" aria-label="'+label+'" '+(selected?'aria-current="page"':'')+'>'+icon(i)+'<span>'+label+'</span></button>';
const card=(id,[label,desc,color])=>'<button class="tool" data-action="route:'+id+'" title="'+desc+'" style="--tool:'+color+'"><i>'+icon(id)+'</i><span>'+label+'</span></button>';
const title=(name,note,actions='')=>'<header class="page-head"><div><p class="eyebrow">PDF Forge / Workspace</p><h1 class="page-title">'+name+'</h1><p class="meta">'+note+'</p></div><div class="row">'+actions+'</div></header>';
const pane=(name,html)=>'<section class="panel"><div class="panel-head"><h2 class="panel-title">'+name+'</h2></div><div class="panel-body">'+html+'</div></section>';
const drop=(label,action,note)=>'<button class="dropzone" data-action="'+action+'">'+icon('open')+'<strong>'+label+'</strong><p>'+note+'</p></button>';
const dname=()=>active?esc(active.name):'No document';
function notify(message){const t=$('#toast');t.textContent=message;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,4400);}
function appearance(){const system=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';Object.assign(document.documentElement.dataset,{mode:prefs.mode==='system'?system:prefs.mode,palette:prefs.palette,density:prefs.density});persist('appearance',prefs);}
matchMedia('(prefers-color-scheme: light)').addEventListener('change',appearance);appearance();
function chrome(){
  $('#main-nav').innerHTML='<div class="nav-label">WORKSPACE</div>'+nav('Home','home','home',area==='home')+nav('File shelf','shelf','open',area==='shelf')+nav('Reader','files','view',(area==='files'||area==='view'))+'<div class="nav-label">PDF TOOLS</div>'+Object.entries(tools).map(([id,[label]])=>nav(label,'route:'+id,id,area===id)).join('');
  $('#side-end').innerHTML=nav('Appearance','theme','settings',area==='theme')+nav('Help','help','help',area==='help');
  $('#crumb').textContent=tools[area]?.[0]||({home:'Overview',theme:'Appearance',help:'Help',shelf:'File shelf',files:'Reader'}[area]||area);
  $('#bar-tools').innerHTML=ib('Appearance settings','theme','sun')+btn('Open files','open','open','shortcut');
}
function samples(){
  return '<div class="sample-list">'+Object.entries(sampleFiles).map(([k,[name,,detail]])=>
    '<button class="recent-item sample-item" data-action="sample:'+k+'"><span class="badge '+TYPES[k].group+'">'+TYPES[k].name+'</span><span><b>'+name+'</b><small>'+detail+'</small></span><i>'+icon('right')+'</i></button>').join('')+'</div>';
}
function home(){
  return '<section class="banner"><div class="brand-art" aria-hidden="true"></div><div class="banner-copy"><p class="eyebrow">PDF FORGE · LOCAL FILE WORKSPACE</p><h1>Open more.<br>Keep it local.</h1><p>Work on PDFs, read ebooks and comics, and keep the files you want to revisit on one shelf.</p><div class="row">'+btn('Open files','open','open','primary')+btn('File shelf','shelf','open')+'</div></div></section>'+
    '<div class="section-head"><h2>PDF tools</h2><span>Drop a file to open it <kbd>Ctrl O</kbd></span></div><div class="cards">'+Object.entries(tools).map(([id,v])=>card(id,v)).join('')+'</div>'+
    '<div class="lower">'+pane('Try a sample',samples())+'<section class="panel"><div class="panel-head"><h2 class="panel-title">Sample workspace</h2>'+btn('Open sample PDF','sample:pdf','right','ghost panel-action')+'</div><div class="preview-paper"><div class="sample-thumbs" aria-hidden="true"><i></i><i></i><i></i></div><canvas id="sample-preview" aria-label="Preview of Summit Field Notes PDF"></canvas></div></section></div>';
}
function shelfRows(){
  const query=shelfQuery.trim().toLocaleLowerCase(), rows=[];
  for(const [i,d] of docs.entries())rows.push({name:d.name,kind:kind(d),action:'tab:'+i,status:d.sample?'Sample open':'Open now',meta:size(d.originalSize),extra:!d.sample?(pinned(d)?'unpin:'+pins.indexOf(pinned(d)):'pin:'+i):''});
  for(const [i,m] of pins.entries())if(!docs.some(d=>docKey(d)===m.key))rows.push({name:m.name,kind:TYPES[m.format],action:'pin-open:'+i,status:'Pinned · resume reading',meta:size(m.size),extra:'unpin:'+i});
  for(const [i,r] of recent.entries())if(!docs.some(d=>d.name===r.name)&&!pins.some(d=>d.name===r.name))
    rows.push({name:r.name,kind:TYPES[r.format||extension(r.name)]||TYPES.pdf,action:'recent:'+i,status:'Recent · needs re-opening',meta:r.meta||''});
  const filtered=rows.filter(r=>(shelfFilter==='all'||r.kind?.group===shelfFilter)&&(!query||r.name.toLocaleLowerCase().includes(query)));
  if(shelfSort==='name')filtered.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  if(shelfSort==='kind')filtered.sort((a,b)=>a.kind.name.localeCompare(b.kind.name)||a.name.localeCompare(b.name));
  return filtered.length?filtered.map(r=>'<div class="shelf-row"><button class="recent-item" data-action="'+r.action+'"><span class="badge '+r.kind.group+'">'+r.kind.name+'</span><span><b>'+esc(r.name)+'</b><small>'+esc(r.status)+' · '+esc(r.meta)+'</small></span><i>'+icon('right')+'</i></button>'+(r.extra?ib(r.extra.startsWith('pin:')?'Pin this file':'Remove stored copy',r.extra,r.extra.startsWith('pin:')?'plus':'delete'):'')+'</div>').join(''):'<p class="overview-note">No matching files. Open a file or try one of the samples.</p>';
}
function shelf(){
  return title('File shelf','Find open, recent and pinned files. Your originals stay where they are.',btn('Open files','open','open','primary'))+
   '<div class="shelf-layout">'+pane('Your files','<div class="shelf-search"><input id="shelf-search" class="input" type="search" aria-label="Search filenames" value="'+esc(shelfQuery)+'" placeholder="Search filenames"><select id="shelf-sort" aria-label="Sort files"><option value="name">By name</option><option value="kind" '+(shelfSort==='kind'?'selected':'')+'>By format</option></select></div><div class="choices shelf-filters">'+[['all','All'],['pdf','PDFs'],['book','Ebooks'],['comic','Comics'],['text','Text'],['image','Images']].map(([v,l])=>'<button class="btn '+(v===shelfFilter?'active':'')+'" data-action="filter:'+v+'" aria-pressed="'+(v===shelfFilter)+'">'+l+'</button>').join('')+'</div><div id="shelf-rows">'+shelfRows()+'</div>'+(recent.length?'<div class="actions">'+btn('Clear recent list','clear-recent','','ghost')+'</div>':''))+
   '<div>'+pane('Try a sample',samples())+'<div class="shelf-space">'+pane('Formats you can open','<p class="hint"><strong>Documents:</strong> PDF, DOCX (text preview), TXT, Markdown, CSV, TSV, JSON and logs.<br><strong>Books:</strong> EPUB and FB2.<br><strong>Comics:</strong> CBZ, CBT and ZIP with page images.<br><strong>Images:</strong> PNG, JPEG, GIF, WebP, AVIF and BMP.</p><p class="hint">DRM and CBR/CB7 are not supported. Pinning keeps a copy in this app, not in a cloud account.</p>')+'</div></div></div>';
}
function tabStrip(d){
  return '<div class="tabs" aria-label="Open files">'+docs.map((x,i)=>'<div class="tab '+(x===d?'active':'')+'"><button data-action="tab:'+i+'" title="'+esc(x.name)+'">'+esc(x.name)+(x.dirty?' •':'')+'</button>'+ib('Close '+esc(x.name),'close-tab:'+i,'close')+'</div>').join('')+'</div>';
}
function pinControl(d){
  if(d.sample)return '';
  const match=pinned(d);
  return match?'<span class="meta pinned-indicator">Pinned</span>':btn('Pin to shelf','pin:'+docs.indexOf(d),'plus','ghost');
}
function fileReader(){
  if(!active||active.format==='pdf')return tabStrip(active)+title('Reader','Open an ebook, comic, image, text file or PDF.')+drop('Open files','open','Drop supported files or choose them on this device.')+'<div class="shelf-space">'+pane('Try a sample',samples())+'</div>';
  const d=active,k=kind(d), total=d.groups.length, isBook=k.group==='book', isComic=k.group==='comic', name=d.title||d.name;
  const controls=total>1?ib('Previous '+(isBook?'chapter':'page'),'item-prev','left',d.page<=1)+'<span class="meta">'+d.page+' / '+total+'</span>'+ib('Next '+(isBook?'chapter':'page'),'item-next','right',d.page>=total):'';
  const toc=total>1?'<label class="reading-select"><span>'+(isBook?'Chapter':'Page')+'</span><select id="reader-jump" aria-label="'+(isBook?'Jump to chapter':'Jump to page')+'">'+d.groups.map((e,i)=>'<option value="'+(i+1)+'" '+(i+1===d.page?'selected':'')+'>'+esc(e.title)+'</option>').join('')+'</select></label>':'';
  const sizing=isBook?ib('Smaller text','reader-size:down','minus')+'<span class="meta">'+Math.round(d.scale*100)+'%</span>'+ib('Larger text','reader-size:up','plus'):isComic||k.group==='image'?'<label class="reading-select"><span>Fit</span><select id="reader-fit" aria-label="Image size"><option value="page">Fit page</option><option value="width" '+(d.fit==='width'?'selected':'')+'>Fit width</option></select></label>':'';
  return tabStrip(d)+title(esc(name),esc([k.name,d.byline,d.title?d.name:'',size(d.originalSize)].filter(Boolean).join(' · ')),pinControl(d))+
   '<section class="tools-shell"><div class="toolbar reading-bar">'+controls+toc+'<span class="spacer"></span>'+sizing+'</div><div id="reading-body" class="reading-body '+k.group+' '+(d.fit==='width'?'width-fit':'')+'" aria-busy="true" tabindex="0"></div><div class="read-status"><span id="file-status" role="status">Opening…</span><span>Read only · Local file</span></div></section>';
}
async function paintFile(d,stamp){
  const body=$('#reading-body'), status=$('#file-status');if(!body||!status)return;
  const item=d.groups[d.page-1], k=kind(d), bg=k.group;
  const asURL=(data,mime)=>{
    if(stamp!==token)return null;
    const u=URL.createObjectURL(new Blob([data],{type:mime}));readingUrls.push(u);return u;
  };
  try{
    if(bg==='book'){
      const html=await chapterFragment(d,d.page-1,document,asURL);if(stamp!==token)return;
      const article=document.createElement('article');article.className='book-page';article.style.fontSize=d.scale+'rem';article.append(html);body.append(article);
    }else if(bg==='text'){
      const pre=document.createElement('pre');pre.className='text-file';pre.textContent=item.text;body.append(pre);
    }else{
      const bytes=item.data||await d.arc.read(item.path);
      if(stamp!==token)return;
      const im=document.createElement('img');im.alt=bg==='comic'?'Comic page '+d.page:d.name;
      im.src=asURL(bytes,item.mime||TYPES[extension(item.path)].mime);
      await im.decode();if(stamp!==token)return;body.append(im);
    }
    status.textContent=bg==='comic'?'Page '+d.page+' of '+d.groups.length:bg==='book'?'Chapter '+d.page+' of '+d.groups.length:'Preview ready';
  }catch(e){if(stamp===token){status.textContent=e.message;body.textContent='This item could not be previewed.';}}
  finally{if(stamp===token)body.removeAttribute('aria-busy');}
}
let sampleDoc;
async function samplePreview(){const canvas=$('#sample-preview');if(!canvas)return;try{sampleDoc ||= (await loadJS(new Uint8Array(await (await fetch(asset('./art/summit-field-notes.pdf'))).arrayBuffer()))).doc;const p=await sampleDoc.getPage(1);if(canvas.isConnected)await renderCanvas(p,canvas,0.85,1.5)}catch(e){console.warn(e)}}
function setting(){
  return title('Make it yours','Choose a palette, light level and spacing. Changes are saved on this device.')+
    pane('Workspace appearance','<div class="setting-row"><strong>Color mode</strong><div class="choices">'+[['system','System'],['dark','Soft dark'],['light','Tinted light']].map(([id,label])=>btn(label,'mode:'+id,'sun',prefs.mode===id?'active':'')).join('')+'</div></div>'+
    '<div class="setting-row"><strong>Accent palette</strong><div class="choices">'+palettes.map(([id,label,color])=>'<button class="theme-chip '+(prefs.palette===id?'active':'')+'" data-action="palette:'+id+'" aria-pressed="'+(prefs.palette===id)+'"><i style="--swatch:'+color+'"></i>'+label+'</button>').join('')+'</div></div>'+
    '<div class="setting-row"><strong>Toolbar spacing</strong><div class="choices">'+[['comfortable','Comfortable'],['compact','Compact']].map(([id,label])=>btn(label,'density:'+id,'',prefs.density===id?'active':'')).join('')+'</div></div>'+btn('Restore defaults','reset-theme','undo','ghost'));
}
function toolPage(){
  const active=pdfActive();
  const a=active?'<div class="field"><strong>Current document</strong><span class="muted">'+dname()+'</span></div>':'';
  const list='<div class="file-list">'+queue.map((f,i)=>'<div class="file-row">'+icon('file')+'<span>'+esc(f.name)+' <small class="muted">'+size(f.size)+'</small></span>'+ib('Move up','queue-up:'+i,'up',!i)+ib('Move down','queue-down:'+i,'down',i===queue.length-1)+ib('Remove file','queue-remove:'+i,'close')+'</div>').join('')+'</div>';
  let content='', side='';
  if(area==='merge'){
    content=pane('Merge multiple PDFs',drop('Add PDFs to merge','queue-picker','Files are merged in the listed order.')+list+'<div class="actions">'+btn('Merge and save','merge-run','merge','primary',queue.length<2)+(active?btn('Add open PDF','queue-current','plus'):'')+'</div>');
    side=pane('Extract pages from one PDF',a+(active?'<label class="field">Page range<input id="range" placeholder="1, 3-5" value="1"></label>'+btn('Save extracted pages','extract-run','out','primary'):btn('Open a PDF','open-pdf','open','primary'))+'<p class="hint">Rotate, reorder or delete individual pages in the reader.</p>');
  }else if(area==='in'){
    content=pane('Images and text',drop('Add files to convert','queue-picker','JPG, PNG, TXT and Markdown')+list+btn('Create PDF','from-run','in','primary',!queue.length));
    side=pane('Office documents','<p class="hint">DOCX, XLSX, PPTX and OpenDocument import uses your local LibreOffice installation. Markdown is imported as plain text.</p>'+(desktop?btn('Convert Office document','office','in','primary'):'<p class="hint"><strong>Desktop only.</strong> No cloud converter is used.</p>'));
  }else if(area==='convert'||area==='out'){
    const word=area==='out';
    content=pane('Export from PDF',a+(active?'<label class="field">Output format<select id="format">'+(word?'<option value="docx">Word (.docx) · text only</option>':'')+'<option value="txt">Plain text (.txt)</option><option value="png">Current page (.png)</option><option value="jpg">Current page (.jpg)</option></select></label>'+btn('Export','export-run','out','primary'):btn('Open a PDF to export','open-pdf','open','primary')));
    side=pane('What to expect','<p class="hint">Text and Word export use the embedded text layer. Scans need OCR, which is not included yet. Complex layouts, images and font styling are not recreated in Word.</p>');
  }else{
    content=pane('Lossless optimization',a+(active?btn('Optimize and save','compact-run','compress','primary'):btn('Open a PDF','open-pdf','open','primary'))+'<p class="hint">Rewrites PDF structure without downsampling images. If it cannot make the file smaller, no replacement is saved.</p>');
    side=pane('Your original stays intact','<p class="hint">PDF Forge exports a copy. This pass does not promise savings on already optimized documents.</p>');
  }
  return title(tools[area][0],tools[area][1]+' · Processed on this device')+'<div class="tool-page">'+content+side+'</div>';
}
function help(){return title('Help & shortcuts','The same workspace runs in your browser and the Windows app.')+
  pane('Keyboard shortcuts','<p><kbd>Ctrl O</kbd> Open · <kbd>Ctrl S</kbd> Save a copy · <kbd>Ctrl F</kbd> Find text · <kbd>Ctrl Z</kbd> Undo · <kbd>Ctrl Shift Z</kbd> Redo</p><p><kbd>←</kbd> <kbd>→</kbd> Previous / next page · <kbd>Esc</kbd> Cancel annotation</p>')+
  '<br>'+pane('Your file shelf','<p>Open EPUB or FB2 ebooks, CBZ/CBT comics, images and text documents. Pin a local copy to reopen later. Reading position is remembered per file. PDF editing and conversion remain in the PDF tools.</p>')+'<br>'+pane('What is included','<p>Read, annotate, assemble and export PDFs locally. The Sign tool creates a visual mark, not a cryptographic signature. Exports may invalidate existing digital signatures.</p><p>Existing-text reflow, OCR, redaction, encryption and layout-preserving Word export are not part of this preview.</p><p><a href="./privacy.html">Privacy and third-party notices</a></p>');}
function reader(){
  const active=pdfActive();
  if(!active)return tabStrip(null)+title(tools[area][0],tools[area][1])+drop('Open a PDF','open-pdf','Choose a file or drop it into the workspace.')+'<div class="actions">'+btn('Try the sample','sample:pdf','view')+'</div>';
  const d=active,n=d.doc.numPages,p=d.page, edit=area==='edit'||area==='sign';
  const tabs=tabStrip(d);
  const marks=edit&&!d.encrypted?btn('Add text','mark:text','edit',tool==='text'?'active':'')+btn('Highlight','mark:highlight','highlight',tool==='highlight'?'active':'')+btn('Pen','mark:ink','ink',tool==='ink'?'active':'')+btn('Signature','mark:signature','sign',tool==='signature'?'active':'')+ib('Undo','undo','undo',!d.undo.length)+ib('Redo','redo','redo',!d.redo.length):'';
  const pageOps=d.encrypted?'':ib('Rotate page','change:rotate','rotate')+ib('Move page earlier','change:up','up',p<=1)+ib('Move page later','change:down','down',p>=n)+ib('Delete page','delete-page','delete',n<=1);
  const hint=tool?'<div class="tool-hint">'+(tool==='text'||tool==='signature'?'Click the page to place your '+(tool==='text'?'text.':'visual signature.'):'Drag over the page to draw. Press Esc to exit.')+ib('Cancel placement','cancel-mark','close')+'</div>':d.encrypted?'<div class="tool-hint">Password-protected document · View and export only</div>':'';
  return tabs+title(dname(),n+' '+(n===1?'page':'pages')+' · '+size(d.raw.length)+(d.dirty?' · Unsaved edits':''),pinControl(d)+btn('Save copy','save','save','primary'))+
   '<div class="tools-shell"><div class="toolbar">'+ib('Previous page','prev','left',p<=1)+'<span class="meta" id="page-counter">'+p+' / '+n+'</span>'+ib('Next page','next','right',p>=n)+ib('Zoom out','zoom-out','minus')+btn(Math.round(zoom*100)+'%','fit','','ghost')+ib('Zoom in','zoom-in','plus')+ib('Find text','find','search')+ib('Print all pages','print','print')+(edit?'':'<span class="spacer"></span>')+pageOps+marks+'</div>'+hint+
   '<div class="viewer"><div class="thumb-list" aria-label="Pages">'+Array.from({length:n},(_,i)=>'<button class="thumb" data-action="page:'+(i+1)+'" aria-label="Page '+(i+1)+'" aria-current="'+(i+1===p)+'"><canvas data-thumb="'+(i+1)+'" aria-hidden="true"></canvas><span>'+(i+1)+'</span></button>').join('')+'</div><div class="viewport" tabindex="0" aria-label="Document viewport"><div class="canvas-wrap '+(tool==='text'||tool==='signature'?'placing':tool?'drawing':'')+'"><canvas id="pdf-page" role="img" aria-label="PDF page '+p+'"></canvas><canvas id="ink-layer" aria-hidden="true"></canvas></div></div></div><div class="read-status"><span id="read-status" role="status">Rendering page '+p+'…</span><span>Local file · No upload</span></div></div>';
}
function display(){
  chrome();token++;const stamp=token;
  if(readerJob){readerJob.cancel();readerJob=null}
  thumbsObserver?.disconnect();
  readingUrls.forEach(u=>URL.revokeObjectURL(u));readingUrls=[];
  pageView=null;drawing=null;
  const reading=['view','edit','sign'].includes(area);
  screen.innerHTML=area==='home'?home():area==='theme'?setting():area==='help'?help():area==='shelf'?shelf():area==='files'?fileReader():reading?reader():toolPage();
  if(area==='home')void samplePreview();
  if(reading&&pdfActive())void renderReader(active,stamp);
  if(area==='files'&&active&&active.format!=='pdf')void paintFile(active,stamp);
}
const fileTokens={pdf:'.pdf,application/pdf',source:'.jpg,.jpeg,.png,.txt,.md,image/jpeg,image/png,text/plain'};
let pickMode='open';
function choose(mode){pickMode=mode;picker.value='';picker.accept=mode==='open'?acceptFormats:fileTokens[mode==='source'?'source':'pdf'];picker.click();}
async function loadJS(data){
  const task=js.getDocument({data:data.slice(),cMapUrl:asset('./vendor/cmaps/'),cMapPacked:true,standardFontDataUrl:asset('./vendor/standard_fonts/'),wasmUrl:asset('./vendor/wasm/'),isEvalSupported:false,enableXfa:false});
  let encrypted=false;
  task.onPassword=(update,reason)=>{encrypted=true;if(reason===js.PasswordResponses.INCORRECT_PASSWORD)notify('That PDF password was incorrect.');void password().then(p=>p===null?task.destroy():update(p));};
  return {doc:await task.promise,encrypted};
}
function password(){return new Promise(resolve=>{modal('Unlock PDF','<label class="field">Password<input id="secret" type="password" autocomplete="off" autofocus></label>',async()=>{const p=$('#secret').value;if(!p)throw new Error('Enter the password.');resolve(p);},()=>resolve(null),'Unlock');});}
async function renderCanvas(page,canvas,scale,ratio=1){
  const viewport=page.getViewport({scale});
  canvas.width=Math.max(1,Math.round(viewport.width*ratio));canvas.height=Math.max(1,Math.round(viewport.height*ratio));
  const job=page.render({canvas,viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0],background:'#ffffff'});
  await job.promise;return viewport;
}
async function renderReader(d,stamp){
  try{
    const pg=await d.doc.getPage(d.page), canvas=$('#pdf-page'), layer=$('#ink-layer'), vp=$('.viewport');
    if(stamp!==token||!canvas||!vp)return;
    const base=pg.getViewport({scale:1}), w=Math.max(150,vp.clientWidth-(innerWidth<610?20:44));
    const viewport=pg.getViewport({scale:Math.min(1.12,w/base.width)*zoom}), ratio=Math.min(2,devicePixelRatio||1,Math.sqrt(16000000/(viewport.width*viewport.height)));
    canvas.width=layer.width=Math.round(viewport.width*ratio);canvas.height=layer.height=Math.round(viewport.height*ratio);
    canvas.style.width=layer.style.width=viewport.width+'px';canvas.style.height=layer.style.height=viewport.height+'px';
    const job=pg.render({canvas,viewport,transform:[ratio,0,0,ratio,0,0],background:'#ffffff'});readerJob=job;
    await job.promise;if(stamp!==token)return;readerJob=null;
    pageView={viewport,pg};
    const status=$('#read-status');if(status)status.textContent=query?(matches.length?'Match '+(matchIndex+1)+' of '+matches.length+' · “'+query+'”':'No text matches'):'Page '+d.page+' of '+d.doc.numPages;
    const thumbs=$('.thumb-list');
    thumbs?.querySelector('[aria-current=true]')?.scrollIntoView({block:'nearest',inline:'nearest'});
    const observer=thumbsObserver=new IntersectionObserver(items=>{for(const item of items)if(item.isIntersecting){const el=item.target;observer.unobserve(el);void d.doc.getPage(Number(el.dataset.thumb)).then(p=>stamp===token&&el.isConnected?renderCanvas(p,el,52/p.getViewport({scale:1}).width,1.25):null).catch(()=>{});}}, {root:thumbs,rootMargin:'65px'});
    for(const el of thumbs?.querySelectorAll('canvas')||[])observer.observe(el);
  }catch(e){if(stamp===token&&e.name!=='RenderingCancelledException'){const x=$('#read-status');if(x)x.textContent='Could not render this page.';console.warn(e)}}
}
function remember(d){
  recent=[{name:d.name,format:d.format,meta:size(d.originalSize)},...recent.filter(r=>r.name!==d.name)].slice(0,16);persist('recent',recent);
}
async function openOne(file, opts={}){
  if(file.size>maxFileBytes)throw new Error('This file is larger than 256 MB.');
  const name=file.name, ext=extension(name);
  if(!TYPES[ext])throw new Error(['cbr','cb7','cba','rar','7z'].includes(ext)?'Use a CBZ or CBT comic. This archive format is not supported yet.':'This file type is not supported. Open File shelf to see supported formats.');
  const raw=await pdf.bytes(file);
  if(!raw.length)throw new Error('This file is empty.');
  const next=ext==='pdf'?{...await loadJS(raw),format:'pdf',raw,undo:[],redo:[],dirty:false}:await openFormat(raw,name);
  Object.assign(next,{name,originalSize:file.size,modified:file.lastModified||0,source:file,sample:!!opts.sample,pinId:opts.pinId,page:1,scale:1.15,fit:'page'});
  next.page=Math.min(openCount(next),atProgress(next));
  docs.push(next);active=next;if(!opts.sample)remember(next);
  return next;
}
function showDoc(d,preservePDF=false){
  active=d;tool='';resetSearch();
  area=d.format!=='pdf'?'files':preservePDF&&['edit','sign','merge','convert','out','compress'].includes(area)?area:'view';
  display();
}
let importing=false;
async function openFiles(files,pdfOnly=false){
  if(!files.length||importing)return;
  importing=true;const failures=[];let result;
  try{
    for(const f of files){try{
      if(pdfOnly&&extension(f.name)!=='pdf')throw new Error('This tool takes PDFs only.');
      result=await openOne(f);
    }catch(e){failures.push(f.name+': '+(e.message||'Could not open the file.'));}}
    if(result)showDoc(result,true);
    if(failures.length)notify(failures.join(' · '));
  }finally{importing=false;}
}
async function sample(key='pdf'){
  const info=sampleFiles[key];if(!info)return;
  const [name,path]=info;
  let found=docs.find(d=>d.name===name&&d.sample);
  if(!found){const response=await fetch(asset(path));if(!response.ok)throw new Error('The sample could not load.');found=await openOne(new File([await response.blob()],name,{lastModified:1}),{sample:true});}
  showDoc(found,true);
}
async function pinFile(d){
  if(!d||d.sample||pinned(d))return;
  const id=crypto.randomUUID(), meta={id,key:docKey(d),name:d.name,format:d.format,size:d.originalSize,modified:d.modified};
  await setPin({...meta,file:d.source});d.pinId=id;pins.push(meta);display();notify('Pinned a local copy. Your original was not changed.');
}
async function openPin(meta){
  const row=await getPin(meta.id);
  if(!row?.file)throw new Error('The stored copy is no longer available.');
  const file=new File([row.file],row.name,{lastModified:row.modified,type:row.file.type});
  showDoc(await openOne(file,{pinId:row.id}));
}
const resetSearch=()=>{query='';matches=[];matchIndex=0;zoom=1;};
function go(a){tool='';if(a!=='merge'&&a!=='in'||area!==a)queue=[];area=a;queueKind=a==='in'?'source':'pdf';display();}
function navPage(p){if(!active)return;active.page=Math.max(1,Math.min(p,openCount(active)));setProgress(active);tool='';display();}
function modal(title,inner,run,cancel=()=>{},label='Continue'){
  if(dlg.open)dlg.close();
  dlg.innerHTML='<form class="dlg"><div class="panel-head"><h2 id="dialog-title">'+title+'</h2></div>'+inner+'<p class="error" role="alert"></p><div class="actions"><button class="btn primary" type="submit">'+label+'</button>'+btn('Cancel','dialog-cancel','','ghost')+'</div></form>';
  let done=false;
  dlg.addEventListener('close',()=>{if(!done)cancel();},{once:true});
  dlg.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter||dlg.querySelector('[type=submit]');b.disabled=true;try{await run();done=true;dlg.close()}catch(err){const x=dlg.querySelector('.error');if(x)x.textContent=err.message||'The operation could not finish.';b.disabled=false;}});
  dlg.showModal();
}
async function save(data,name, mime='application/pdf'){
  if(desktop)return await desktop.save(name,new Uint8Array(data));
  const u=URL.createObjectURL(new Blob([data],{type:mime}));const a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);return true;
}
async function saved(data,name,mime,msg){if(await save(data,name,mime))notify(msg||'Saved '+name);}
async function updateDoc(newBytes,page=active.page,d=active){
  const r=await loadJS(newBytes), old=d.doc;
  d.raw=newBytes;d.doc=r.doc;d.encrypted=r.encrypted;d.page=Math.min(page,r.doc.numPages);d.dirty=true;
  query='';matches=[];matchIndex=0;
  void old.destroy().catch(()=>{});
  display();
}
async function mutate(fn,page=active.page){
  const d=active;if(d.encrypted)throw new Error('Encrypted PDFs are read-only in this version.');
  const previous={raw:d.raw,page:d.page}, result=await fn(d.raw);
  if(result===d.raw)return;
  await updateDoc(result,page,d); d.undo.push(previous); if(d.undo.length>12)d.undo.shift();d.redo=[];display();
}
async function historyChange(direction){const d=active, from=d?.[direction];if(!from?.length)return;const next=from.at(-1);const prev={raw:d.raw,page:d.page};await updateDoc(next.raw,next.page,d);from.pop();d[direction==='undo'?'redo':'undo'].push(prev);display();}
async function textPages(doc){
  const pages=[];for(let i=1;i<=doc.numPages;i++){
    const content=await (await doc.getPage(i)).getTextContent();let text='';
    for(const item of content.items)if('str' in item)text+=item.str+(item.hasEOL?'\n':' ');
    pages.push(text.trim());
  }return pages;
}
const closeDoc=i=>{
  const old=docs[i];if(!old)return;
  const remove=()=>{
    docs.splice(i,1);
    if(old===active){
      active=docs[Math.min(i,docs.length-1)]||null;
      if(active)showDoc(active);else{resetSearch();tool='';go('files');}
    }else display();
    if(old.doc)void old.doc.destroy().catch(()=>{});
  };
  if(old.dirty)modal('Discard unsaved edits?','<p>Close '+esc(old.name)+' without saving this copy?</p>',async()=>remove(),undefined,'Discard and close');else remove();
};
async function runPrint(){
  const d=active, zone=$('#print-zone');zone.replaceChildren();document.body.classList.add('printing');notify('Preparing '+d.doc.numPages+' pages for printing…');
  try{for(let i=1;i<=d.doc.numPages;i++){const can=document.createElement('canvas');zone.append(can);await renderCanvas(await d.doc.getPage(i),can,1.45);}
    if(desktop)await desktop.print();else window.print();
  }finally{document.body.classList.remove('printing');zone.replaceChildren()}
}
function addToQueue(files){
  queue.push(...files.filter(f=>queueKind==='pdf'?/\.pdf$/i.test(f.name):/\.(png|jpe?g|txt|md)$/i.test(f.name)));
  if(!files.length||!files.some(f=>queueKind==='pdf'?/\.pdf$/i.test(f.name):/\.(png|jpe?g|txt|md)$/i.test(f.name)))notify('No supported files were added.');
  display();
}
function point(e,cv){const r=cv.getBoundingClientRect();return [Math.max(0,Math.min(r.width,e.clientX-r.left)),Math.max(0,Math.min(r.height,e.clientY-r.top))];}
function pdfPoint(p,view){const [x,y]=view.convertToPdfPoint(...p);return {x,y};}
function find(){
  if(!active){notify('Open a PDF first.');return;}
  modal('Find in document','<label class="field">Searchable text<input id="find-box" maxlength="150" value="'+esc(query)+'" autofocus placeholder="Type a word or phrase"></label>',async()=>{
    query=$('#find-box').value.trim();if(!query)throw new Error('Enter text to find.');
    const needle=query.toLocaleLowerCase(), pp=await textPages(active.doc);matches=[];
    pp.forEach((p,i)=>{if(p.toLocaleLowerCase().includes(needle))matches.push(i+1);});
    matchIndex=0;if(matches.length)navPage(matches[0]);else display();
    if(matches.length>1)notify(matches.length+' matching pages. Use F3 and Shift+F3 to move between them.');
  },undefined,'Find');
}
async function route(a,x){
  switch(a){
    case 'home':case 'theme':case 'help':case 'shelf':go(a);break;
    case 'files':if(active)showDoc(active);else go('files');break;
    case 'open-pdf':choose('open-pdf');break;
    case 'filter':shelfFilter=x;display();screen.querySelector('[data-action="filter:'+x+'"]')?.focus();break;
    case 'pin':await pinFile(docs[Number(x)]);break;
    case 'pin-open':await openPin(pins[Number(x)]);break;
    case 'unpin':{const item=pins[Number(x)];if(!item)return;modal('Remove pinned copy?','<p>Remove the shelf copy of '+esc(item.name)+'? The original file is not changed.</p>',async()=>{await removePin(item.id);pins=pins.filter(p=>p.id!==item.id);display();},undefined,'Remove copy');break;}
    case 'item':navPage(+x);break;
    case 'item-prev':navPage(active.page-1);break;
    case 'item-next':navPage(active.page+1);break;
    case 'reader-size':active.scale=Math.round(Math.max(.85,Math.min(2,active.scale+(x==='up'?.15:-.15)))*100)/100;display();break;
    case 'route':go(x);if(x==='sign'&&pdfActive()&&!active.encrypted)await route('mark','signature');break;
    case 'open':choose('open');break;
    case 'sample':await sample(x||'pdf');break;
    case 'clear-recent':recent=[];persist('recent',recent);display();break;
    case 'recent':{const item=recent[Number(x)], d=docs.find(v=>v.name===item?.name);if(d){showDoc(d);}else{notify('Choose the file again to reopen it.');choose('open');}break;}
    case 'mode':case 'palette':case 'density':prefs[a]=x;appearance();display();screen.querySelector('[data-action="'+a+':'+x+'"]')?.focus();break;
    case 'reset-theme':prefs={mode:'dark',palette:'ember',density:'comfortable'};appearance();display();break;
    case 'tab':{const d=docs[Number(x)];if(d)showDoc(d,true);break;}
    case 'close-tab':closeDoc(Number(x));break;
    case 'next':navPage(active.page+1);break;
    case 'prev':navPage(active.page-1);break;
    case 'page':navPage(+x);break;
    case 'zoom-in':case 'zoom-out':zoom=Math.max(.4,Math.min(3,+(zoom+(a==='zoom-in'?.15:-.15)).toFixed(2)));display();break;
    case 'fit':zoom=1;display();break;
    case 'find':find();break;
    case 'save':{const d=active;if(!d)return;if(await save(d.raw,pdf.baseName(d.name)+(d.dirty?'-edited':'-copy')+'.pdf')){d.dirty=false;display();notify('Saved a copy.');}break;}
    case 'undo':case 'redo':if(active)await historyChange(a);break;
    case 'print':await runPrint();break;
    case 'mark':
      if(x==='text'||x==='signature'){
        modal(x==='text'?'Add text':'Add a visual signature','<p class="hint">'+(x==='signature'?'This adds a typed mark. It does not digitally sign or verify the document.':'Adds a new text layer. Existing paragraphs are unchanged.')+'</p><label class="field">'+(x==='text'?'Text':'Name')+'<input id="mark-text" maxlength="180" autofocus></label>',async()=>{draft=$('#mark-text').value.trim();if(!draft)throw new Error('Enter something to place on the page.');tool=x;display();},undefined,'Place on page');
      }else{tool=tool===x?'':x;display();}break;
    case 'cancel-mark':tool='';display();break;
    case 'change':{const at=active.page-1;await mutate(data=>pdf.changePage(data,at,x),active.page+(x==='up'?-1:x==='down'?1:0));break;}
    case 'delete-page':{const at=active.page-1;modal('Delete page '+active.page+'?','<p>This removes the page in your working copy. You can undo it in Edit PDFs.</p>',async()=>{await mutate(d=>pdf.changePage(d,at,'delete'));notify('Page removed.');},undefined,'Delete page');break;}
    case 'queue-picker':choose(queueKind);break;
    case 'queue-current':addToQueue([new File([active.raw],active.name,{type:'application/pdf'})]);break;
    case 'queue-up':case 'queue-down':{const i=Number(x),j=i+(a==='queue-up'?-1:1);if(j>=0&&j<queue.length)[queue[i],queue[j]]=[queue[j],queue[i]];display();break;}
    case 'queue-remove':queue.splice(+x,1);display();break;
    case 'merge-run':{const out=await pdf.merge(await Promise.all(queue.map(pdf.bytes)));await saved(out,'merged.pdf');break;}
    case 'extract-run':{const ix=pdf.pageRange($('#range').value,active.doc.numPages), data=await pdf.extract(active.raw,ix);await saved(data,pdf.baseName(active.name)+'-pages.pdf');break;}
    case 'from-run':{const data=await pdf.fromFiles(queue);await saved(data,pdf.baseName(queue[0].name)+(queue.length>1?'-combined':'')+'.pdf');break;}
    case 'office':{const result=await desktop.office();if(result)notify(result);break;}
    case 'compact-run':{const b=await pdf.compact(active.raw);if(b.length>=active.raw.length){notify('No size reduction available without changing quality.');break;}await saved(b,pdf.baseName(active.name)+'-optimized.pdf',undefined,'Saved '+size(b.length)+' · '+Math.round((1-b.length/active.raw.length)*100)+'% smaller.');break;}
    case 'export-run':{
      const d=active, stem=pdf.baseName(d.name),f=$('#format').value;
      if(f==='png'||f==='jpg'){
        const can=document.createElement('canvas'), type=f==='png'?'image/png':'image/jpeg',p=await d.doc.getPage(d.page), at=p.getViewport({scale:1});
        await renderCanvas(p,can,Math.min(2,Math.sqrt(16000000/(at.width*at.height))));const b=await new Promise(r=>can.toBlob(r,type,.92));if(!b)throw new Error('This page could not be exported as an image.');await saved(new Uint8Array(await b.arrayBuffer()),stem+'-page-'+d.page+'.'+f,type);
      }else{
        const pp=await textPages(d.doc);if(!pp.some(Boolean))throw new Error('This PDF has no embedded text. Scan OCR is not available yet.');
        if(f==='docx')await saved(await pdf.textDocx(pp),stem+'-text.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        else await saved(new TextEncoder().encode(pp.join('\n\n\f\n\n')),stem+'.txt','text/plain');
      }break;}
    case 'dialog-cancel':dlg.close();break;
  }
}
async function act(a,x,el){
  if(a==='dialog-cancel'){dlg.close();return}
  if(busy)return;
  busy=true;if(el)el.setAttribute('aria-busy','true');
  try{await route(a,x);}catch(e){notify(e.message||'Something went wrong.');}finally{busy=false;if(el)el.removeAttribute('aria-busy');}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b&&!b.disabled){const [a,x]=b.dataset.action.split(':');void act(a,x,b);}});
picker.addEventListener('change',async()=>{const fs=[...picker.files];if(!fs.length)return;if(pickMode==='open'||pickMode==='open-pdf')await openFiles(fs,pickMode==='open-pdf');else addToQueue(fs);});
screen.addEventListener('input',e=>{if(e.target.id==='shelf-search'){shelfQuery=e.target.value;$('#shelf-rows').innerHTML=shelfRows();}});
screen.addEventListener('change',e=>{
  if(e.target.id==='shelf-sort'){shelfSort=e.target.value;$('#shelf-rows').innerHTML=shelfRows();}
  if(e.target.id==='reader-jump')navPage(Number(e.target.value));
  if(e.target.id==='reader-fit'&&active){active.fit=e.target.value;display();}
});
for(const t of ['dragenter','dragover','dragleave','drop'])document.addEventListener(t,e=>{
  if(!e.dataTransfer?.types.includes('Files'))return;e.preventDefault();if(t==='dragenter')dragDepth++;
  if(t==='dragleave')dragDepth=Math.max(0,dragDepth-1);
  if(t==='drop'){dragDepth=0;if(['merge','in'].includes(area))addToQueue([...e.dataTransfer.files]);else void openFiles([...e.dataTransfer.files]);}
  document.body.classList.toggle('dragging',dragDepth>0);
});
document.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
  if(dlg.open)return;
  if(e.target.matches('.book-link')&&['enter',' '].includes(k)){e.preventDefault();e.target.click();return;}
  if(mod&&(k==='o'||(pdfActive()&&['s','f','z','p'].includes(k)))){
    if(k==='z'&&e.target.matches('input,textarea'))return;
    e.preventDefault();const a={o:'open',s:'save',f:'find',z:e.shiftKey?'redo':'undo',p:'print'}[k];if(k==='o'||active)void act(a);
  }else if(k==='f3'&&active&&matches.length){e.preventDefault();matchIndex=(matchIndex+(e.shiftKey?-1:1)+matches.length)%matches.length;navPage(matches[matchIndex]);}
  else if(k==='escape'&&tool)void act('cancel-mark');
  else if(active&&['view','edit','sign','files'].includes(area)&&['arrowleft','arrowright'].includes(k)&&!e.target.matches('input,textarea,select')){e.preventDefault();navPage(active.page+(k==='arrowleft'?-1:1));}
});
screen.addEventListener('pointerdown',e=>{
  const layer=e.target;if(!tool||layer.id!=='ink-layer'||!pageView||!active||e.button!==0||busy)return;
  const p=point(e,layer), view=pageView.viewport, n=active.page-1;
  if(tool==='text'||tool==='signature'){
    const mark={kind:tool,text:draft,...pdfPoint(p,view),size:tool==='signature'?23:15};
    tool='';busy=true;void mutate(data=>pdf.addMark(data,n,mark)).then(()=>notify('Added to your working copy.')).catch(e=>notify(e.message)).finally(()=>{busy=false;});
  }else{layer.setPointerCapture(e.pointerId);drawing={layer,points:[p],kind:tool,id:e.pointerId,view,n};}
});
screen.addEventListener('pointermove',e=>{
  if(!drawing||drawing.id!==e.pointerId)return;
  const {layer,points,kind}=drawing,p=point(e,layer),prev=points.at(-1),r=layer.getBoundingClientRect(),c=layer.getContext('2d');
  if(Math.hypot(p[0]-prev[0],p[1]-prev[1])<2)return;
  c.setTransform(layer.width/r.width,0,0,layer.height/r.height,0,0);c.strokeStyle=kind==='highlight'?'#f6bc4552':'#142852';c.lineWidth=kind==='highlight'?12:2;c.lineCap='round';c.beginPath();c.moveTo(...prev);c.lineTo(...p);c.stroke();points.push(p);
});
screen.addEventListener('pointerup',e=>{
  if(!drawing||drawing.id!==e.pointerId)return;const d=drawing;drawing=null;
  if(d.points.length<2)return;busy=true;
  void mutate(data=>pdf.addMark(data,d.n,{kind:d.kind,points:d.points.map(p=>pdfPoint(p,d.view))})).catch(e=>notify(e.message)).finally(()=>{busy=false;});
});
screen.addEventListener('pointercancel',()=>{if(drawing){drawing=null;display()}});
let resizeTimer;
window.addEventListener('resize',()=>{if(active&&['view','edit','sign'].includes(area)){clearTimeout(resizeTimer);resizeTimer=setTimeout(display,130);}});
display();
void listPins().then(data=>{pins=data;if(['shelf','view','files'].includes(area))display();}).catch(()=>{});
