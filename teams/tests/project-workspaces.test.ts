import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readProjectWorkspaces, saveProjectWorkspace, ensureProjectTaskWorkspace, readProjectTaskBinding, verifyProjectWorkspace } from '../server/project-workspaces.js';
import { taskWorkDirectory, ensureTaskWorkspace } from '../server/task-work-directory.js';

const git = (directory: string, args: string[]) => execFileSync('git', ['-C',directory,...args], {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const remoteUrl='https://github.com/JeffyLiu003/carddemo-java-1025.git';
async function fixture(body: (data: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const data=await setup(); try {await body(data);} finally {await rm(data.temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
async function setup() {
  const temp=await realpath(await mkdtemp(join(tmpdir(),'external-workspace-'))),platform=join(temp,'Teams'),business=join(temp,'Card 项目'),runtime=join(temp,'runtime');
  for(const directory of [platform,business]) {
    await mkdir(directory);git(directory,['init','-b','main']);await writeFile(join(directory,'README.md'),'baseline');
    git(directory,['add','README.md']);git(directory,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','baseline']);
    git(directory,['remote','add','origin',directory===business?remoteUrl:'https://github.com/test/teams.git']);
  }
  git(business,['branch','develop']);await mkdir(runtime);
  const task={id:'REQ-'+randomUUID(),projectId:'carddemo',stage:'preparing',nodes:Object.fromEntries(['prepare','develop','verify','accept'].map(id=>[id,{status:'pending'}]))};
  const preparationId=randomUUID(),state={schemaVersion:2,workspace:{deliveryRequirements:[task],taskAutomation:[{projectId:'carddemo',taskId:task.id,preparation:{id:preparationId,status:'preparing-session'}}]}};
  await writeFile(join(runtime,'state.json'),JSON.stringify(state));
  return {temp,platform,business,runtime,task,preparationId,state,input:{projectId:'carddemo',directory:business,remoteUrl,baseBranch:'develop'}};
}

test('external configuration survives reload, validates origin/base and never changes Teams or business branches',async()=>fixture(async f=>{
  assert.equal((await readProjectWorkspaces(f.runtime)).projects.length,0);
  await writeFile(join(f.business,'README.md'),'user uncommitted');const before=git(f.business,['status','--porcelain']);
  const config=await saveProjectWorkspace(f.runtime,f.platform,f.input);
  assert.equal(config.defaultProjectId,'carddemo');assert.equal(config.projects[0].directory,f.business);
  assert.deepEqual(await readProjectWorkspaces(f.runtime),config);
  assert.equal(git(f.platform,['branch','--show-current']),'main');assert.equal(git(f.business,['branch','--show-current']),'main');assert.equal(git(f.business,['status','--porcelain']),before);
  await assert.rejects(saveProjectWorkspace(f.runtime,f.platform,{...f.input,remoteUrl:'https://github.com/wrong/repo.git'}),/origin/);
  await assert.rejects(saveProjectWorkspace(f.runtime,f.platform,{...f.input,baseBranch:'missing'}));
  await assert.rejects(saveProjectWorkspace(f.runtime,f.platform,{...f.input,directory:f.platform}),/Teams/);
  await assert.rejects(saveProjectWorkspace(f.runtime,f.platform,{...f.input,directory:join(f.business,'docs')}));
  assert.deepEqual(await readProjectWorkspaces(f.runtime),config);
}));

test('preparation creates isolated worktree in business repo; reuse and subsequent workspace edits preserve pinned task',async()=>fixture(async f=>{
  await saveProjectWorkspace(f.runtime,f.platform,f.input);await writeFile(join(f.business,'README.md'),'uncommitted business');
  const before=await readFile(join(f.runtime,'state.json'));
  const [one,two]=await Promise.all([ensureTaskWorkspace(f.runtime,{projectId:'carddemo',taskId:f.task.id},f.preparationId,f.platform),ensureTaskWorkspace(f.runtime,{projectId:'carddemo',taskId:f.task.id},f.preparationId,f.platform)]);
  assert.ok(one);assert.equal(one.directory,two!.directory);assert.notEqual(one.directory,f.business);
  assert.equal(git(one.directory,['remote','get-url','origin']),remoteUrl);
  assert.equal(await realpath(git(one.directory,['rev-parse','--show-toplevel'])),one.directory);
  assert.equal(await readFile(join(one.directory,'README.md'),'utf8'),'baseline');
  assert.equal(await taskWorkDirectory(f.runtime,f.task,f.platform),one.directory);
  assert.deepEqual(await readFile(join(f.runtime,'state.json')),before);
  assert.equal(git(f.platform,['worktree','list','--porcelain']).split('worktree ').length-1,1);
  await writeFile(join(one.directory,'README.md'),'task changes');
  git(f.business,['branch','release-baseline']);await saveProjectWorkspace(f.runtime,f.platform,{...f.input,baseBranch:'release-baseline'});
  const saved=await readProjectTaskBinding(f.runtime,f.task);assert.equal(saved!.baseBranch,'develop');assert.equal(saved!.directory,one.directory);assert.equal(await readFile(join(one.directory,'README.md'),'utf8'),'task changes');
  git(one.directory,['switch','-c','wrong-task']);await assert.rejects(readProjectTaskBinding(f.runtime,f.task),/分支发生变化/);
}));

test('preparation refuses already executed, explicitly assigned, stale or conflicting tasks and preserves paths',async()=>fixture(async f=>{
  await saveProjectWorkspace(f.runtime,f.platform,f.input);
  await assert.rejects(ensureProjectTaskWorkspace(f.runtime,f.task,'wrong-preparation'),/准备请求/);
  f.state.workspace.deliveryRequirements[0].nodes.prepare.status='done';await writeFile(join(f.runtime,'state.json'),JSON.stringify(f.state));
  await assert.rejects(ensureProjectTaskWorkspace(f.runtime,f.task,f.preparationId),/任务已开始/);
  await assert.rejects(access(join(f.runtime,'project-worktree-bindings.json')),{code:'ENOENT'});
  const config=await readProjectWorkspaces(f.runtime);git(f.business,['remote','set-url','origin','https://github.com/wrong/changed.git']);
  await assert.rejects(verifyProjectWorkspace(config.projects[0]),/origin/);
  await assert.rejects(ensureProjectTaskWorkspace(f.runtime,f.task,f.preparationId),/origin/);
}));

test('configured workspace is project-specific and malformed registry never falls back to embedded business source',async()=>fixture(async f=>{
  await saveProjectWorkspace(f.runtime,f.platform,f.input);
  assert.equal(await taskWorkDirectory(f.runtime,f.task,f.platform),f.business);
  assert.equal(await taskWorkDirectory(f.runtime,{projectId:'another-project',id:'another-task'},f.platform),undefined);
  await writeFile(join(f.runtime,'project-workspaces.json'),'{broken');
  await assert.rejects(taskWorkDirectory(f.runtime,f.task,f.platform));
}));


test('native preparation and project plan use external task root without appending embedded subdirectory',async()=>fixture(async f=>{
  const {initialState}=await import('../src/domain.js');
  const {createDeliveryRequirement}=await import('../src/delivery-requirements.js');
  const {queueTaskPreparation,taskAutomation}=await import('../src/task-automation.js');
  const {ProjectWorkService}=await import('../server/project-work.js');
  const {readFixtures}=await import('../server/http-shared.js');
  const state=initialState(),scope={projectId:'carddemo',taskId:f.task.id};
  createDeliveryRequirement(state,'owner',{id:f.task.id,projectId:'carddemo',title:'External repository requirement',description:'Use the independently configured business repository',assigneeId:'member'},new Date().toISOString());
  queueTaskPreparation(state,scope,new Date().toISOString());
  const preparation=taskAutomation(state,scope)!.preparation!;preparation.status='preparing-session';
  await writeFile(join(f.runtime,'state.json'),JSON.stringify(state));
  await saveProjectWorkspace(f.runtime,f.platform,{...f.input,baseBranch:'main'});
  let input:any;
  const service=new ProjectWorkService(()=>state,await readFixtures(),f.runtime,{defaults:async()=>({agent:'code',agentLabel:'Code',model:'configured',modelLabel:'Configured',terminal:{id:'ghostty',name:'Ghostty'}}),history:async()=>{throw Error('must not use old history');},start:async()=>{throw Error('no real TUI during unit test');},focus:async()=>{throw Error('no focus');}},async value=>{input=value;throw new Error('Test captured native launch input; no model call.');},f.platform);
  const unprepared=await service.plan('member',{...scope,tab:'delivery',nodeId:'prepare'});
  assert.equal(unprepared.actions[0].enabled,false);assert.match(unprepared.actions[0].reason!,/独立任务工作区/);
  await assert.rejects(service.prepare('member',scope,preparation.id),/Test captured native launch/);
  assert.ok(input);assert.equal(input.scope.taskId,f.task.id);
  const binding=await readProjectTaskBinding(f.runtime,f.task);assert.ok(binding);
  assert.equal(input.directory,binding.directory);assert.equal(binding.baseBranch,'main');
  assert.equal(git(input.directory,['remote','get-url','origin']),remoteUrl);
  const plan=await service.plan('member',{...scope,tab:'delivery',nodeId:'prepare'});
  assert.equal(plan.directory.valid,true);assert.equal(plan.directory.root,input.directory);assert.match(plan.directory.diagnostic,/PR 目标 main/);
  assert.equal((await service.plan('owner',{projectId:'carddemo',tab:'content'})).directory.root,f.business);
}));

test('old prepared session keeps original cwd after default workspace changes',async()=>fixture(async f=>{
  await saveProjectWorkspace(f.runtime,f.platform,f.input);
  const original=join(f.temp,'original-session');await mkdir(original);
  (f.state.workspace.taskAutomation[0].preparation as any).session={directory:original};
  await writeFile(join(f.runtime,'state.json'),JSON.stringify(f.state));
  assert.equal(await taskWorkDirectory(f.runtime,f.task,f.platform),original);
  await assert.rejects(ensureProjectTaskWorkspace(f.runtime,f.task,f.preparationId),/任务已开始/);
}));


test('a distributed Teams folder needs no Git metadata; the configured business checkout still does',async()=>fixture(async f=>{
 const distribution=join(f.temp,'Teams distribution');await mkdir(distribution);
 const config=await saveProjectWorkspace(f.runtime,distribution,f.input);assert.equal(config.projects[0].directory,f.business);
 const notGit=join(f.temp,'not-a-checkout');await mkdir(notGit);
 await assert.rejects(saveProjectWorkspace(f.runtime,distribution,{...f.input,directory:notGit}));
 assert.deepEqual(await readProjectWorkspaces(f.runtime),config);
}));
