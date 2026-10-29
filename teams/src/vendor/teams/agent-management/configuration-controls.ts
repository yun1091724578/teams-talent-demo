/** Vendored from iCode Teams business/domain/agent-management/src/client/ui/configuration-controls.ts
 * Source revision: d3deae7ea4e47026925ccbd06ab6eec03f4648c7.
 * Imports are local; index.ts injects demo module loading/source labeling.
 * configuration-editor.ts labels read-only demo data explicitly. Layout, controls and interaction remain upstream.
 * i18n patch: user-facing text goes through vt() (see docs/i18n/vendor-patches.md).
 */
import { ui } from './ui-contract.js'
import { vt } from '../i18n.js'
import type { ConfigurationField } from './configuration-contract.js'

/** Collection controls exchange native values with the adapter, never ask users to write JSON. */
export function mountCollectionControl(container:HTMLElement, field:ConfigurationField, signal:AbortSignal, readOnly:boolean, changed:(value:string)=>void, error:(message:string)=>void):void {
  const doc=container.ownerDocument
  const value:unknown=field.value===''?(field.kind==='map'?{}:[]):JSON.parse(field.value)
  const button=(label:string,action:()=>void)=>{const b=doc.createElement('button');b.type='button';b.className=ui.button;b.textContent=label;b.disabled=readOnly;b.dataset.fixed=String(readOnly);b.addEventListener('click',action,{signal});return b}
  const input=(label:string,value:string,kind='text',choices?:Array<[string,string]>)=>{
    const c=doc.createElement(kind==='select'?'select':kind==='textarea'?'textarea':'input');c.setAttribute('aria-label',label);c.disabled=readOnly;c.dataset.fixed=String(readOnly)
    if(c instanceof HTMLInputElement)c.type=kind==='number'?'number':kind==='password'?'password':'text'
    if(c instanceof HTMLSelectElement){for(const [v,label] of choices??[]){const option=doc.createElement('option');option.value=v;option.textContent=label;c.append(option)}if(![...c.options].some(o=>o.value===value)){const o=doc.createElement('option');o.value=value;o.textContent=value?vt('am.collection.currentValue',{value}):vt('am.collection.choose');c.prepend(o)}}
    c.value=value;return c
  }
  const commit=(value:unknown)=>changed(JSON.stringify(value))
  container.dataset.collection=field.kind
  if(field.kind==='checklist'){
    if(!Array.isArray(value)||value.some(v=>typeof v!=='string'))throw new Error(vt('am.collection.nameList',{label:field.label}))
    const selected=new Set<string>(value),choices=[...(field.choices??[])]
    for(const name of selected)if(!choices.some(([v])=>v===name))choices.push([name,vt('am.collection.nativeExtension',{name})])
    for(const [name,title] of choices){const label=doc.createElement('label'),check=doc.createElement('input');check.type='checkbox';check.checked=selected.has(name);check.disabled=readOnly;check.dataset.fixed=String(readOnly);check.addEventListener('change',()=>{if(check.checked)selected.add(name);else selected.delete(name);commit([...selected])},{signal});label.append(check,doc.createTextNode(title));container.append(label)}return
  }
  if(field.kind==='map'){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.values(value).some(v=>typeof v!=='string'))throw new Error(vt('am.collection.notStringMap',{label:field.label}))
    const entries=Object.entries(value).map(([key,value])=>({key,value:value as string}))
    const commitMap=()=>{const keys=new Set<string>(),result:Record<string,string>=Object.create(null);for(const row of entries){if(!row.key.trim())throw new Error(vt('am.collection.nameRequired'));if(keys.has(row.key))throw new Error(vt('am.collection.nameDuplicate'));keys.add(row.key);result[row.key]=row.value}commit(result)}
    const draw=()=>{container.replaceChildren();entries.forEach((entry,index)=>{const row=doc.createElement('div');row.dataset.collectionRow='';const key=input(vt('am.collection.keyLabel',{label:field.label,index:index+1}),entry.key),v=input(vt('am.collection.valueLabel',{label:field.label,index:index+1}),entry.value,field.choices?'select':field.sensitive?'password':'text',field.choices);for(const c of [key,v])c.addEventListener('change',()=>{entry.key=key.value;entry.value=v.value;try{commitMap()}catch(e){error(e instanceof Error?e.message:String(e))}},{signal});row.append(key,v);if(field.sensitive&&v instanceof HTMLInputElement)row.append(button(vt('am.collection.show'),()=>{v.type=v.type==='password'?'text':'password'}));row.append(button(vt('am.collection.remove'),()=>{entries.splice(index,1);try{commitMap()}catch(e){error(e instanceof Error?e.message:String(e));draw()}}));container.append(row)});if(!readOnly)container.append(button(vt('am.collection.add',{label:field.label}),()=>{entries.push({key:'',value:field.choices?.[0]?.[0]??''});draw()}))};draw();return
  }
  if(!Array.isArray(value))throw new Error(vt('am.collection.listRequired',{label:field.label}))
  if(field.kind==='list'){
    if(value.some(v=>typeof v!=='string'))throw new Error(vt('am.collection.foreignTypes',{label:field.label}))
    const entries:string[]=[...value]
    const draw=()=>{container.replaceChildren();entries.forEach((entry,index)=>{const row=doc.createElement('div');row.dataset.collectionRow='';const c=input(vt('am.collection.itemLabel',{label:field.label,index:index+1}),entry);c.addEventListener('change',()=>{entries[index]=c.value;commit(entries)},{signal});row.append(c,button(vt('am.collection.remove'),()=>{entries.splice(index,1);commit(entries)}));container.append(row)});if(!readOnly){container.append(button(vt('am.collection.add',{label:field.label}),()=>{entries.push('');draw()}));if(field.unsetLabel&&field.value!=='')container.append(button(field.unsetLabel,()=>changed('')))}};draw();return
  }
  const entries=value.map(v=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error(vt('am.collection.entryObject',{label:field.label}));return {...v} as Record<string,unknown>})
  const draw=()=>{container.replaceChildren();entries.forEach((entry,index)=>{const row=doc.createElement('section');row.dataset.collectionEntry='';const header=doc.createElement('header'),title=doc.createElement('strong');title.textContent=vt('am.collection.itemLabel',{label:field.label,index:index+1});header.append(title,button(vt('am.collection.remove'),()=>{entries.splice(index,1);commit(entries)}));row.append(header);const grid=doc.createElement('div');grid.dataset.fields='';for(const column of field.columns??[]){const label=doc.createElement('label');label.className=ui.field;label.textContent=column.label;const c=input(vt('am.collection.columnLabel',{label:field.label,index:index+1,column:column.label}),entry[column.key]===undefined?'':String(entry[column.key]),column.kind,column.choices);c.addEventListener('change',()=>{if(column.kind==='number'&&c.value!==''&&!Number.isFinite(Number(c.value))){error(vt('am.collection.validNumber'));return}if(c.value==='')delete entry[column.key];else entry[column.key]=column.kind==='number'?Number(c.value):c.value;commit(entries)},{signal});label.append(c);if(column.kind==='textarea')label.dataset.wide='';grid.append(label)}row.append(grid);container.append(row)});if(!readOnly)container.append(button(vt('am.collection.add',{label:field.label}),()=>{entries.push({});draw()}))};draw()
}
