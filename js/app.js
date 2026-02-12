// js/app.js
// BUILD: navi2.0
//
// Navigation-only bootstrap (V2 only):
// app.js -> ui_core.js -> navigation_core.js -> journal_tree_core.js -> spaces_tree_core.js -> db_nav.js
//
// This build intentionally strips ALL non-navigation app features (tables, export, settings, transfer, backup, cases, rows).

import { openNavDB, cfgGet, cfgSet } from "./db_nav.js";
import { SpacesTreeCore } from "./spaces_tree_core.js";
import { JournalTreeCore } from "./journal_tree_core.js";
import { loadNavMemory, saveNavLocation, pushNavHistory } from "./navigation_core.js";
import { UiCore } from "./ui_core.js";
import { listJournalTemplates, getTemplateById } from "./journal_store.js";

const KEY_VIEW = "view_v2_navonly";

const state = {
  spaceNodes: [],
  journalNodes: [],
  spacePath: [],
  journalPath: [],
  spaceId: null
};

let _uiInited = false;

async function ensureDefaults(){
  // Create at least one root space if none exists.
  const roots = await SpacesTreeCore.listRoots();
  if(!roots || !roots.length){
    await SpacesTreeCore.createRootSpace("Простір 1");
  }
}

async function loadSnapshot(){
  state.spaceNodes = await SpacesTreeCore.listSpaces();
  const roots = await SpacesTreeCore.listRoots();

  // ensure we have a valid current space
  if(!Array.isArray(state.spacePath)) state.spacePath = [];
  // drop invalid ids
  const spaceById = new Map((state.spaceNodes||[]).map(n=>[String(n.id), n]));
  state.spacePath = state.spacePath.filter(id=>spaceById.has(String(id)));

  if(!state.spacePath.length){
    if(roots && roots[0]) state.spacePath = [roots[0].id];
  }else{
    // If last id is invalid, reset to first root.
    const lastId = String(state.spacePath[state.spacePath.length-1]);
    if(!spaceById.has(lastId)){
      state.spacePath = (roots && roots[0]) ? [roots[0].id] : [];
    }
  }

  state.spaceId = state.spacePath.length ? state.spacePath[state.spacePath.length-1] : (roots && roots[0] ? roots[0].id : null);

  state.journalNodes = await JournalTreeCore.listJournals();

  // normalize journalPath: keep only ids that exist in current space
  if(!Array.isArray(state.journalPath)) state.journalPath = [];
  const journalsInSpace = (state.journalNodes||[]).filter(j=>j && String(j.spaceId)===String(state.spaceId||""));
  const journalById = new Map(journalsInSpace.map(j=>[String(j.id), j]));
  state.journalPath = state.journalPath.filter(id=>journalById.has(String(id)));

  // IMPORTANT: if there are zero journals in this space — keep journalPath empty
  // (UI shows 'Додай журнал'). If journals exist but path empty — let UI/core pick first.
}

async function saveView(){
  await cfgSet(KEY_VIEW, { spacePath: state.spacePath, journalPath: state.journalPath });
}

async function loadView(){
  const v = await cfgGet(KEY_VIEW);
  if(v && Array.isArray(v.spacePath)) state.spacePath = v.spacePath.slice();
  if(v && Array.isArray(v.journalPath)) state.journalPath = v.journalPath.slice();
}

async function navCommit(mutator){
  await mutator();
  await saveView();
  try{
    await saveNavLocation({ spacePath: state.spacePath, journalPath: state.journalPath });
    await pushNavHistory({ t: Date.now(), spacePath: state.spacePath, journalPath: state.journalPath });
  }catch(_e){}
  await renderAll();
}

function getTemplates(){
  return listJournalTemplates();
}

