import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,realpath,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readLegacyTaskBinding} from '../../scripts/lib/legacy-task-workspace.mjs';
import {taskWorkDirectory} from '../server/task-work-directory.js';

const git=(directory:string,args:string[])=>execFileSync('git',['-C',directory,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
test('historical task bindings remain read-only, pin exact Git identity and never create a replacement directory',async()=>{
 const temp=await realpath(await mkdtemp(join(tmpdir(),'legacy-task-reader-'))),repo=join(temp,'platform'),runtime=join(temp,'runtime'),worktree=join(temp,'old-task');
 try{
  await mkdir(repo);await mkdir(runtime);git(repo,['init','-b','main']);await mkdir(join(repo,'legacy-source'));await writeFile(join(repo,'legacy-source','source.txt'),'historical');git(repo,['add','legacy-source']);git(repo,['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','baseline']);git(repo,['remote','add','origin','https://github.com/example/old-platform.git']);
  const baseCommit=git(repo,['rev-parse','HEAD']);git(repo,['worktree','add','-b','codex/old-task',worktree,baseCommit]);
  const task={projectId:'carddemo',id:'REQ-legacy'},binding={kind:'carddemo-worktree',projectId:task.projectId,taskId:task.id,recordedDirectory:null,directory:await realpath(join(worktree,'legacy-source')),worktreeRoot:await realpath(worktree),branch:'codex/old-task',baseBranch:'develop',baseCommit,platformRoot:repo,commonDirectory:await realpath(join(repo,'.git')),remote:'origin',remoteUrl:'https://github.com/example/old-platform.git'};
  const path=join(runtime,'project-task-directory-bindings.json');await writeFile(path,JSON.stringify({version:1,bindings:[binding]}));const before=await readFile(path),refs=git(repo,['show-ref','--heads']);
  assert.equal((await readLegacyTaskBinding(repo,runtime,task))!.directory,binding.directory);assert.equal(await taskWorkDirectory(runtime,task,repo),binding.directory);assert.deepEqual(await readFile(path),before);assert.equal(git(repo,['show-ref','--heads']),refs);
  git(worktree,['switch','-c','wrong-task']);await assert.rejects(readLegacyTaskBinding(repo,runtime,task),/分支/);git(worktree,['switch','codex/old-task']);
  await rm(binding.directory,{recursive:true});await assert.rejects(taskWorkDirectory(runtime,task,repo),{code:'ENOENT'});assert.deepEqual(await readFile(path),before);
 }finally{await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
