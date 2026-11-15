import { PDFDocument, StandardFonts, rgb, degrees } from './vendor/pdf-lib.mjs';

export const baseName = (s) => s.replace(/\.[^.]+$/, '');
export const bytes = async (file) => new Uint8Array(await file.arrayBuffer());
const pdf = (data) => PDFDocument.load(data, { updateMetadata:false });
const prepared = (doc) => doc.save({ useObjectStreams: true, updateFieldAppearances: false });
const ascii = (s) => s.replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/[^\t\n\r\x20-\x7e\xa0-\xff]/gu,'?');

export function pageRange(value, total) {
  if (!Number.isInteger(total) || total < 1 || !value.trim()) throw new Error('Enter a page range, for example 1, 3–5.');
  const indexes = [];
  for (const chunk of value.trim().split(',')) {
    const m = chunk.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!m) throw new Error('Use page numbers or ranges separated by commas, for example 1, 3–5.');
    const start = Number(m[1]), end = Number(m[2] || m[1]);
    if (start < 1 || end > total || end < start) throw new Error('Use ascending ranges within pages 1–' + total + '.');
    if(indexes.length + end-start+1 > Math.max(total*2,1000)) throw new Error('The resulting range contains too many pages.');
    for (let i=start;i<=end;i++) indexes.push(i-1);
  }
  return indexes;
}
export async function merge(inputs) {
  if (inputs.length < 2) throw new Error('Add at least two PDFs.');
  const out=await PDFDocument.create();
  for(const source of inputs){const d=await pdf(source);(await out.copyPages(d,d.getPageIndices())).forEach(p=>out.addPage(p));}
  return prepared(out);
}
export async function extract(data,indexes) {
  const orig=await pdf(data), out=await PDFDocument.create();
  (await out.copyPages(orig,indexes)).forEach(p=>out.addPage(p));
  return prepared(out);
}
export async function changePage(data, index, action) {
  const doc=await pdf(data), page=doc.getPage(index), n=doc.getPageCount();
  if(action==='rotate') page.setRotation(degrees((page.getRotation().angle+90)%360));
  if(action==='delete') { if(n<=1)throw new Error('A PDF needs at least one page.');doc.removePage(index); }
  if(action==='up' || action==='down'){
    const to=index+(action==='up'?-1:1);
    if(to<0 || to>=n) return data;
    doc.removePage(index); doc.insertPage(to,page);
  }
  return prepared(doc);
}
export async function addMark(data,index,mark) {
  const doc=await pdf(data), page=doc.getPage(index);
  if(mark.kind==='ink' || mark.kind==='highlight'){
    const color=mark.kind==='highlight'?rgb(1,.76,.16):rgb(.08,.16,.32);
    for(let i=1;i<mark.points.length;i++){
      const a=mark.points[i-1],b=mark.points[i];
      if(a.x!==b.x || a.y!==b.y)page.drawLine({start:a,end:b,color,thickness:mark.kind==='highlight'?13:2,opacity:mark.kind==='highlight'?.30:1});
    }
  }else{
    const font=await doc.embedFont(mark.kind==='signature'?StandardFonts.TimesRomanItalic:StandardFonts.Helvetica);
    const raw=ascii(mark.text).replace(/[\r\t]/g,' ').trim();
    if (!raw) throw new Error('Enter text first.');
    page.drawText(raw,{x:mark.x,y:mark.y,size:mark.size || 15,font,color:mark.kind==='signature'?rgb(.09,.18,.38):rgb(.1,.1,.13),rotate:degrees(page.getRotation().angle), lineHeight:(mark.size||15)+3});
  }
  return prepared(doc);
}
export async function compact(data) {
  const result=await prepared(await pdf(data));
  return result.length < data.length ? result : data;
}
export async function fromFiles(files) {
  const doc=await PDFDocument.create(), font=await doc.embedFont(StandardFonts.Helvetica);
  for(const f of files){
    if(/\.(png|jpe?g)$/i.test(f.name)){
      const image=await (/\.png$/i.test(f.name)?doc.embedPng(await bytes(f)):doc.embedJpg(await bytes(f)));
      const landscape=image.width>image.height;
      const page=doc.addPage(landscape?[792,612]:[612,792]);
      const {width,height}=page.getSize(), s=Math.min((width-64)/image.width,(height-64)/image.height);
      page.drawImage(image,{x:(width-image.width*s)/2,y:(height-image.height*s)/2,width:image.width*s,height:image.height*s});
    } else if (/\.(txt|md)$/i.test(f.name)) {
      let page=doc.addPage([612,792]), y=744;
      for(const line of ascii(await f.text()).replace(/\r\n?/g,'\n').replace(/\t/g,'    ').split('\n')){
        let segment='';
        for(const c of line){
          if(segment && font.widthOfTextAtSize(segment+c,11)>516){if(y<45){page=doc.addPage([612,792]);y=744;}page.drawText(segment,{x:48,y,font,size:11});y-=16;segment='';}
          segment+=c;
        }
        if(y<45){page=doc.addPage([612,792]);y=744;}
        if(segment)page.drawText(segment,{x:48,y,font,size:11});
        y-=16;
      }
    } else throw new Error('Use JPG, PNG, TXT or Markdown, or choose the desktop Office converter.');
  }
  if(!doc.getPageCount())throw new Error('Add a file to convert.');
  return prepared(doc);
}
const escapeXML=(s)=>s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export async function textDocx(pages) {
  const zip=new globalThis.JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const body=pages.map(p=>p.split('\n').map(l=>'<w:p><w:r><w:t xml:space="preserve">'+escapeXML(l)+'</w:t></w:r></w:p>').join('')).join('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  zip.file('word/document.xml','<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>');
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
