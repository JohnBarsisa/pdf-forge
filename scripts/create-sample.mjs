import {PDFDocument,StandardFonts,rgb} from '../app/vendor/pdf-lib.mjs';
import {writeFile} from 'node:fs/promises';
const doc=await PDFDocument.create();
doc.setTitle('Summit Field Notes');
doc.setAuthor('PDF Forge');
const serif=await doc.embedFont(StandardFonts.TimesRomanBold),sans=await doc.embedFont(StandardFonts.Helvetica);
const ink=rgb(.15,.13,.16), muted=rgb(.40,.32,.33), ember=rgb(.77,.25,.13), clay=rgb(.96,.89,.84);
const words=[['Summit','Field Notes','A short report from the north ridge.','River Basin Survey / 2026'],['Trail','Observations','Terrain, shelter and the weather window.','Field Report / Day Two'],['Route','Checklist','Things to verify before the next ascent.','Field Report / Appendix']];
function line(p,a,b,c,d,color,thickness=1){p.drawLine({start:{x:a,y:b},end:{x:c,y:d},color,thickness})}
for(let i=0;i<words.length;i++){
 const p=doc.addPage([612,792]), [top,bottom,sub,tag]=words[i];
 p.drawRectangle({x:0,y:0,width:612,height:792,color:rgb(.99,.97,.93)});
 p.drawRectangle({x:39,y:733,width:39,height:3,color:ember});
 p.drawText('SUMMIT JOURNAL  /  0'+(i+1),{x:39,y:710,size:10,font:sans,color:ember});
 p.drawText(top,{x:39,y:643,size:47,font:serif,color:ink});
 p.drawText(bottom,{x:39,y:595,size:47,font:serif,color:ink});
 p.drawText(sub,{x:39,y:556,size:12,font:sans,color:muted});
 p.drawRectangle({x:353,y:529,width:221,height:201,color:clay});
 p.drawCircle({x:510,y:676,size:28,color:rgb(.93,.57,.35)});
 p.drawSvgPath('M0 129 L67 42 L99 86 L150 19 L221 129 Z',{x:353,y:652,color:rgb(.52,.25,.25)});
 p.drawSvgPath('M0 112 L54 55 L84 80 L127 43 L221 112 Z',{x:353,y:641,color:rgb(.25,.20,.25)});
 p.drawText(tag,{x:39,y:465,size:13,font:serif,color:ink});
 line(p,39,450,574,450,rgb(.84,.75,.72));
 const lines=[
  'Clear skies opened a short window above the northern valley.',
  'The summit route was dry, with scattered loose stone near the saddle.',
  'We marked two shelters and a second descent route on the ridge.',
  'Use these notes to try search, highlighting and page organization.'
 ];
 for(let j=0;j<lines.length;j++)p.drawText(lines[j],{x:39,y:418-j*25,size:12,font:sans,color:muted});
 line(p,39,63,574,63,rgb(.84,.75,.72));
 p.drawText('PDF FORGE  /  SAMPLE DOCUMENT',{x:39,y:42,size:9,font:sans,color:ember});
 p.drawText((i+1)+' / '+words.length,{x:549,y:42,size:9,font:sans,color:muted});
}
await writeFile(new URL('../app/art/summit-field-notes.pdf',import.meta.url),await doc.save());
