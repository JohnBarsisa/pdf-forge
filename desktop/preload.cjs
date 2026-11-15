const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('forgeDesktop',Object.freeze({
  save:(name,bytes)=>ipcRenderer.invoke('forge:save',name,bytes),
  print:()=>ipcRenderer.invoke('forge:print'),
  office:()=>ipcRenderer.invoke('forge:office')
}));
