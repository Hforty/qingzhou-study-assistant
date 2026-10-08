const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='win32')throw Error('Only run on GitHub hosted Windows CI');
const root=path.resolve(__dirname,'..'),baseline=path.resolve(process.env.QINGZHOU_BASELINE_DIR||path.join(root,'.runtime','baseline-v105')),temp=path.resolve(process.env.RUNNER_TEMP),work=path.resolve(process.env.QINGZHOU_CLOUD_WORKSPACE);
if(!work.toLowerCase().startsWith((temp+path.sep).toLowerCase()))throw Error('Verification workspace must stay inside RUNNER_TEMP');
fs.mkdirSync(work,{recursive:true});
const cli=path.join(root,'node_modules','electron-builder','cli.js');
for(const source of [baseline,root]){
 const pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
 const output=path.join(work,'isolated-'+pkg.version),cfg={...pkg.build,appId:'cn.qingzhou.study.verification.v105',productName:'轻舟升级验收',extraMetadata:{name:'qingzhou-study-verification-v105'},directories:{...pkg.build.directories,output},win:{...pkg.build.win,artifactName:'Qingzhou-Verify-'+pkg.version+'.exe'},nsis:{...pkg.build.nsis,shortcutName:'轻舟升级验收',uninstallDisplayName:'轻舟升级验收',createDesktopShortcut:false,createStartMenuShortcut:false,runAfterFinish:false}};
 const config=path.join(work,'verification-'+pkg.version+'.json');fs.writeFileSync(config,JSON.stringify(cfg,null,2));
 const r=spawnSync(process.execPath,[cli,'--projectDir',source,'--win','--x64','--config',config,'--publish','never'],{stdio:'inherit',env:process.env});
 if(r.status!==0)process.exit(r.status||1);
}
