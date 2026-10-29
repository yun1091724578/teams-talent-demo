// Runs only against an isolated state directory and an available loopback port.
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {mkdtemp,realpath,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../server/store.js';
import {createDeliveryRequirement} from '../src/delivery-requirements.js';
const exec=promisify(execFile),directory=await realpath(await mkdtemp(join(tmpdir(),'reset-cli-'))),runtime=join(directory,'state'),shared=join(directory,'shared'),root=resolve('.');
const free=createServer();await new Promise<void>(resolve=>free.listen(0,'127.0.0.1',resolve));const port=(free.address() as {port:number}).port;await new Promise<void>(resolve=>free.close(()=>resolve()));
await mkdir(runtime);await mkdir(shared);await writeFile(join(directory,'config.json'),'{}');const code=join(directory,'workspace');await mkdir(code);await exec('git',['init','-q',code]);await mkdir(join(code,'docs'));await writeFile(join(code,'docs','result.md'),'exclusive output');
const store=new Store(join(runtime,'state.json'));await store.init();const id='REQ-'+randomUUID(),other='REQ-'+randomUUID(),at=new Date().toISOString();
await store.transact(state=>{const next=structuredClone(state),task=createDeliveryRequirement(next,'owner',{projectId:'carddemo',id,title:'reset cli',description:'preserve text',assigneeId:'member',workDirectory:code},at);createDeliveryRequirement(next,'owner',{projectId:'carddemo',id:other,title:'other task',description:'keep',assigneeId:'owner'},at);task.stage='developing';task.nodes.prepare={status:'complete',summary:'finished',updatedAt:at};task.preparedAt=at;next.workspace.collaboration={adoptions:[],operations:[],events:[{id:randomUUID(),operationId:randomUUID(),projectId:'carddemo',taskId:id,nodeId:'prepare',role:'member',runId:randomUUID(),sessionId:null,adoptionId:'fixture',phase:'result',summary:'fixture',blocker:null,evidence:[{kind:'local-file',value:join(code,'docs/result.md'),description:'output',artifact:'prd',version:'v1',source:'actual'}],at,revision:1}]};return next;});
const env={...process.env,DEMO_LOCAL_CONFIG:join(directory,'config.json'),DEMO_STATE_DIR:runtime,DEMO_SHARED_DIR:shared,DEMO_SHARED_SEED_DIR:join(directory,'no-seeds'),DEMO_MATERIAL_ROOT:resolve('..'),DEMO_PORT:String(port),DEMO_TALENT_PORT:String(port===45980?45981:45980),DEMO_TRACE_PORT:String(port===48012?48013:48012),DEMO_NATIVE_DISABLED:'1'};
const origin='http://127.0.0.1:'+port;let logs='',child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:root,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
async function health(){try{return await(await fetch(origin+'/api/health')).json();}catch{return null;}}
async function ready(){for(let i=0;i<150;i++){const h=await health();if(h)return h;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('isolated service unavailable: '+logs);}
try{
 const h=await ready();assert.equal(h.stateRoot,runtime);const before=await readFile(join(runtime,'state.json'));const command=['--import','tsx','scripts/reset-task.ts','--project','carddemo','--task',id];
 const preview=JSON.parse((await exec(process.execPath,command,{cwd:root,env})).stdout);assert.equal(preview.preview,true);assert.equal(preview.counts.documents,1);assert.ok(preview.files.every((item:any)=>!('after'in item)));assert.deepEqual(await readFile(join(runtime,'state.json')),before);
 const applied=JSON.parse((await exec(process.execPath,[...command,'--apply'],{cwd:root,env,timeout:30000})).stdout),newHealth=await ready();assert.notEqual(newHealth.pid,h.pid);const reset=JSON.parse(await readFile(join(runtime,'state.json'),'utf8'));assert.equal(reset.workspace.deliveryRequirements.find((task:any)=>task.id===id).stage,'preparing');assert.equal(reset.workspace.deliveryRequirements.find((task:any)=>task.id===other).title,'other task');
 const restored=JSON.parse((await exec(process.execPath,['--import','tsx','scripts/reset-task.ts','--restore',applied.backup,'--apply'],{cwd:root,env,timeout:30000})).stdout);assert.equal(restored.status,'restored');await ready();assert.deepEqual(await readFile(join(runtime,'state.json')),before);assert.equal(await readFile(join(code,'docs/result.md'),'utf8'),'exclusive output');
 console.log(JSON.stringify({ok:true,previewNoWrite:true,applyRestart:true,restoreAfterSnapshotExport:true,stateBytesRestored:true,otherTaskPreserved:true,nativeCalls:0}));
}finally{const h=await health();if(h?.stateRoot===runtime)process.kill(h.pid,'SIGTERM');else if(child.exitCode===null)child.kill('SIGTERM');for(let i=0;i<50&&await health();i++)await new Promise(resolve=>setTimeout(resolve,100));await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:50});}
