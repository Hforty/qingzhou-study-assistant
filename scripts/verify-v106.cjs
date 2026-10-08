const {spawnSync}=require('node:child_process'),path=require('node:path');
for(const script of ['verify-v106-base.cjs','verify-v106-features.cjs','verify-extra-v106.cjs']){
 const result=spawnSync(process.execPath,[path.join(__dirname,script)],{stdio:'inherit',env:process.env});if(result.status!==0)process.exit(result.status||1);
}