async function renderAll(){
  await loadSnapshot(); // ensure freshest view after any mutation

  const api = {
    getTemplates: ()=>listJournalTemplates(),

    onGoSpacePath: (path)=>navCommit(async ()=>{
      state.spacePath = Array.isArray(path) ? path.slice() : [];
      state.spaceId = state.spacePath.length ? state.spacePath[state.spacePath.length-1] : null;
      // when switching space, do not auto-create journals
      state.journalPath = [];
    }),

    onGoJournalPath: (path)=>navCommit(async ()=>{
      state.journalPath = Array.isArray(path) ? path.slice() : [];
    }),

    onCreateSiblingSpace: (parentId, title)=>navCommit(async ()=>{
      const name = String(title||"").trim() || "Новий простір";
      if(parentId==null || parentId===""){
        const s = await SpacesTreeCore.createRootSpace(name);
        state.spacePath = [s.id];
        state.spaceId = s.id;
        state.journalPath = [];
      }else{
        const s = await SpacesTreeCore.createSubspace(parentId, name);
        // enter it on the same level
        const pidx = state.spacePath.indexOf(parentId);
        if(pidx>=0){
          state.spacePath = state.spacePath.slice(0, pidx+1).concat([s.id]);
        }else{
          state.spacePath = [s.id];
        }
        state.spaceId = s.id;
        state.journalPath = [];
      }
    }),

    onCreateChildSpace: (parentId, title)=>navCommit(async ()=>{
      const pid = String(parentId||"");
      const name = String(title||"").trim() || "Новий підпростір";
      if(!pid) return;
      const s = await SpacesTreeCore.createSubspace(pid, name);
      // enter child
      state.spacePath = (state.spacePath||[]).concat([s.id]);
      state.spaceId = s.id;
      state.journalPath = [];
    }),

    onDeleteSpaceSubtree: (spaceId)=>navCommit(async ()=>{
      const deletedIds = await SpacesTreeCore.deleteSpaceSubtree(spaceId);
      if(deletedIds && deletedIds.length){
        await JournalTreeCore.deleteJournalsForSpaces(deletedIds);
      }
      // reset selection (LevelModel will reselect on snapshot load)
      state.spacePath = [];
      state.spaceId = null;
      state.journalPath = [];
    }),

    onCreateLevelJournal: (spaceId, parentId, templateId, indexValue)=>navCommit(async ()=>{
      const tpl = getTemplateById(templateId);
      const baseTitle = tpl ? tpl.title : "Журнал";
      const idx = (indexValue!=null && String(indexValue).trim()) ? String(indexValue).trim() : "";
      const title = idx ? (baseTitle + " ("+idx+")") : baseTitle;

      const sid = String(spaceId||state.spaceId||"");
      const pid = String(parentId||"");

      // parentId === spaceId => level-1 journal in this space
      if(pid === sid){
        const j = await JournalTreeCore.createRootJournal(sid, templateId, title);
        state.journalPath = [j.id];
      }else{
        // add journal under parentId (same level inside that parent)
        const j = await JournalTreeCore.createSubjournal(pid, templateId, title);
        const pidx = (state.journalPath||[]).indexOf(pid);
        if(pidx>=0){
          state.journalPath = state.journalPath.slice(0, pidx+1).concat([j.id]);
        }else{
          state.journalPath = [j.id];
        }
      }
    }),

    onCreateChildJournal: (activeJournalId, templateId, indexValue)=>navCommit(async ()=>{
      const tpl = getTemplateById(templateId);
      const baseTitle = tpl ? tpl.title : "Журнал";
      const idx = (indexValue!=null && String(indexValue).trim()) ? String(indexValue).trim() : "";
      const title = idx ? (baseTitle + " ("+idx+")") : baseTitle;

      const pid = String(activeJournalId||"");
      if(!pid){
        // no active journal: create level-1 in current space
        const sid = String(state.spaceId||"");
        if(!sid) return;
        const j = await JournalTreeCore.createRootJournal(sid, templateId, title);
        state.journalPath = [j.id];
        return;
      }
      const j = await JournalTreeCore.createSubjournal(pid, templateId, title);
      state.journalPath = (state.journalPath||[]).concat([j.id]);
    }),

    onDeleteJournalSubtree: (journalId)=>navCommit(async ()=>{
      await JournalTreeCore.deleteJournalSubtree(journalId);
      state.journalPath = [];
    })
  };

  if(!_uiInited){
    UiCore.init(()=>state, api);
    _uiInited = true;
  }
  UiCore.render();
}


async function start(){
  try{
    await openNavDB();
    await ensureDefaults();
    await loadView();

    // nav memory restore (optional)
    try{
      const mem = await loadNavMemory();
      if(mem && Array.isArray(mem.spacePath) && mem.spacePath.length) state.spacePath = mem.spacePath.slice();
      if(mem && Array.isArray(mem.journalPath)) state.journalPath = mem.journalPath.slice();
    }catch(_e){}

    await renderAll();
  }catch(e){
    console.error(e);
    alert("Помилка запуску навігації: " + (e && e.message ? e.message : e));
  }
}

start();
