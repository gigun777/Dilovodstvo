// js/ui_core.js
// BUILD: v12.8.0-v2only
//
// Navigation UI core (V2 only).
//
// Responsibilities:
// - Render dual-axis nav controls into existing DOM containers:
//     #subspaceChain, #btnAddSubspace
//     #subjournalChain, #btnAddSubjournal
// - Open picker windows for container buttons (search + list + last row "+ add on this level").
// - Open create dialogs:
//     Space: name
//     Journal: template + optional index
//
// Does NOT own data persistence or heavy app rendering.
// App provides callbacks for mutations and a state getter.

import { $, el, btn, modalOpen } from "./ui.js";
import { buildSpaceAxisModelV2, buildJournalAxisModelV2 } from "./navigation_core.js";

function norm(v){ return String(v==null?"":v).toLowerCase().trim(); }

function _confirmDigitDelete(label){
  var digit = Math.floor(Math.random()*10);
  var msg = el("div", { className:"muted" },
    el("div", { textContent: "Підтвердіть видалення: " + label }),
    el("div", { style:"margin-top:8px;font-size:18px;" , textContent: "Введіть цифру: " + digit })
  );
  var inp = el("input", { className:"input", placeholder:"Цифра", value:"", inputMode:"numeric" });
  return modalOpen({
    title: "Видалення",
    bodyNodes: [msg, inp],
    actions: [
      btn("Ні", "no", "btn btn-ghost"),
      btn("Так", "yes", "btn")
    ]
  }).then(function(r){
    if(!r || r.type!=="yes") return false;
    var v = String(inp.value||"").trim();
    if(v !== String(digit)){
      return modalOpen({
        title: "Невірна цифра",
        bodyNodes: [el("div",{textContent:"Цифра введена невірно. Видалення скасовано."})],
        actions:[btn("OK","ok","btn")]
      }).then(function(){ return false; });
    }
    return true;
  });
}

function _mkNavBtn(text, title, cls){
  var b = document.createElement("button");
  b.className = cls || "btn";
  b.textContent = text;
  if(title) b.title = title;
  return b;
}

function _openPicker(opts){
  // opts: { title, items:[{id,label}], addLabel, onAdd():Promise, onPick(id):Promise }
  var items = (opts.items||[]).slice();
  var q = "";
  var input = el("input", { className:"input", placeholder:"Пошук…", value:"" });
  var list = el("div", { className:"list" });

  function render(){
    list.innerHTML = "";
    var qq = norm(q);
    var filtered = items.filter(function(it){
      return !qq || norm(it.label).indexOf(qq)>=0;
    });
    filtered.forEach(function(it){
      var row = el("button", { className:"list-item", type:"button" }, it.label);
      row.onclick = function(){ close({type:"pick", id: it.id}); };
      list.appendChild(row);
    });
    // last row: add on this level
    var addRow = el("button", { className:"list-item list-item-add", type:"button" }, "＋ " + (opts.addLabel||"Додати"));
    addRow.onclick = function(){ close({type:"add"}); };
    list.appendChild(addRow);
  }

  var _resolve = null;
  function close(res){ if(_resolve) _resolve(res); }

  input.oninput = function(){ q = input.value; render(); };

  render();

  return modalOpen({
    title: opts.title || "Вибір",
    bodyNodes: [ input, list ],
    actions: [ btn("Закрити","cancel","btn") ]
  }).then(function(r){
    // modalOpen resolves when action clicked or backdrop; we handle internal close by resolving promise ourselves.
    // But modalOpen doesn't expose close; so we emulate by reopening? -> instead we'll use actions-less modal and rely on backdrop?
    return r;
  });
}

