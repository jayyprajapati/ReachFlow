import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill, { Quill } from 'react-quill';
import { useApp } from '../contexts/AppContext.jsx';
import { Send, FileText, Bookmark, RotateCcw, Plus, Trash2, ClipboardPaste, FileUp, Users, Clock, Eye } from 'lucide-react';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CUSTOM_VARIABLES = 2;
const QUILL_MODULES = { toolbar: [['bold','italic','underline'],[{header:[2,3,false]}],[{list:'ordered'},{list:'bullet'}],['link']] };

// Register variable blot
const Embed = Quill.import('blots/embed');
class VariableBlot extends Embed {
  static create(v) { const n = super.create(); n.setAttribute('data-key',v); n.setAttribute('contenteditable','false'); n.classList.add('var-token'); n.innerText=`{{${v}}}`; return n; }
  static value(n) { return n.getAttribute('data-key'); }
}
VariableBlot.blotName='variable'; VariableBlot.tagName='span'; VariableBlot.className='var-token';
try { Quill.register(VariableBlot, true); } catch(e) {}

function uid() { if(crypto?.getRandomValues){const b=crypto.getRandomValues(new Uint8Array(12));return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')}return Math.random().toString(16).slice(2).padEnd(24,'0').slice(0,24); }
const strip = h => (h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const cap = w => w?w[0].toUpperCase()+w.slice(1).toLowerCase():'';
const nameFrom = e => { const p=(e||'').split('@')[0].replace(/[0-9]/g,'').split(/[._-]+/).filter(Boolean); return p.length?p.map(cap).join(' '):'There'; };
const VAR_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const findVars = html => { const n=(html||'').replace(VAR_REGEX,(_,v)=>`{{${v.toLowerCase()}}}`); const f=new Set(); let m; const r=/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g; while((m=r.exec(n))!==null)f.add(m[1].toLowerCase()); return Array.from(f); };
const hasUnmatched = html => { const o=(html.match(/\{\{/g)||[]).length; const c=(html.match(/\}\}/g)||[]).length; return o!==c; };

export default function ComposePage() {
  const { API_BASE, authedFetch, gmailConnected, setNotice, setWarningDialog, variables, setVariables, loadVariables, groups, loadGroups, templates, loadTemplates, loadHistory, loadDrafts, senderName, hydrateProfile } = useApp();
  const [recipients, setRecipients] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState({ recipients: {} });
  const [saving, setSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [nameFormat, setNameFormat] = useState('first');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [varForm, setVarForm] = useState({ variableName:'', description:'' });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewMeta, setPreviewMeta] = useState(null);
  const [groupImports, setGroupImports] = useState([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [templateDrawer, setTemplateDrawer] = useState(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [slashMenu, setSlashMenu] = useState({ open:false, top:0, left:0 });
  const [slashHighlight, setSlashHighlight] = useState(0);
  const [slashTriggerIdx, setSlashTriggerIdx] = useState(null);
  const quillRef = useRef(null);

  const variableKeys = useMemo(() => ['name', ...variables.map(v=>v.variableName)], [variables]);
  const hdrs = useMemo(() => ({ 'Content-Type':'application/json' }), []);

  // Slash menu
  useEffect(() => {
    const quill = quillRef.current?.getEditor(); if(!quill) return;
    const handleKeyDown = e => {
      if(slashMenu.open){
        if(['ArrowDown','ArrowUp','Enter','Escape'].includes(e.key)) e.preventDefault();
        if(e.key==='ArrowDown'){setSlashHighlight(p=>(p+1)%Math.max(variableKeys.length,1));return;}
        if(e.key==='ArrowUp'){setSlashHighlight(p=>(p-1+Math.max(variableKeys.length,1))%Math.max(variableKeys.length,1));return;}
        if(e.key==='Enter'){insertVariable(variableKeys[slashHighlight]||'name');return;}
        if(e.key==='Escape'){closeSlashMenu();return;}
        closeSlashMenu();return;
      }
      if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
        const sel=quill.getSelection(true);if(!sel)return;
        const bounds=quill.getBounds(sel.index);const rect=quill.root.getBoundingClientRect();
        setSlashMenu({open:true,left:rect.left+bounds.left,top:rect.top+bounds.top+bounds.height+4});
        setSlashTriggerIdx(sel.index);setSlashHighlight(0);
      }
    };
    quill.root.addEventListener('keydown',handleKeyDown);
    return ()=>quill.root.removeEventListener('keydown',handleKeyDown);
  }, [slashMenu.open, slashHighlight, variableKeys]);

  function closeSlashMenu(){setSlashMenu({open:false,top:0,left:0});setSlashTriggerIdx(null);}
  function insertVariable(key){const q=quillRef.current?.getEditor();if(!q||slashTriggerIdx===null)return;q.deleteText(slashTriggerIdx,1);q.insertEmbed(slashTriggerIdx,'variable',key);q.insertText(slashTriggerIdx+1,' ');q.setSelection(slashTriggerIdx+2,0);closeSlashMenu();}

  // Recipients
  function addRow(){setRecipients(p=>[...p,{_id:uid(),email:'',name:'',variables:{},status:'pending'}]);if(errors.recipientsGeneral)setErrors(p=>({...p,recipientsGeneral:undefined}));}
  function updateRecipient(idx,field,value){setRecipients(p=>{const n=[...p];n[idx]={...n[idx],[field]:value};return n;});}
  function updateRecipientVariable(idx,key,value){setRecipients(p=>{const n=[...p];n[idx]={...n[idx],variables:{...(n[idx].variables||{}),[key]:value}};return n;});}
  function deleteRecipient(idx){setRecipients(p=>p.filter((_,i)=>i!==idx));}
  function onEmailBlur(idx){setRecipients(p=>{const n=[...p],r=n[idx];if(!r||!emailRegex.test(r.email||''))return p;n[idx]={...r,name:r.name?.trim()?r.name:nameFrom(r.email)};return n;});}
  function doBulkPaste(text){const parsed=parseBulk(text);if(!parsed.length)return;setRecipients(parsed);setBulkMode(false);setBulkInput('');}
  function parseBulk(raw){if(!raw)return[];const seen=new Set(),list=[];for(const t of raw.split(/[\n,\s]+/).map(s=>s.trim()).filter(Boolean)){if(!emailRegex.test(t))continue;const e=t.toLowerCase();if(seen.has(e))continue;seen.add(e);list.push({email:e,name:nameFrom(e),variables:{},_id:uid(),status:'pending'});}return list;}

  // Validation
  function validate(){const e={recipients:{}};if(!subject.trim())e.subject='Required';if(!strip(body))e.body='Required';if(!recipients.length)e.recipientsGeneral='Add at least one recipient';if(recipients.length>50)e.recipientsGeneral='Max 50 recipients per send';if(hasUnmatched(body))e.body='Invalid variable syntax.';recipients.forEach(r=>{const re={};if(!emailRegex.test(r.email||''))re.email='Invalid';if(!r.name?.trim())re.name='Required';if(Object.keys(re).length)e.recipients[r._id]=re;});return e;}
  const hasErr=e=>{const rr=Object.values(e.recipients||{}).some(o=>Object.keys(o||{}).length);return !!(e.subject||e.body||e.recipientsGeneral||rr);};

  // Campaign
  function buildPayload(){return{subject,body_html:body,sender_name:senderName,name_format:nameFormat,recipients:recipients.map(r=>({...r,email:(r.email||'').toLowerCase().trim(),name:(r.name||'').trim()})),variables:variables.map(v=>v.variableName).filter(Boolean),group_imports:groupImports};}

  async function saveDraft(toast=false){const p=buildPayload();if(!p.subject||!p.body_html||!p.recipients.length){if(toast)setNotice({type:'error',message:'Need subject, body & recipients'});return;}setSaving(true);try{let res;if(draftId){res=await authedFetch(`${API_BASE}/api/campaigns/${draftId}`,{method:'PATCH',headers:hdrs,body:JSON.stringify(p)});}else{res=await authedFetch(`${API_BASE}/api/campaigns`,{method:'POST',headers:hdrs,body:JSON.stringify(p)});}const d=await res.json();if(!res.ok)throw new Error(d.error||'Save failed');if(!draftId&&d.id)setDraftId(d.id);if(toast)setNotice({type:'info',message:'Draft saved'});loadDrafts();}catch(e){setNotice({type:'error',message:e.message});}finally{setSaving(false);}}

  async function doPreview(){const ve=validate();setErrors(ve);if(hasErr(ve))return;setIsPreviewing(true);try{const tgt=recipients[Math.floor(Math.random()*recipients.length)];if(!tgt)throw new Error('No recipients');const payload=buildPayload();const res=await authedFetch(`${API_BASE}/api/campaigns/preview`,{method:'POST',headers:hdrs,body:JSON.stringify({...payload,recipient_id:tgt._id})});const d=await res.json();if(!res.ok)throw new Error(d.error||'Preview failed');if(d.warnings?.length)setNotice({type:'info',message:d.warnings[0]});setPreviewMeta(tgt);setPreviewHtml(d.html||'');setPreviewOpen(true);}catch(e){setNotice({type:'error',message:e.message});}finally{setIsPreviewing(false);}}

  async function doSend(){if(hasUnmatched(body)||hasUnmatched(subject)){setNotice({type:'error',message:'Invalid variable syntax.'});return;}const ve=validate();setErrors(ve);if(hasErr(ve))return;setIsSending(true);try{const payload=buildPayload();const res=await authedFetch(`${API_BASE}/api/campaigns/send-now`,{method:'POST',headers:hdrs,body:JSON.stringify({...payload,confirm_bulk_send:recipients.length>5})});const d=await res.json();if(!res.ok){if(res.status===401||d.authError){setNotice({type:'error',message:'Gmail authorization expired. Please reconnect.'});hydrateProfile();return;}throw new Error(d.error||'Send failed');}setNotice({type:'success',message:`Sent to ${recipients.length} recipients`});setPreviewOpen(false);loadHistory();loadDrafts();}catch(e){setNotice({type:'error',message:e.message});}finally{setIsSending(false);}}

  async function loadCampaign(id){try{const res=await authedFetch(`${API_BASE}/api/campaigns/${id}`);const d=await res.json();if(!res.ok)throw new Error(d.error);setSubject(d.subject||'');setBody(d.body_html||'');setNameFormat(d.name_format==='full'?'full':'first');const recs=(d.recipients||[]).map(r=>({...r,_id:r._id||uid()}));setRecipients(recs);setDraftId(d.id);setNotice({type:'info',message:'Draft loaded'});}catch(e){setNotice({type:'error',message:e.message});}}

  // Variables
  async function createVariable(){const cleaned=String(varForm.variableName||'').toLowerCase().trim().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');if(!cleaned){setNotice({type:'error',message:'Variable name required'});return;}if(variables.length>=MAX_CUSTOM_VARIABLES){setNotice({type:'error',message:'Max 2 custom variables'});return;}try{const res=await authedFetch(`${API_BASE}/api/variables`,{method:'POST',headers:hdrs,body:JSON.stringify({variableName:cleaned,description:varForm.description})});const d=await res.json();if(!res.ok)throw new Error(d.error);setVariables(p=>[...p,d]);setVarForm({variableName:'',description:''});setNotice({type:'success',message:'Variable added'});}catch(e){setNotice({type:'error',message:e.message});}}
  async function deleteVariable(id){const target=variables.find(v=>v.id===id);if(!target)return;setWarningDialog({title:'Delete variable?',message:`Remove {{${target.variableName}}}?`,confirmText:'Delete',intent:'danger',onConfirm:async()=>{try{if(!String(id).startsWith('local-')){const res=await authedFetch(`${API_BASE}/api/variables/${id}`,{method:'DELETE'});const d=await res.json();if(!res.ok)throw new Error(d.error);}setVariables(p=>p.filter(v=>v.id!==id));setNotice({type:'info',message:'Variable deleted'});}catch(e){setNotice({type:'error',message:e.message});}}});}

  // Templates
  function importTemplate(t){setSubject(t.subject||'');setBody(t.body_html||'');setNotice({type:'info',message:`Template "${t.title}" applied`});}
  async function saveTemplate(){if(!templateTitle.trim()){setNotice({type:'error',message:'Title required'});return;}try{const res=await authedFetch(`${API_BASE}/api/templates`,{method:'POST',headers:hdrs,body:JSON.stringify({title:templateTitle.trim(),subject,body_html:body})});const d=await res.json();if(!res.ok)throw new Error(d.error);setNotice({type:'success',message:'Template saved'});setTemplateDrawer(null);loadTemplates();}catch(e){setNotice({type:'error',message:e.message});}}

  // Group import
  function handleGroupImport(contacts,groupData,category){const incoming=(contacts||[]).filter(c=>c?.email);if(!incoming.length){setNotice({type:'error',message:'No contacts to import'});return;}const existing=new Set(recipients.map(r=>(r.email||'').toLowerCase()));const adds=[];for(const c of incoming){const e=(c.email||'').toLowerCase().trim();if(!emailRegex.test(e)||existing.has(e))continue;existing.add(e);adds.push({_id:uid(),email:e,name:(c.name||'').trim()||nameFrom(e),variables:{},status:'pending'});}if(!adds.length){setNotice({type:'info',message:'All contacts already in recipients.'});return;}setRecipients(p=>[...p,...adds]);setNotice({type:'info',message:`Imported ${adds.length} contacts`});}

  function resetComposeState(){setRecipients([]);setSubject('');setBody('');setDraftId(null);setErrors({recipients:{}});setGroupImports([]);setNameFormat('first');setBulkMode(false);setBulkInput('');}

  return (
    <div className="rf-compose">
      {/* Subject */}
      <input className="rf-compose__subject" value={subject} onChange={e=>{setSubject(e.target.value);if(errors.subject)setErrors(p=>({...p,subject:undefined}));}} placeholder="Subject line…" />
      {errors.subject && <span className="rf-field-error">{errors.subject}</span>}

      {/* Toolbar */}
      <div className="rf-compose__toolbar">
        <div className="rf-compose__toolbar-left">
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={()=>setBulkMode(!bulkMode)}>{bulkMode?'Manual':'Paste Bulk'}</button>
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={()=>{loadGroups();setImportModalOpen(true);}}><FileUp size={13}/>Import Group</button>
          <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={resetComposeState}><RotateCcw size={13}/>Reset</button>
        </div>
        <div className="rf-compose__toolbar-right">
          <div className="rf-name-toggle">
            <span>Use {nameFormat==='full'?'full name':'first name'}</span>
            <label className={`rf-name-toggle__switch ${nameFormat==='full'?'rf-name-toggle__switch--on':''}`}>
              <input type="checkbox" checked={nameFormat==='full'} onChange={e=>setNameFormat(e.target.checked?'full':'first')}/>
              <span className="rf-name-toggle__thumb"/>
            </label>
          </div>
        </div>
      </div>

      {/* Recipients */}
      <div className="rf-recipients">
        <div className="rf-recipients__header">
          <span style={{fontSize:'var(--rf-text-sm)',fontWeight:600,color:'var(--rf-text-secondary)'}}><Users size={14} style={{display:'inline',verticalAlign:'-2px'}}/> Recipients ({recipients.length})</span>
          {!bulkMode && <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={addRow}><Plus size={13}/>Add</button>}
        </div>
        {bulkMode ? (
          <textarea className="rf-textarea" rows={4} placeholder="Paste emails (comma/newline separated)" value={bulkInput} onChange={e=>setBulkInput(e.target.value)} onPaste={e=>{e.preventDefault();doBulkPaste(e.clipboardData?.getData('text')||'');}}/>
        ) : (
          <div className="rf-recipients__list">
            {recipients.map((r,idx)=>{
              const errs=errors.recipients?.[r._id]||{};
              return (
                <div className="rf-recipient-row" key={r._id} style={{gridTemplateColumns:`1fr 1fr ${variables.length?`repeat(${Math.min(variables.length,2)},1fr)`:''} 28px`}}>
                  <div><input className="rf-input" value={r.email} placeholder="email@example.com" onChange={e=>updateRecipient(idx,'email',e.target.value)} onBlur={()=>onEmailBlur(idx)}/>{errs.email&&<small className="rf-field-error">{errs.email}</small>}</div>
                  <div><input className="rf-input" value={r.name} placeholder="Name" onChange={e=>updateRecipient(idx,'name',e.target.value)}/>{errs.name&&<small className="rf-field-error">{errs.name}</small>}</div>
                  {variables.map(v=><div key={v.variableName}><input className="rf-input" value={r.variables?.[v.variableName]||''} placeholder={v.variableName} onChange={e=>updateRecipientVariable(idx,v.variableName,e.target.value)}/></div>)}
                  <button className="rf-btn rf-btn--ghost rf-btn--icon rf-btn--sm" onClick={()=>deleteRecipient(idx)} title="Remove">✕</button>
                </div>
              );
            })}
            {!recipients.length && <p style={{fontSize:'var(--rf-text-sm)',color:'var(--rf-text-muted)',padding:'var(--rf-sp-2) 0'}}>No recipients yet.</p>}
          </div>
        )}
        {errors.recipientsGeneral && <span className="rf-field-error">{errors.recipientsGeneral}</span>}
      </div>

      {/* Variables */}
      <div className="rf-varbar">
        <span className="rf-chip rf-chip--active">{'{{name}}'}</span>
        {variables.map(v=>(
          <span className="rf-chip" key={v.id}>
            {`{{${v.variableName}}}`}
            <button className="rf-chip__remove" onClick={()=>deleteVariable(v.id)}><Trash2 size={11}/></button>
          </span>
        ))}
        {variables.length < MAX_CUSTOM_VARIABLES && (
          <div className="rf-varbar__add">
            <input className="rf-input" style={{width:110,height:26,fontSize:'var(--rf-text-xs)'}} placeholder="var name" value={varForm.variableName} onChange={e=>setVarForm(f=>({...f,variableName:e.target.value}))}/>
            <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={createVariable}><Plus size={12}/>Add</button>
          </div>
        )}
        <span style={{marginLeft:'auto',fontSize:'var(--rf-text-xs)',color:'var(--rf-text-faint)'}}>{variables.length}/{MAX_CUSTOM_VARIABLES} custom vars</span>
      </div>

      {/* Editor */}
      <div className="rf-compose__body">
        <p className="rf-compose__hint">Type <b>/</b> in the editor to insert variables like {'{{name}}'}</p>
        <div className="rf-compose__editor-wrap">
          <ReactQuill ref={quillRef} theme="snow" value={body} onChange={v=>{setBody(v);if(errors.body&&strip(v))setErrors(p=>({...p,body:undefined}));}} modules={QUILL_MODULES} placeholder="Write your email…"/>
        </div>
        {slashMenu.open && (
          <div className="rf-slash-menu" style={{position:'fixed',top:slashMenu.top,left:slashMenu.left,zIndex:100}}>
            {variableKeys.map((opt,idx)=>(
              <button key={opt} className={idx===slashHighlight?'active':''} onMouseDown={e=>{e.preventDefault();insertVariable(opt);}}>{`{{${opt}}}`}</button>
            ))}
          </div>
        )}
        {errors.body && <span className="rf-field-error">{errors.body}</span>}
      </div>

      {/* Actions */}
      <div className="rf-compose__actions">
        <div className="rf-compose__actions-left">
          <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={()=>saveDraft(true)} disabled={saving}><FileText size={14}/>{saving?'Saving…':'Save Draft'}</button>
          <button className="rf-btn rf-btn--secondary rf-btn--sm" onClick={()=>{if(!subject.trim()||!strip(body)){setNotice({type:'error',message:'Write subject & body first'});return;}setTemplateTitle('');setTemplateDrawer('create');}}><Bookmark size={14}/>Save Template</button>
        </div>
        <div className="rf-compose__actions-right">
          <button className="rf-btn rf-btn--primary" onClick={doPreview} disabled={isPreviewing||!gmailConnected}><Eye size={15}/>{isPreviewing?'Loading…':'Preview & Send'}</button>
        </div>
      </div>

      {/* Preview drawer */}
      {previewOpen && (
        <>
          <div className="rf-drawer-overlay" onClick={()=>setPreviewOpen(false)}/>
          <div className="rf-drawer">
            <div className="rf-drawer__header">
              <span className="rf-drawer__title">Preview & Send</span>
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={()=>setPreviewOpen(false)}>✕</button>
            </div>
            <div className="rf-drawer__body">
              {previewMeta && <div style={{marginBottom:'var(--rf-sp-4)',fontSize:'var(--rf-text-sm)'}}><b>{previewMeta.name}</b> <span className="rf-text-muted">({previewMeta.email})</span></div>}
              <div className="rf-preview-frame" dangerouslySetInnerHTML={{__html:previewHtml}}/>
            </div>
            <div className="rf-drawer__footer">
              <button className="rf-btn rf-btn--ghost" onClick={()=>setPreviewOpen(false)}>Cancel</button>
              <button className="rf-btn rf-btn--primary" onClick={doSend} disabled={isSending}><Send size={14}/>{isSending?'Sending…':'Send'}</button>
            </div>
          </div>
        </>
      )}

      {/* Template create drawer */}
      {templateDrawer==='create' && (
        <>
          <div className="rf-drawer-overlay" onClick={()=>setTemplateDrawer(null)}/>
          <div className="rf-drawer" style={{width:'min(420px,90vw)'}}>
            <div className="rf-drawer__header">
              <span className="rf-drawer__title">Save as Template</span>
              <button className="rf-btn rf-btn--ghost rf-btn--sm" onClick={()=>setTemplateDrawer(null)}>✕</button>
            </div>
            <div className="rf-drawer__body">
              <input className="rf-input rf-input--lg" placeholder="Template name" value={templateTitle} onChange={e=>setTemplateTitle(e.target.value)} style={{marginBottom:'var(--rf-sp-4)'}}/>
              <div className="rf-label">Subject</div>
              <p style={{fontSize:'var(--rf-text-sm)',color:'var(--rf-text-secondary)',marginBottom:'var(--rf-sp-3)'}}>{subject||'(empty)'}</p>
              <div className="rf-label">Body Preview</div>
              <div className="rf-preview-frame" style={{minHeight:80}} dangerouslySetInnerHTML={{__html:body||'<em>Empty</em>'}}/>
            </div>
            <div className="rf-drawer__footer">
              <button className="rf-btn rf-btn--primary" onClick={saveTemplate}>Save Template</button>
            </div>
          </div>
        </>
      )}

      {/* Import modal - simplified inline */}
      {importModalOpen && (
        <div className="rf-dialog-overlay" onClick={()=>setImportModalOpen(false)}>
          <div className="rf-dialog" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}>
            <div className="rf-dialog__title">Import from Group</div>
            <div className="rf-dialog__body">
              <div style={{display:'flex',flexDirection:'column',gap:'var(--rf-sp-3)'}}>
                {groups.length?groups.map(g=>(
                  <button key={g.id} className="rf-btn rf-btn--secondary" style={{justifyContent:'flex-start'}} onClick={async()=>{
                    try{const r=await authedFetch(`${API_BASE}/api/groups/${g.id}`);const d=await r.json();if(!r.ok)throw new Error(d.error);handleGroupImport(d.contacts||[],d,'');setImportModalOpen(false);}catch(e){setNotice({type:'error',message:e.message});}
                  }}>{g.companyName} ({g.contactCount||0})</button>
                )):<p className="rf-text-muted">No groups yet.</p>}
              </div>
            </div>
            <div className="rf-dialog__actions">
              <button className="rf-btn rf-btn--ghost" onClick={()=>setImportModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
