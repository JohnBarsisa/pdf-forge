// Only files explicitly pinned to the shelf are persisted.
let connection;
function db(){
  if(!connection)connection=new Promise((ok,fail)=>{
    if(!globalThis.indexedDB){fail(new Error('Local file storage is not available.'));return;}
    const req=indexedDB.open('pdf-forge-shelf',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('files',{keyPath:'id'});
    req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();connection=null;};ok(req.result);};
    req.onerror=()=>{connection=null;fail(req.error);};
  });
  return connection;
}
async function request(mode,make){
  const store=await db();
  return new Promise((ok,fail)=>{
    const tx=store.transaction('files',mode), req=make(tx.objectStore('files'));
    tx.oncomplete=()=>ok(req.result);
    tx.onabort=tx.onerror=()=>fail(tx.error||req.error||new Error('Could not access your local shelf.'));
  });
}
export function listPins(){
  // A cursor collects metadata without retaining all blobs in memory.
  return db().then(store=>new Promise((ok,fail)=>{
    const tx=store.transaction('files','readonly'), req=tx.objectStore('files').openCursor(), list=[];
    req.onsuccess=()=>{const c=req.result;if(c){const {file,...meta}=c.value;list.push(meta);c.continue();}};
    tx.oncomplete=()=>ok(list);
    tx.onabort=tx.onerror=()=>fail(tx.error||new Error('Could not list the shelf.'));
  }));
}
export const getPin=id=>request('readonly',s=>s.get(id));
export const setPin=data=>request('readwrite',s=>s.put(data));
export const removePin=id=>request('readwrite',s=>s.delete(id));