// We can't programmatically close modalOpen from inside list row using the current ui.js API.
// Therefore, we implement picker using a custom lightweight overlay.
function _openPickerOverlay(opts){
  var backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.style.display = "flex";

  var modal = document.createElement("div");
  modal.className = "modal";
  modal.setAttribute("role","dialog");
  modal.setAttribute("aria-modal","true");

  var head = el("div", { className:"modal-head" },
    el("h3", { textContent: opts.title || "Вибір" }),
    (function(){
      var x = _mkNavBtn("✕", "Закрити", "btn btn-ghost");
      x.onclick = function(){ done({type:"cancel"}); };
      return x;
    })()
  );

  var input = el("input", { className:"input", placeholder:"Пошук…", value:"" });
  var list = el("div", { className:"list" });

  var items = (opts.items||[]).slice();
  var q = "";

  function render(){
    list.innerHTML = "";
    var qq = norm(q);
    var filtered = items.filter(function(it){ return !qq || norm(it.label).indexOf(qq)>=0; });
    filtered.forEach(function(it){
  if(opts.onDelete){
    var wrap = el("div", { className:"list-row" });
    var row = el("button", { className:"list-item", type:"button" }, it.label);
    row.onclick = function(){ done({type:"pick", id: it.id}); };
    var del = _mkNavBtn("🗑", "Видалити", "btn btn-ghost btn-del");
    del.onclick = function(e){
      e.preventDefault(); e.stopPropagation();
      Promise.resolve()
        .then(function(){ return _confirmDigitDelete(it.label); })
        .then(function(ok){
          if(!ok) return;
          return Promise.resolve(opts.onDelete(it.id)).then(function(){
            // remove deleted item from local list
            items = items.filter(function(x){ return x.id!==it.id; });
            render();
          });
        })
        .catch(console.error);
    };
    wrap.appendChild(row);
    wrap.appendChild(del);
    list.appendChild(wrap);
  }else{
    var row = el("button", { className:"list-item", type:"button" }, it.label);
    row.onclick = function(){ done({type:"pick", id: it.id}); };
    list.appendChild(row);
  }
});
    var addRow = el("button", { className:"list-item list-item-add", type:"button" }, "＋ " + (opts.addLabel||"Додати"));
    addRow.onclick = function(){ done({type:"add"}); };
    list.appendChild(addRow);
  }

  input.oninput = function(){ q = input.value; render(); };

  var body = el("div", { className:"modal-body" }, input, list);

  modal.appendChild(head);
  modal.appendChild(body);
  backdrop.appendChild(modal);

  function cleanup(){
    try{ document.body.removeChild(backdrop); }catch(_e){}
  }

  function done(res){
    cleanup();
    if(res && res.type==="pick") return Promise.resolve(opts.onPick && opts.onPick(res.id)).then(function(){ return res; });
    if(res && res.type==="add") return Promise.resolve(opts.onAdd && opts.onAdd()).then(function(){ return res; });
    return Promise.resolve(res||{type:"cancel"});
  }

  render();
  backdrop.onclick = function(e){ if(e.target===backdrop) done({type:"cancel"}); };

  document.body.appendChild(backdrop);
  return new Promise(function(resolve){
    // patch done to resolve
    var _done = done;
    done = function(res){ _done(res).then(resolve); };
  });
}

function _openCreateSpace(opts){
  var input = el("input", { className:"input", placeholder:"Назва простору…", value:"" });
  return modalOpen({
    title: opts.title || "Створити простір",
    bodyNodes: [ input ],
    actions: [
      btn("Скасувати","cancel","btn"),
      btn("Створити","ok","btn btn-primary")
    ]
  }).then(function(r){
    if(!r || r.type!=="ok") return null;
    var t = String(input.value||"").trim();
    return t ? t : null;
  });
}

function _openCreateJournal(opts){
  // opts.templates: [{id,title}]
  var templates = (opts.templates||[]).slice();
  var tSelect = el("select", { className:"select" });
  templates.forEach(function(t){
    tSelect.appendChild(el("option", { value:t.id, textContent: t.title }));
  });
  var idxInput = el("input", { className:"input", placeholder:"Індекс (необов’язково)…", value:"" });

  return modalOpen({
    title: opts.title || "Створити журнал",
    bodyNodes: [
      el("div", {}, el("div", { className:"muted", textContent:"Шаблон" }), tSelect),
      el("div", { style:"height:10px" }),
      el("div", {}, el("div", { className:"muted", textContent:"Індекс (необов’язково)" }), idxInput)
    ],
    actions: [
      btn("Скасувати","cancel","btn"),
      btn("Створити","ok","btn btn-primary")
    ]
  }).then(function(r){
    if(!r || r.type!=="ok") return null;
    var templateId = String(tSelect.value||"");
    var index = String(idxInput.value||"").trim();
    return { templateId: templateId, index: index };
  });
}

