import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../app',import.meta.url));
const type={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.ico':'image/x-icon','.png':'image/png','.webp':'image/webp','.wasm':'application/wasm','.pdf':'application/pdf','.md':'text/plain','.txt':'text/plain'};
createServer(async(req,res)=>{
  try{
    const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/\/$/,'/index.html'));
    if(!file.startsWith(root+sep)||!(await stat(file)).isFile())throw new Error();
    res.writeHead(200,{'Content-Type':type[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});
    createReadStream(file).pipe(res);
  }catch{res.writeHead(404).end('Not found');}
}).listen(Number(process.env.PORT||4173),'127.0.0.1',function(){console.log('PDF Forge → http://127.0.0.1:'+this.address().port);});
