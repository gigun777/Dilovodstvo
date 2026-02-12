// js/spaces_tree_core.js
// Spaces tree core (no UI, no navigation).
//
// Space node fields:
//   { id, title, parentId|null, childCount }
// Root spaces have parentId = null.
// childCount increments/decrements on create/delete.

import { cfgGet, cfgSet } from "./db_nav.js";

var KEY_SPACES = "spaces_nodes_v2";

function _now(){ return Date.now(); }
function _id(){ return "S_" + String(_now()) + "_" + String(Math.floor(Math.random()*1e9)); }
function _title(t){
  t = (t == null) ? "" : String(t);
  t = t.trim();
  return t || "Без назви";
}

function _load(){
  return cfgGet(KEY_SPACES).then(function(v){
    if(v && Array.isArray(v)) return v;
    return [];
  });
}

function _save(nodes){
  return cfgSet(KEY_SPACES, nodes);
}

function _idx(nodes, id){
  for(var i=0;i<nodes.length;i++) if(nodes[i] && nodes[i].id===id) return i;
  return -1;
}

function listSpaces(){
  return _load().then(function(nodes){ return nodes.slice(); });
}

function getSpace(id){
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

function listRoots(){
  return _load().then(function(nodes){
    return nodes.filter(function(n){ return n && !n.parentId; });
  });
}

function createRootSpace(title){
  return _load().then(function(nodes){
    var node={ id:_id(), title:_title(title), parentId:null, childCount:0, createdAt:_now() };
    nodes.push(node);
    return _save(nodes).then(function(){ return node; });
  });
}

function createSubspace(parentId, title){
  if(!parentId) return Promise.reject(new Error("parentId required"));
  return _load().then(function(nodes){
    var pi=_idx(nodes,parentId);
    if(pi<0) throw new Error("parent not found");
    var node={ id:_id(), title:_title(title), parentId:String(parentId), childCount:0, createdAt:_now() };
    nodes.push(node);
    nodes[pi].childCount = (nodes[pi].childCount|0)+1;
    return _save(nodes).then(function(){ return node; });
  });
}

function deleteSpace(id){
  return _load().then(function(nodes){
    var i=_idx(nodes,id);
    if(i<0) return false;
    if((nodes[i].childCount|0)>0) throw new Error("has children");
    var parentId = nodes[i].parentId;
    nodes.splice(i,1);
    if(parentId){
      var pi=_idx(nodes,parentId);
      if(pi>=0) nodes[pi].childCount = Math.max(0,(nodes[pi].childCount|0)-1);
    }
    return _save(nodes).then(function(){ return true; });
  });
}


function deleteSpaceSubtree(rootId){
  return _load().then(function(nodes){
    var byParent = {};
    nodes.forEach(function(n){
      if(!n) return;
      var pid = (n.parentId==null ? "__root__" : n.parentId);
      (byParent[pid]||(byParent[pid]=[])).push(n.id);
    });

    var toDelete = new Set();
    var stack = [rootId];
    while(stack.length){
      var id = stack.pop();
      if(toDelete.has(id)) continue;
      toDelete.add(id);
      var kids = byParent[id] || [];
      for(var i=0;i<kids.length;i++) stack.push(kids[i]);
    }

    // filter remaining
    var kept = nodes.filter(function(n){ return n && !toDelete.has(n.id); });

    // recompute childCount for kept nodes
    var childCount = {};
    kept.forEach(function(n){ childCount[n.id]=0; });
    kept.forEach(function(n){
      if(n.parentId!=null && childCount[n.parentId]!=null) childCount[n.parentId] += 1;
    });
    kept = kept.map(function(n){
      return Object.assign({}, n, { childCount: childCount[n.id]||0 });
    });

    return cfgSet(KEY_SPACES, kept).then(function(){
      return Array.from(toDelete);
    });
  });
}

export var SpacesTreeCore = {
  KEY_SPACES: KEY_SPACES,
  listSpaces: listSpaces,
  getSpace: getSpace,
  listChildren: listChildren,
  listRoots: listRoots,
  createRootSpace: createRootSpace,
  createSubspace: createSubspace,
  deleteSpace: deleteSpace,
  deleteSpaceSubtree: deleteSpaceSubtree
};