function createUiCore(){
  var _getState = null;
  var _api = null;

  var subspaceChain = null;
  var subjournalChain = null;
  var btnAddSubspace = null;
  var btnAddSubjournal = null;

  function init(getState, api){
    _getState = getState;
    _api = api || {};
    subspaceChain = $("#subspaceChain");
    subjournalChain = $("#subjournalChain");
    btnAddSubspace = $("#btnAddSubspace");
    btnAddSubjournal = $("#btnAddSubjournal");

    if(btnAddSubspace){
      btnAddSubspace.onclick = function(e){
  e.preventDefault(); e.stopPropagation();
  var st = _getState && _getState();
  if(!st) return;

  var spaceModel = buildSpaceAxisModelV2(st.spaceNodes||[], st.spacePath||[]);
  var parentId = spaceModel && spaceModel.activeId ? String(spaceModel.activeId) : null;
  if(!parentId) return;

  Promise.resolve()
    .then(function(){
      return _openCreateSpace({ title: "Створити підпростір" });
    })
    .then(function(title){
      if(!title) return;
      if(_api.onCreateChildSpace) return _api.onCreateChildSpace(parentId, title);
    })
    .catch(console.error);
};
    }
    if(btnAddSubjournal){
      btnAddSubjournal.onclick = function(e){
        e.preventDefault(); e.stopPropagation();
        // V2-only: '+' for journals must always open the same template picker dialog
        // as "add journal on this level".
        // It creates only дочірній журнал.
        var st2 = _getState && _getState();
        if(!st2) return;

        var spaceModel2 = buildSpaceAxisModelV2(st2.spaceNodes||[], st2.spacePath||[]);
        var journalModel2 = buildJournalAxisModelV2(st2.journalNodes||[], st2.journalPath||[], spaceModel2.activeId);

        var templates2 = (_api.getTemplates ? _api.getTemplates() : []) || [];

        // If there are no journals yet in this space, create a level-1 journal (parentId === spaceId).
        if(!journalModel2.activeId){
          _openCreateJournal({ title:"Новий журнал", templates: templates2 }).then(function(r){
            if(!r) return null;
            return _api.onCreateLevelJournal(spaceModel2.activeId, spaceModel2.activeId, r.templateId, r.index);
          }).catch(console.error);
          return;
        }

        var hasChildren = (journalModel2.childrenCount||0) > 0;
        var title = hasChildren ? "Новий журнал наступного рівня" : "Новий піджурнал";
        _openCreateJournal({ title:title, templates: templates2 }).then(function(r){
          if(!r) return null;
          return _api.onCreateChildJournal(journalModel2.activeId, r.templateId, r.index);
        }).catch(console.error);
      };
    }
  }

  function render(){
    if(!_getState) return;
    var st = _getState();
    var spaceModel = buildSpaceAxisModelV2(st.spaceNodes||[], st.spacePath||[]);
    var journalModel = buildJournalAxisModelV2(st.journalNodes||[], st.journalPath||[], spaceModel.activeId);
    // Total journals within current space (v2-only). Used for first-run UX.
    var spaceJournalCount = (st.journalNodes && st.journalNodes.length) ? (st.journalNodes.filter(function(j){ return j && String(j.spaceId)===String(spaceModel.activeId||""); }).length) : 0;
    var noJournalsInSpace = (spaceJournalCount === 0);

    // Spaces axis
    if(subspaceChain){
      subspaceChain.innerHTML = "";
      if(spaceModel.canGoPrev && spaceModel.current && spaceModel.current.parentId!=null){
        var bPrev = _mkNavBtn("◀", "Назад (простори)", "btn btn-ghost");
        bPrev.onclick = function(e){ e.preventDefault(); e.stopPropagation(); Promise.resolve(_api.onGoSpacePath(spaceModel.parentPath)).catch(console.error); };
        subspaceChain.appendChild(bPrev);
      }
      var bCur = _mkNavBtn(spaceModel.current.label, "Обрати простір цього рівня", "btn nav-btn");
      bCur.onclick = function(e){
        e.preventDefault(); e.stopPropagation();
        _openPickerOverlay({
          title: "Простори цього рівня",
          items: spaceModel.siblings,
          addLabel: "Додати простір на цей рівень",
          onDelete: _api.onDeleteSpaceSubtree,
          onPick: function(id){
            var base = spaceModel.parentPath.slice();
            base.push(id);
            return _api.onGoSpacePath(base);
          },
          onAdd: function(){
            return _openCreateSpace({ title:"Новий простір" }).then(function(name){
              if(!name) return null;
              return _api.onCreateSiblingSpace(spaceModel.current.parentId, name);
            });
          }
        }).catch(console.error);
      };
      subspaceChain.appendChild(bCur);

      if(spaceModel.childrenCount>0){
        var bChild = _mkNavBtn(String(spaceModel.childrenCount), "Обрати підпростір", "btn nav-btn");
        bChild.onclick = function(e){
          e.preventDefault(); e.stopPropagation();
          _openPickerOverlay({
            title: "Підпростори",
            items: spaceModel.children,
            addLabel: "Додати підпростір",
            onDelete: _api.onDeleteSpaceSubtree,
            onPick: function(id){
              return _api.onGoSpacePath(spaceModel.path.concat([id]));
            },
            onAdd: function(){
              return _openCreateSpace({ title:"Новий підпростір" }).then(function(name){
                if(!name) return null;
                return _api.onCreateChildSpace(spaceModel.activeId, name);
              });
            }
          }).catch(console.error);
        };
        subspaceChain.appendChild(bChild);
      }
    }

    // Journals axis
    if(subjournalChain){
      subjournalChain.innerHTML = "";
      if(journalModel.canGoPrev){
        var jbPrev = _mkNavBtn("◀", "Назад (журнали)", "btn btn-ghost");
        jbPrev.onclick = function(e){ e.preventDefault(); e.stopPropagation(); Promise.resolve(_api.onGoJournalPath(journalModel.parentPath)).catch(console.error); };
        subjournalChain.appendChild(jbPrev);
      }

      // First-run UX: if there are 0 journals in current space, show a CTA instead of empty/placeholder label.
      var jbCurLabel = noJournalsInSpace ? "Додай журнал" : (journalModel.current.label || "Журнал");
      var jbCurTitle = noJournalsInSpace ? "Додати перший журнал у цьому просторі" : "Обрати журнал цього рівня";
      var jbCur = _mkNavBtn(jbCurLabel, jbCurTitle, "btn nav-btn");
      jbCur.onclick = function(e){
        e.preventDefault(); e.stopPropagation();

        // If there are no journals yet in this space, clicking the current journal button should open
        // the same create-journal dialog as "Add journal on this level".
        if(noJournalsInSpace){
          var templates0 = (_api.getTemplates ? _api.getTemplates() : []) || [];
          _openCreateJournal({ title:"Новий журнал", templates: templates0 }).then(function(r){
            if(!r) return null;
            // Create level-1 journal: parentId === spaceId.
            return _api.onCreateLevelJournal(spaceModel.activeId, spaceModel.activeId, r.templateId, r.index);
          }).catch(console.error);
          return;
        }

        _openPickerOverlay({
          title: "Журнали цього рівня",
          items: journalModel.siblings,
          addLabel: "Додати журнал на цей рівень",
          onDelete: function(id){ return _api.onDeleteJournalSubtree && _api.onDeleteJournalSubtree(id); },
          onPick: function(id){
            var base = journalModel.parentPath.slice();
            base.push(id);
            return _api.onGoJournalPath(base);
          },
          onAdd: function(){
            var templates = (_api.getTemplates ? _api.getTemplates() : []) || [];
            return _openCreateJournal({ title:"Новий журнал", templates: templates }).then(function(r){
              if(!r) return null;
              // If there are no journals yet in this space, current.parentId may be null.
              // In that case we must create a level-1 journal (parentId === spaceId).
              var pid = (journalModel && journalModel.current && journalModel.current.parentId) ? journalModel.current.parentId : spaceModel.activeId;
              return _api.onCreateLevelJournal(spaceModel.activeId, pid, r.templateId, r.index);
            });
          }
        }).catch(console.error);
      };
      subjournalChain.appendChild(jbCur);

      if(journalModel.childrenCount>0){
        var jbChild = _mkNavBtn(String(journalModel.childrenCount), "Обрати піджурнал", "btn nav-btn");
        jbChild.onclick = function(e){
          e.preventDefault(); e.stopPropagation();
          _openPickerOverlay({
            title: "Піджурнали",
            items: journalModel.children,
            addLabel: "Додати піджурнал",
            onDelete: function(id){ return _api.onDeleteJournalSubtree && _api.onDeleteJournalSubtree(id); },
            onPick: function(id){
              return _api.onGoJournalPath(journalModel.path.concat([id]));
            },
            onAdd: function(){
              var templates = (_api.getTemplates ? _api.getTemplates() : []) || [];
              return _openCreateJournal({ title:"Новий піджурнал", templates: templates }).then(function(r){
                if(!r) return null;
                return _api.onCreateChildJournal(journalModel.activeId, r.templateId, r.index);
              });
            }
          }).catch(console.error);
        };
        subjournalChain.appendChild(jbChild);
      }
    }
  }

  return { init:init, render:render };
}

export const UiCore = createUiCore();
