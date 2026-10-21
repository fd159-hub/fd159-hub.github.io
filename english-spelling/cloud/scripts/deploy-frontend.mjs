// A deployment always uploads exactly these two public files, outside backend config.
import {mkdtempSync,copyFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const target=process.argv[2];
if(!['staging','production'].includes(target))throw Error('Specify staging or production');
const projects={staging:{name:'ian-spelling-staging',branch:'staging'},production:{name:'ian-spelling',branch:'release'}};
const project=projects[target];
const temp=mkdtempSync(join(tmpdir(),'ian-spelling-frontend-'));
try{
  for(const file of ['index.html','cloud-client.js'])copyFileSync(new URL('../../'+file,import.meta.url),join(temp,file));
  const files=readdirSync(temp).sort();
  if(JSON.stringify(files)!==JSON.stringify(['cloud-client.js','index.html']))throw Error('Unexpected upload files');
  console.log('Frontend target: '+target+'; project: '+project.name+'; files: '+files.join(', '));
  if(!process.argv.includes('--dry-run')){
    const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8'});
    if(revision.status!==0)throw Error('Cannot resolve release revision');
    const environment={...process.env};delete environment.CLOUDFLARE_ENV;
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url)),'pages','deploy',temp,'--project-name',project.name,'--branch',project.branch,'--commit-hash',revision.stdout.trim(),'--commit-message',target+' verified spelling release'],{cwd:temp,env:environment,stdio:'inherit'});
    if(result.status!==0)throw Error('Frontend deployment failed');
  }
}finally{
  // Verify the exact generated directory is under the OS temp root before recursive removal.
  const relativeTemp=relative(resolve(tmpdir()),resolve(temp));
  if(!relativeTemp||relativeTemp.startsWith('..')||isAbsolute(relativeTemp)||!basename(temp).startsWith('ian-spelling-frontend-'))throw Error('Refuse unsafe temp cleanup');
  rmSync(temp,{recursive:true});
}
