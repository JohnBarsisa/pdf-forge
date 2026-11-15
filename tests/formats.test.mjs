import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {openFormat,openTar,resolveMember,zipIndex} from '../app/formats.mjs';
const require=createRequire(import.meta.url);
const ZIP=globalThis.JSZip=require(process.env.PDF_FORGE_MODULES?process.env.PDF_FORGE_MODULES+'/jszip':'jszip');
const sample=async name=>new Uint8Array(await readFile(new URL('../app/art/'+name,import.meta.url)));
test('EPUB asset contains its manifest, navigation, ordered spine and local artwork',async()=>{
  const data=await sample('lantern-ridge.epub'), index=zipIndex(data);
  assert.ok(index.has('META-INF/container.xml'));
  assert.ok(index.has('Book/art/ridge.jpg'));
  const x=await ZIP.loadAsync(data);
  assert.match(await x.file('Book/book.opf').async('string'),/<itemref idref="ch1"\/><itemref idref="ch2"\/><itemref idref="ch3"\/>/);
  assert.equal(resolveMember('Book/text/ch1.xhtml','../art/ridge.jpg'),'Book/art/ridge.jpg');
  assert.equal(resolveMember('Book/text/ch1.xhtml','ch2.xhtml#here'),'Book/text/ch2.xhtml');
  for(const href of ['../../../escape','https://example.com/p.jpg','//example.com/p.jpg','..%5csecret','%3Afoo'])assert.equal(resolveMember('Book/text/ch1.xhtml',href),null);
});
test('CBZ loads real page images in natural order',async()=>{
  const d=await openFormat(await sample('signal-at-dusk.cbz'),'sample.cbz');
  assert.deepEqual(d.groups.map(x=>x.path),['Pages/page-1.jpg','Pages/page-2.jpg','Pages/page-10.jpg']);
  const bytes=await d.arc.read(d.groups[1].path);
  assert.deepEqual([...bytes.slice(0,3)],[255,216,255]);
});
test('ZIP preview rejects unsafe paths, corruption and forged expanded size',async()=>{
  const data=await sample('signal-at-dusk.cbz');
  const bad=new ZIP();bad.file('../evil.jpg','x');
  await assert.rejects(()=>bad.generateAsync({type:'uint8array'}).then(x=>openFormat(x,'test.cbz')),/unsafe/);
  await assert.rejects(()=>openFormat(data.subarray(0,100),'test.cbz'),/valid ZIP/);
  const altered=data.slice(), dv=new DataView(altered.buffer), e=altered.length-22, start=dv.getUint32(e+16,true);
  dv.setUint32(start+24,0,true);
  await assert.rejects(()=>openFormat(altered,'test.cbz'),/Unexpected expanded archive size/);
});
test('ordinary USTAR pages load without writing any files',async()=>{
  const bytes=new Uint8Array(2048), header=bytes.subarray(0,512), e=new TextEncoder();
  const set=(at,s)=>header.set(e.encode(s),at);
  set(0,'Page-1.png');set(124,'00000000003\0');set(148,'        ');set(156,'0');set(257,'ustar\0');
  const sum=header.reduce((a,b)=>a+b,0);set(148,sum.toString(8).padStart(6,'0')+'\0 ');
  bytes.set([1,2,3],512);
  const r=openTar(bytes);
  assert.deepEqual(r.names,['Page-1.png']);assert.deepEqual([...await r.read('Page-1.png')],[1,2,3]);
  bytes[0]=1;assert.throws(()=>openTar(bytes),/damaged/);
});
test('text files are previewable without interpreting markup',async()=>{
  const model=await openFormat(new TextEncoder().encode('<script>alert("test")</script>'),'text.md');
  assert.equal(model.groups[0].text,'<script>alert("test")</script>');
  await assert.rejects(()=>openFormat(new Uint8Array([1]),'not-yet.cbr'),/not supported/);
});
