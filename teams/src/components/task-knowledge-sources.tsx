import {useEffect,useState} from 'react';
import {Alert,Button,Drawer,Space,Spin} from 'antd';
import {getTalentsFile} from '../api.js';
import {currentT} from '../../../shared/i18n/index.js';
import type {TaskKnowledgeAsset} from '../talent-contract.js';

type Source={artifactId:string;version:number;path:string;title:string;sha256?:string};
/** Read-only published bodies stay out of the task summary; scope remounts cancel old responses. */
export function TaskKnowledgeSources({assets}:{assets:TaskKnowledgeAsset[]}){
 const [selected,setSelected]=useState<Source|null>(null),[content,setContent]=useState<string|null>(null),[error,setError]=useState('');
 const sources=assets.flatMap(asset=>asset.artifactId&&Number.isSafeInteger(Number(asset.version))?(asset.references??[]).filter(ref=>ref.collection==='talents-shared').map(ref=>({artifactId:asset.artifactId!,version:Number(asset.version),path:ref.path,title:ref.label,sha256:ref.sha256??asset.contentSha256})):[]);
 useEffect(()=>{let active=true;setContent(null);setError('');if(selected)void getTalentsFile({id:selected.artifactId,version:selected.version},selected.path).then(async file=>{
  if(selected.sha256){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(file.content));const actual=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');if(actual!==selected.sha256)throw new Error(currentT('ks.digestMismatch'));}
  if(active)setContent(file.content);
 }).catch(reason=>{if(active)setError((reason as Error).message);});return()=>{active=false;};},[selected]);
 if(!sources.length)return null;
 return <><Space wrap aria-label={currentT('ks.sourcesAria')}>{sources.map(source=><Button size="small" key={source.artifactId+':'+source.version+':'+source.path} onClick={()=>setSelected(source)}>{currentT('ks.read', { title: source.title })}</Button>)}</Space>
  <Drawer open={!!selected} onClose={()=>setSelected(null)} title={selected?currentT('ks.sourceTitle', { title: selected.title, version: selected.version }):currentT('ks.original')} width={840} destroyOnHidden>
   {error?<Alert type="error" showIcon title={currentT('ks.readFailed')} description={error}/>:content===null?<Spin size="small"/>:<pre className="task-node-fulltext" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{content}</pre>}
  </Drawer></>;
}
