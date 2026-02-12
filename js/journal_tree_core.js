// js/journal_tree_core.js
// Journals tree core (no UI, no navigation).
//
// Journal node fields:
//   { id, title, templateId, parentId, spaceId, childCount }
//
// Rules:
// - A journal whose parentId === spaceId is a "level-1 journal" for that space.
// - Each journal can have unlimited subjournals (children).
// - childCount increments/decrements when creating/deleting subjournals.
//
// ES5-safe: no async/await.

import { cfgGet, cfgSet } from "./db_nav.js";

var KEY_JOURNALS = "journals_nodes_v2";

function _now(){ return Date.now(); }
function _id(){ return "J_" + String(_now()) + "_" + String(Math.floor(Math.random()*1e9)); }
function _title(t){
  t = (t == null) ? "" : String(t);
  t = t.trim();
  return t || "Без назви";
}

function _load(){
  return cfgGet(KEY_JOURNALS).then(function(v){
    if(v && Array.isArray(v)) return v;
    return [];
  });
}

function _save(nodes){
  return cfgSet(KEY_JOURNALS, nodes);
}

function _idx(nodes, id){
  for(var i=0;i<nodes.length;i++) if(nodes[i] && nodes[i].id===id) return i;
  return -1;
}

function listJournals(){
  return _load().then(function(nodes){ return nodes.slice(); });
}

function getJournal(id){
  return _load().then(function(nodes){
    var i=_idx(nodes,id);
    return i>=0 ? nodes[i] : null;
  });
}

function listChildren(parentId){
  return _load().then(function(nodes){
    return nodes.filter(function(n){ return n && n.parentId===parentId; });
  });
}

function listLevel1(spaceId){
  spaceId = String(spaceId);
  return _load().then(function(nodes){
    return nodes.filter(function(n){ return n && n.spaceId===spaceId && n.parentId===spaceId; });
  });
}

function createRootJournal(spaceId, templateId, title){
  if(!spaceId) return Promise.reject(new Error("spaceId required"));
  spaceId = String(spaceId);
  templateId = String(templateId||"");
  return _load().then(function(nodes){
    var node={
      id:_id(),
      title:_title(title),
      templateId:templateId,
      parentId:spaceId,
      spaceId:spaceId,
      childCount:0,
      createdAt:_now()
    };
    nodes.push(node);
    return _save(nodes).then(function(){ return node; });
  });
}

function createSubjournal(parentJournalId, templateId, title){
  if(!parentJournalId) return Promise.reject(new Error("parentJournalId required"));
  templateId = String(templateId||"");
  return _load().then(function(nodes){
    var pi=_idx(nodes, parentJournalId);
    if(pi<0) throw new Error("parent journal not found");
    var p = nodes[pi];
    var node={
      id:_id(),
      title:_title(title),
      templateId:templateId,
      parentId:String(parentJournalId),
      spaceId:String(p.spaceId),
      childCount:0,
      createdAt:_now()
    };
    nodes.push(node);
    nodes[pi].childCount = (nodes[pi].childCount|0)+1;
    return _save(nodes).then(function(){ return node; });
  });
}

function deleteJournal(id){
  return _load().then(function(nodes){
    var i=_idx(nodes,id);
    if(i<0) return false;
    if((nodes[i].childCount|0)>0) throw new Error("has children");
    var parentId = nodes[i].parentId;
    nodes.splice(i,1);
    // If parent is another journal, decrement its childCount.
    // If parent is a spaceId, this is a level-1 journal; space childCount is not tracked here.
    if(parentId && String(parentId).indexOf("J_")===0){
      var pi=_idx(nodes,parentId);
      if(pi>=0) nodes[pi].childCount = Math.max(0,(nodes[pi].childCount|0)-1);
    }
    return _save(nodes).then(function(){ return true; });
  });
}

function deleteJournalSubtree(id){
  return _load().then(function(nodes){
    var rootIdx=_idx(nodes,id);
    if(rootIdx<0) return false;
    // collect subtree ids
    var childrenMap = {};
    nodes.forEach(function(n){
      var pid = n.parentId;
      if(!pid) return;
      if(!childrenMap[pid]) childrenMap[pid]=[];
      childrenMap[pid].push(n.id);
    });
    var toDel = {};
    function walk(cur){
      toDel[cur]=true;
      var ch = childrenMap[cur]||[];
      for(var i=0;i<ch.length;i++) walk(ch[i]);
    }
    walk(id);

    // remove nodes in subtree
    var kept = [];
    for(var i=0;i<nodes.length;i++){
      if(!toDel[nodes[i].id]) kept.push(nodes[i]);
    }

    // recompute childCount for journal parents
    var counts = {};
    kept.forEach(function(n){
      var pid = n.parentId;
      if(pid && String(pid).indexOf("J_")===0){
        counts[pid]=(counts[pid]||0)+1;
      }
    });
    kept.forEach(function(n){
      n.childCount = counts[n.id]||0;
    });

    return _save(kept).then(function(){ return true; });
  });
}


function deleteJournalsForSpaces(spaceIds){
  var set = new Set(spaceIds||[]);
  return _load().then(function(nodes){
    var kept = nodes.filter(function(n){ return n && !set.has(n.spaceId); });

    // recompute childCount for kept nodes
    var childCount = {};
    kept.forEach(function(n){ childCount[n.id]=0; });
    kept.forEach(function(n){
      if(n.parentId!=null && childCount[n.parentId]!=null) childCount[n.parentId]+=1;
    });
    kept = kept.map(function(n){ return Object.assign({}, n, { childCount: childCount[n.id]||0 }); });

    return cfgSet(KEY_JOURNALS, kept).then(function(){ return true; });
  });
}

export var JournalTreeCore = {
  KEY_JOURNALS: KEY_JOURNALS,
  listJournals: listJournals,
  getJournal: getJournal,
  listChildren: listChildren,
  listLevel1: listLevel1,
  createRootJournal: createRootJournal,
  createSubjournal: createSubjournal,
  deleteJournal: deleteJournal,
  deleteJournalSubtree: deleteJournalSubtree,
  deleteJournalsForSpaces: deleteJournalsForSpaces
};
