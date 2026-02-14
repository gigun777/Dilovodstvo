// js/db_nav.js
// BUILD: navi2.0
//
// Navigation DB adapter (V2-only).
// Responsible ONLY for persistence used by navigation + Space/Journal tree cores:
// - IndexedDB open
// - cfgGet/cfgSet (key/value) in store "config"
//
// This file is intentionally minimal and independent from other app data (rows/cases/etc).

const DB_NAME = "dilovodstvoDB_modular";
const DB_VERSION = 1;

export let navdb = null;

function _store(mode){
  if(!navdb) throw new Error("navdb is not open. Call openNavDB() first.");
  return navdb.transaction("config", mode).objectStore("config");
}

export function openNavDB(){
  if(navdb) return Promise.resolve(navdb);
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if(!db.objectStoreNames.contains("config")){
        db.createObjectStore("config", { keyPath: "key" });
      }
    };
    req.onsuccess = ()=>{
      navdb = req.result;
      resolve(navdb);
    };
    req.onerror = ()=>reject(req.error);
  });
}

export function cfgGet(key){
  key = String(key||"");
  return new Promise((resolve, reject)=>{
    try{
      const st = _store("readonly");
      const r = st.get(key);
      r.onsuccess = ()=>resolve(r.result ? r.result.value : null);
      r.onerror = ()=>reject(r.error);
    }catch(e){ reject(e); }
  });
}

export function cfgSet(key, value){
  key = String(key||"");
  return new Promise((resolve, reject)=>{
    try{
      const st = _store("readwrite");
      const r = st.put({ key, value });
      r.onsuccess = ()=>resolve(true);
      r.onerror = ()=>reject(r.error);
    }catch(e){ reject(e); }
  });
}
