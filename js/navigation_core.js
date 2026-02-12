// js/navigation_core.js
// BUILD: v12.8.0-v2only
//
// Dual-axis navigation core (Spaces + Journals) — V2 ONLY.
//
// PURE module: no DOM, no UI.
//
// Space node v2:
//   { id, title, parentId|null, childCount, createdAt }
// Journal node v2:
//   { id, title, templateId, parentId, spaceId, childCount, createdAt }
//
// Provides:
// - buildSpaceAxisModelV2(spaceNodes, spacePath)
// - buildJournalAxisModelV2(journalNodes, journalPath, spaceId)
// - loadNavMemory(), saveNavLocation(), pushNavHistory()

import { cfgGet, cfgSet } from "./db_nav.js";

var KEY_LAST_LOC = "nav_last_loc_v2";
var KEY_HISTORY  = "nav_history_v2";
var MAX_HISTORY = 100;

function _clampHistory(arr){
  if(!Array.isArray(arr)) return [];
  if(arr.length <= MAX_HISTORY) return arr;
  return arr.slice(arr.length - MAX_HISTORY);
}

function _byCreatedThenTitle(a,b){
  var ac = (a && a.createdAt) ? (a.createdAt|0) : 0;
  var bc = (b && b.createdAt) ? (b.createdAt|0) : 0;
  if(ac !== bc) return ac - bc;
  var at = String((a && (a.title||""))||"");
  var bt = String((b && (b.title||""))||"");
  return at.localeCompare(bt);
}

function _indexAmongSiblings(nodes, node){
  if(!node) return 1;
  var pid = (node.parentId==null) ? null : String(node.parentId);
  var sibs = nodes.filter(function(n){
    if(!n) return false;
    var np = (n.parentId==null) ? null : String(n.parentId);
    return np === pid;
  });
  sibs.sort(_byCreatedThenTitle);
  for(var i=0;i<sibs.length;i++){
    if(sibs[i] && sibs[i].id === node.id) return i+1;
  }
  return 1;
}

function _spaceNumPath(spaceNodes, spaceId){
  var byId = {};
  for(var i=0;i<(spaceNodes||[]).length;i++){
    var n = spaceNodes[i];
    if(n) byId[n.id]=n;
  }
  var out = [];
  var guard = {};
  var cur = byId[spaceId] || null;
  while(cur && !guard[cur.id]){
    guard[cur.id]=1;
    out.unshift(_indexAmongSiblings(spaceNodes, cur));
    if(cur.parentId==null) break;
    cur = byId[String(cur.parentId)] || null;
  }
  return out;
}

function _journalNumPath(journalNodesForSpace, journalId, spaceId){
  spaceId = String(spaceId||"");
  var byId = {};
  for(var i=0;i<(journalNodesForSpace||[]).length;i++){
    var n = journalNodesForSpace[i];
    if(n) byId[n.id]=n;
  }
  var out = [];
  var guard = {};
  var cur = byId[journalId] || null;
  while(cur && !guard[cur.id]){
    guard[cur.id]=1;
    // index among siblings inside SAME parent
    var pid = String(cur.parentId);
    var sibs = journalNodesForSpace.filter(function(n){
      return n && String(n.parentId) === pid;
    });
    sibs.sort(_byCreatedThenTitle);
    var idx = 1;
    for(var k=0;k<sibs.length;k++){
      if(sibs[k] && sibs[k].id === cur.id){ idx=k+1; break; }
    }
    out.unshift(idx);
    if(String(cur.parentId) === spaceId) break; // level-1 reached
    cur = byId[String(cur.parentId)] || null;
  }
  return out;
}

function _formatNumPath(nums){
  if(!Array.isArray(nums) || !nums.length) return "";
  return nums.join(".") + ".";
}

