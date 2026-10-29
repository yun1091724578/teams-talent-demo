import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../src/domain.js';
import {readFixtures} from '../server/http-shared.js';
import {createSourcePluginCatalog} from '../src/source-plugins.js';
import {teamsSnapshot} from '../server/shared-data.js';

test('Talents receives only explicitly configured repository paths; unconfigured projects never infer an embedded checkout',async()=>{
 const state=initialState(),fixtures=await readFixtures(),catalog=createSourcePluginCatalog(fixtures);
 const empty=teamsSnapshot(state,fixtures,catalog),repository=empty.projects.find(project=>project.id==='carddemo')!.repositories[0];
 assert.equal(repository.path,undefined);assert.equal(repository.remote,'https://github.com/JeffyLiu003/carddemo-java-1025.git');
 const exported=teamsSnapshot(state,fixtures,catalog,{version:1,defaultProjectId:'carddemo',projects:[{projectId:'carddemo',directory:'/configured/credit-card',commonDirectory:'/configured/credit-card/.git',remoteUrl:'https://github.com/example/credit-card.git',baseBranch:'delivery'}]});
 const configured=exported.projects.find(project=>project.id==='carddemo')!.repositories[0];assert.equal(configured.path,'/configured/credit-card');assert.equal(configured.remote,'https://github.com/example/credit-card.git');assert.equal(configured.branch,'delivery');assert.equal(exported.projects.find(project=>project.id==='teams')!.repositories.some(repo=>repo.path==='/configured/credit-card'),false);
 assert.ok(exported.projects.find(project=>project.id==='carddemo')!.documents.some(doc=>doc.path.startsWith('teams/fixtures/project-documents/')));
});
