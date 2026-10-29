import {readFile} from 'node:fs/promises';
import {dirname,resolve,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {initializeCarddemoWorkspace,initializeCarddemoTask} from './lib/carddemo-workspace.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
const help=`旧版内嵌 CardDemo / 需求隔离工作区（新项目请在项目概览配置独立业务仓库；默认预览）\n\n  npm run carddemo:workspace -- init --base-commit <40位SHA> [--expected-origin <URL>] [--apply]\n  npm run carddemo:workspace -- task init --project carddemo --task <任务ID> [--apply]\n\n可选 --worktree <绝对同级目录>；task init 可用 --state-dir <绝对Teams状态目录>。\n首次基线须精确匹配已显式fetch的origin/main或origin/develop。不会自动fetch/push、\n切换平台main、复制未提交文件/本机配置，或启动iCode。已有任务会话不会迁移。\n配置：teams/.local/carddemo-workspace.json；绑定：实际state目录/project-task-directory-bindings.json。`;
if(!args.length||args.length===1&&args[0]==='--help')console.log(help);else await main().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;});
async function main(){let command=args[0],start=1;if(command==='task'&&args[1]==='init'){command='task';start=2;}else if(command!=='init')throw Error('命令应为 init 或 task init');const options={},seen=new Set();let apply=false;
 for(let i=start;i<args.length;i++){const key=args[i];if(seen.has(key))throw Error('参数重复：'+key);seen.add(key);if(key==='--apply'){apply=true;continue;}if(!['--base-commit','--expected-origin','--worktree','--project','--task','--state-dir'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw Error('参数无效：'+key);options[key]=args[++i];}
 const {loadLocalConfiguration}=await import('../teams/server/local-config.ts');const env={...process.env};loadLocalConfiguration(join(root,'teams'),env);const runtime=options['--state-dir']??env.DEMO_STATE_DIR??join(root,'teams','.runtime');if(!isAbsolute(runtime))throw Error('state-dir 必须为绝对路径');
 let independent;try{independent=JSON.parse(await readFile(join(runtime,'project-workspaces.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(independent&&(!Array.isArray(independent.projects)||independent.version!==1))throw Error('独立项目工作区配置损坏');
 if(independent?.projects.some(item=>item.projectId==='carddemo'))throw Error('CardDemo 已配置独立业务仓库；请在项目概览维护目录，新需求准备时自动创建业务工作区。此旧版工具不会在 Teams 仓库创建业务分支。');
 if(command==='init'){if(options['--project']||options['--task']||options['--state-dir'])throw Error('init 不接收任务参数');console.log(JSON.stringify({ok:true,...await initializeCarddemoWorkspace({repo:root,baseCommit:options['--base-commit'],expectedOrigin:options['--expected-origin'],worktree:options['--worktree'],apply})},null,2));return;}
 if(options['--base-commit']||options['--expected-origin']||!options['--project']||!options['--task'])throw Error('task init 必须明确 project/task，不接受覆盖基线');
 console.log(JSON.stringify({ok:true,...await initializeCarddemoTask({repo:root,runtime,projectId:options['--project'],taskId:options['--task'],worktree:options['--worktree'],apply})},null,2));
}
