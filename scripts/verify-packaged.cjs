const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),asar=require('@electron/asar'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),archive=path.join(root,'dist','win-unpacked','resources','app.asar'),source=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
for(const name of ['app.js','core.mjs','planner.mjs','curriculum.mjs','styles.css','index.html','icon.svg','resources/icon.ico','desktop/main.cjs','desktop/preload.cjs'])assert.ok(asar.extractFile(archive,name).equals(fs.readFileSync(path.join(root,name))),'Packaged bytes differ: '+name);
const packaged=JSON.parse(asar.extractFile(archive,'package.json'));
assert.equal(packaged.version,source.version);assert.equal(fs.readFileSync(path.join(root,'app.js'),'utf8').match(/APP_VERSION='([^']+)'/)[1],source.version,'UI version differs from package');assert.equal(source.build.appId,'cn.qingzhou.study');assert.equal(source.build.nsis.deleteAppDataOnUninstall,false);
const installers=fs.readdirSync(path.join(root,'dist')).filter(n=>/^Qingzhou-Setup-.*-x64\.exe$/.test(n));assert.equal(installers.length,1);
const sums=installers.map(name=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist',name))).digest('hex')+'  '+name).join('\n')+'\n';
fs.writeFileSync(path.join(root,'dist','SHA256SUMS.txt'),sums);console.log('PASS packaged bytes, version, install identity, data-preserving configuration and installer checksum');