export function buildSpaceAxisModelV2(spaceNodes, spacePath){
  var all = (spaceNodes||[]).filter(Boolean);
  var path = Array.isArray(spacePath) ? spacePath.slice() : [];
  var activeId = path.length ? path[path.length-1] : null;

  var byId = {};
  for(var i=0;i<all.length;i++) byId[all[i].id]=all[i];

  if(!activeId){
    var roots = all.filter(function(n){ return n && (n.parentId==null); });
    roots.sort(_byCreatedThenTitle);
    if(roots[0]){
      activeId = roots[0].id;
      path = [activeId];
    }
  }

  var active = activeId ? (byId[activeId]||null) : null;
  var parentId = active ? (active.parentId==null?null:String(active.parentId)) : null;

  var siblings = all.filter(function(n){
    var p = (n.parentId==null)?null:String(n.parentId);
    return p === parentId;
  });
  siblings.sort(_byCreatedThenTitle);

  var children = all.filter(function(n){
    return n && String(n.parentId||"") === String(activeId||"");
  });
  children.sort(_byCreatedThenTitle);

  var num = activeId ? _spaceNumPath(all, activeId) : [];
  var label = (_formatNumPath(num) ? (_formatNumPath(num)+" ") : "") + (active ? (active.title||"Простір") : "Простір");

  return {
    path: path,
    activeId: activeId,
    canGoPrev: path.length>1,
    parentPath: (path.length>1) ? path.slice(0, path.length-1) : path.slice(),
    current: { id: activeId, label: label, parentId: parentId },
    siblings: siblings.map(function(n){
      var nn = _spaceNumPath(all, n.id);
      return { id:n.id, label: (_formatNumPath(nn)?(_formatNumPath(nn)+" "):"") + (n.title||"Простір") };
    }),
    childrenCount: children.length,
    children: children.map(function(n){
      var nn = _spaceNumPath(all, n.id);
      return { id:n.id, label: (_formatNumPath(nn)?(_formatNumPath(nn)+" "):"") + (n.title||"Простір") };
    })
  };
}

export function buildJournalAxisModelV2(journalNodes, journalPath, spaceId){
  spaceId = String(spaceId||"");
  var all = (journalNodes||[]).filter(function(n){ return n && String(n.spaceId)===spaceId; });
  all.sort(_byCreatedThenTitle);

  var path = Array.isArray(journalPath) ? journalPath.slice() : [];
  var activeId = path.length ? path[path.length-1] : null;

  var byId = {};
  for(var i=0;i<all.length;i++) byId[all[i].id]=all[i];

  if(!activeId){
    var lvl1 = all.filter(function(n){ return String(n.parentId)===spaceId; });
    lvl1.sort(_byCreatedThenTitle);
    if(lvl1[0]){
      activeId = lvl1[0].id;
      path = [activeId];
    }
  }

  var active = activeId ? (byId[activeId]||null) : null;
  var isLevel1 = !!(active && String(active.parentId)===spaceId);
  var parentId = active ? String(active.parentId) : null;

  var siblings = all.filter(function(n){
    return n && String(n.parentId) === String(parentId);
  });
  siblings.sort(_byCreatedThenTitle);

  var children = all.filter(function(n){
    return n && String(n.parentId) === String(activeId||"");
  });
  children.sort(_byCreatedThenTitle);

  var num = activeId ? _journalNumPath(all, activeId, spaceId) : [];
  var label = (_formatNumPath(num) ? (_formatNumPath(num)+" ") : "") + (active ? (active.title||"Журнал") : "Журнал");

  return {
    path: path,
    activeId: activeId,
    canGoPrev: !isLevel1 && path.length>1,
    parentPath: (path.length>1) ? path.slice(0, path.length-1) : path.slice(),
    current: { id: activeId, label: label, parentId: parentId },
    siblings: siblings.map(function(n){
      var nn = _journalNumPath(all, n.id, spaceId);
      return { id:n.id, label: (_formatNumPath(nn)?(_formatNumPath(nn)+" "):"") + (n.title||"Журнал") };
    }),
    childrenCount: children.length,
    children: children.map(function(n){
      var nn = _journalNumPath(all, n.id, spaceId);
      return { id:n.id, label: (_formatNumPath(nn)?(_formatNumPath(nn)+" "):"") + (n.title||"Журнал") };
    }),
    isLevel1: isLevel1
  };
}

export function loadNavMemory(){
  return Promise.all([cfgGet(KEY_LAST_LOC), cfgGet(KEY_HISTORY)]).then(function(res){
    return { last: res[0] || null, history: _clampHistory(res[1]) };
  });
}

export function saveNavLocation(loc){
  return cfgSet(KEY_LAST_LOC, loc || null);
}

export function pushNavHistory(step){
  return cfgGet(KEY_HISTORY).then(function(h){
    if(!Array.isArray(h)) h = [];
    h.push(step);
    return cfgSet(KEY_HISTORY, _clampHistory(h));
  });
}
