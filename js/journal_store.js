// js/journal_store.js
// BUILD: navi2.0
//
// Journal template store (static list).
// Used ONLY for navigation UI to show template names when creating journals.
// This module does NOT store journals; it stores available templates metadata.

const TEMPLATES = [
  { id: "tmpl_in",   title: "Вхідні" },
  { id: "tmpl_out",  title: "Вихідні" },
  { id: "tmpl_ord",  title: "Накази" },
  { id: "tmpl_req",  title: "Звернення" },
  { id: "tmpl_act",  title: "Акти" },
  { id: "tmpl_note", title: "Службові записки" },
  { id: "tmpl_misc", title: "Інше" }
];

export function listJournalTemplates(){
  return TEMPLATES.slice();
}

export function getTemplateById(id){
  id = String(id||"");
  for(let i=0;i<TEMPLATES.length;i++){
    if(String(TEMPLATES[i].id)===id) return TEMPLATES[i];
  }
  return null;
}
