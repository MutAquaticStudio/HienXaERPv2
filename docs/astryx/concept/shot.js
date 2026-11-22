// usage: BASE=http://localhost:PORT OUT=shots/name node shot.js id[@width] ...
const {chromium}=require('playwright');
(async()=>{const ids=process.argv.slice(2);const out=process.env.OUT||'shots';require('fs').mkdirSync(out,{recursive:true});const b=await chromium.launch();
for(const id of ids){const [name,w]=id.split('@');const p=await b.newPage({viewport:{width:+(w||1280),height:800},deviceScaleFactor:1});
p.on('pageerror',e=>console.log('ERR',name,e.message));
await p.goto((process.env.BASE||'http://localhost:4173')+'/#/'+name);await p.reload();await p.waitForTimeout(700);
const el=await p.$('#screen');await el.screenshot({path:`${out}/${name}.png`});await p.close()}await b.close()})()
