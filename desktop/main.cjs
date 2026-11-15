const {app,BrowserWindow,Menu,dialog,ipcMain,protocol,session,net}=require('electron');
const {join,normalize,sep,extname,basename}=require('node:path');
const {pathToFileURL}=require('node:url');
const {access,mkdtemp,readdir,rm,writeFile,copyFile}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const base='forge://workspace';
const resource=join(__dirname,'../app');
let win;
protocol.registerSchemesAsPrivileged([{scheme:'forge',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,codeCache:true}}]);
function verify(e){if(e.sender!==win?.webContents || e.senderFrame?.url!==base+'/index.html')throw new Error('Not an application request.');}
const extensions={pdf:'PDF document',txt:'Plain text',docx:'Word document',png:'PNG image',jpg:'JPEG image'};
async function saveTarget(name,ext){
 const result=await dialog.showSaveDialog(win,{title:'Save a copy',defaultPath:name,filters:[{name:extensions[ext],extensions:[ext]}]});
 return result.canceled?null:result.filePath;
}
async function libreOffice(){
 const list=process.platform==='win32'?[process.env.ProgramFiles,process.env['ProgramFiles(x86)']].filter(Boolean).map(p=>join(p,'LibreOffice','program','soffice.com')):process.platform==='darwin'?['/Applications/LibreOffice.app/Contents/MacOS/soffice']:['/usr/bin/libreoffice','/usr/bin/soffice'];
 for(const candidate of list){try{await access(candidate);return candidate}catch{}}
 return null;
}
function create(){
 win=new BrowserWindow({title:'PDF Forge',width:1360,height:920,minWidth:560,minHeight:520,backgroundColor:'#17161a',icon:join(resource,'art/icon.png'),autoHideMenuBar:true,webPreferences:{preload:join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(e,url)=>{
   if(![base+'/index.html',base+'/privacy.html',base+'/'].includes(url))e.preventDefault();
 });
 const marker=process.env.PDF_FORGE_SMOKE_MARKER;
 if (marker) {
  win.webContents.once('did-finish-load',async()=>{
   try {
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const until=async(predicate)=>{
       for(let attempt=0;attempt<100;attempt++){const value=predicate();if(value)return value;await new Promise(r=>setTimeout(r,120));}
       throw new Error('Timed out waiting for the document workspace');
      };
      const sample=await until(()=>document.querySelector('.banner [data-action=sample]'));
      sample.click();
      return until(()=>{
       const canvas=document.querySelector('#pdf-page');
       const status=document.querySelector('#read-status')?.textContent;
       return canvas?.width>400&&status==='Page 1 of 3'&&canvas.getContext('2d').getImageData(4,4,1,1).data[3]===255&&status;
      });
    })()`);
    await writeFile(marker,result);
   }catch(error){await writeFile(marker,'FAILED: '+error.message);}
  });
 }
 win.loadURL(base+'/index.html');
}
app.whenReady().then(()=>{
 app.setAppUserModelId('com.johnbarsisa.pdfforge');
 Menu.setApplicationMenu(null);
 session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
 session.defaultSession.setPermissionCheckHandler(()=>false);
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,cb)=>cb({cancel:true}));
 protocol.handle('forge',request=>{
   const u=new URL(request.url);
   if(u.hostname!=='workspace'||request.method!=='GET')return new Response(null,{status:404});
   let filename;
   try{filename=normalize(join(resource,decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname)));}catch{return new Response(null,{status:400})}
   if(!filename.startsWith(resource+sep))return new Response(null,{status:404});
   return net.fetch(pathToFileURL(filename).href);
 });
 ipcMain.handle('forge:save',async(e,name,data)=>{
   verify(e);
   const ext=typeof name==='string'?extname(name).slice(1).toLowerCase():'';
   if(!Object.hasOwn(extensions,ext)||!(data instanceof Uint8Array))throw new Error('Invalid export.');
   const sanitized=basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(-175);
   const target=await saveTarget(sanitized,ext);
   if(!target)return false;
   await writeFile(target,data);return true;
 });
 ipcMain.handle('forge:print',e=>{verify(e);return new Promise((resolve,reject)=>win.webContents.print({printBackground:true},(ok,why)=>ok||why==='Print job canceled'?resolve(ok):reject(new Error(why||'Printing failed.'))));});
 ipcMain.handle('forge:office',async e=>{
  verify(e);
  const command=await libreOffice();if(!command)throw new Error('Install LibreOffice from libreoffice.org to enable Office-to-PDF conversion.');
  const choice=await dialog.showOpenDialog(win,{title:'Choose an Office document',properties:['openFile'],filters:[{name:'Office documents',extensions:['docx','xlsx','pptx','odt','ods','odp']} ]});
  if(choice.canceled)return '';
  const input=choice.filePaths[0];
  if(!/\.(docx|xlsx|pptx|odt|ods|odp)$/i.test(input))throw new Error('This Office file type is not supported.');
  const temp=await mkdtemp(join(tmpdir(),'pdf-forge-'));
  try{
    await exec(command,['-env:UserInstallation='+pathToFileURL(join(temp,'profile')).href,'--headless','--convert-to','pdf','--outdir',temp,input],{timeout:90000,windowsHide:true,maxBuffer:1048576});
    const output=(await readdir(temp)).find(f=>f.toLowerCase().endsWith('.pdf'));
    if(!output)throw new Error('LibreOffice did not create a PDF.');
    const dest=await saveTarget(output,'pdf'); if(!dest)return '';
    await copyFile(join(temp,output),dest);return 'Saved '+basename(dest);
  }finally{await rm(temp,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{});}
 });
 create();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)create()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
