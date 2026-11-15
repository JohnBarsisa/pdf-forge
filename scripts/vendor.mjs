import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const dep=process.env.PDF_FORGE_MODULES || join(root,'node_modules');
const out=join(root,'app','vendor');
mkdirSync(out,{recursive:true});
const items={
  'pdfjs-dist/build/pdf.min.mjs':'pdf.min.mjs',
  'pdfjs-dist/build/pdf.worker.min.mjs':'pdf.worker.min.mjs',
  'pdfjs-dist/LICENSE':'pdfjs-LICENSE.txt',
  'pdfjs-dist/cmaps':'cmaps',
  'pdfjs-dist/standard_fonts':'standard_fonts',
  'pdfjs-dist/wasm':'wasm',
  'pdf-lib/dist/pdf-lib.esm.min.js':'pdf-lib.mjs',
  'pdf-lib/LICENSE.md':'pdf-lib-LICENSE.md',
  'jszip/dist/jszip.min.js':'jszip.min.js',
  'jszip/LICENSE.markdown':'jszip-LICENSE.markdown',
};
for (const [from,to] of Object.entries(items)) {
  const source=join(dep,from);
  if (!existsSync(source)) throw new Error('Missing '+from+'. Run npm install first.');
  cpSync(source,join(out,to),{recursive:true});
}
