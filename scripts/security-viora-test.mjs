// Offline browser regression: all network responses are synthetic.
// Set LABEEB_PLAYWRIGHT_MODULE / LABEEB_CHROMIUM if using another local installation.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.LABEEB_PLAYWRIGHT_MODULE || new URL('../artifacts/chat-qa/node_modules/playwright/index.mjs', import.meta.url));
const read = name => readFileSync(new URL('../viora-tauri/shim/'+name, import.meta.url),'utf8');
const mount='https://www.youtube.com/__viora/';
const helper='https://www.youtube.com:444/__viora/';
const browser=await chromium.launch({headless:true,executablePath:process.env.LABEEB_CHROMIUM});
try {
 const page=await browser.newPage();
 page.setDefaultTimeout(15000);
 let storeCalls=0, networkCalls=0;
 await page.route('**/*',async route=>{
  const url=route.request().url();let body,contentType='text/javascript';
  if(url===mount+'index.html') {contentType='text/html';body='<html><body><script>window.__vioraBoot={token:"synthetic-secret"}</script><script src="__shim/ftElectron.js"></script></body></html>';}
  else if(url.startsWith(mount+'__shim/') || url.startsWith(helper+'__shim/')) {const name=url.slice((url.startsWith(helper)?helper:mount).length+7);body=read(name);if(name.endsWith('.html'))contentType='text/html';}
  else if(url===mount+'botGuardScript.js') body=`async function mint(){
   await fetch('https://www.google.com/js/audit-fixture');
   const result=await globalThis.auditAttack;
   await fetch('https://www.youtube.com/youtubei/v1/att/get?prettyPrint=false&alt=json',{method:'POST',headers:{Accept:'*/*','Content-Type':'application/json','X-Goog-Visitor-Id':'synthetic','X-Youtube-Client-Version':'synthetic','X-Youtube-Client-Name':'1'},body:'{}'});
   const response=await fetch('https://www.youtube.com/api/jnn/v1/GenerateIT',{method:'POST',headers:{'content-type':'application/json'},body:'[]'});
   return JSON.stringify({...result,allowedRequest:response.ok});
  } export {mint as default};`;
  else if(url==='https://www.google.com/js/audit-fixture') body=`globalThis.auditAttack=(async()=>{
   let parentBlocked=false,readBlocked=false,storeBlocked=false,domainBlocked=false;
   try{void parent.ftElectron.dbHistory;}catch{parentBlocked=true;}
   try{document.domain='youtube.com';void parent.ftElectron.dbHistory;}catch{domainBlocked=true;}
   try{await fetch('https://www.youtube.com/__viora/index.html');}catch{readBlocked=true;}
   try{await fetch('https://www.youtube.com/__viora/__api/store',{method:'POST',headers:{'X-Viora-Token':'synthetic-secret'},body:'{}'});}catch{storeBlocked=true;}
   return {parentBlocked,readBlocked,storeBlocked,domainBlocked,separateOrigin:origin==='https://www.youtube.com:444',storageBlocked:localStorage.getItem('private-fixture')===null};
  })();`;
  else if(['https://www.youtube.com/api/jnn/v1/GenerateIT','https://www.youtube.com/youtubei/v1/att/get?prettyPrint=false&alt=json'].includes(url)) {networkCalls++;assert.equal(route.request().method(),'POST');assert.equal(route.request().headers()['x-viora-token'],undefined);body='["synthetic"]';contentType='application/json';}
  else if(url===mount+'__api/store') {storeCalls++;body='[]';contentType='application/json';}
  else {await route.abort();throw Error('Unexpected request: '+url);}
  await route.fulfill({status:200,contentType,body,headers:{'Origin-Agent-Cluster':'?1'}});
 });
 await page.goto(mount+'index.html');
 await page.evaluate(()=>localStorage.setItem('private-fixture','synthetic-private-data'));
 const result=JSON.parse(await page.evaluate(()=>ftElectron.generatePoToken('test','null','null','null')));
 assert.deepEqual(result,{parentBlocked:true,readBlocked:true,storeBlocked:true,domainBlocked:true,separateOrigin:true,storageBlocked:true,allowedRequest:true});
 assert.equal(storeCalls,0);assert.equal(networkCalls,2);assert.equal(await page.locator('iframe').count(),0);
 // Malformed JSON is data, never executable source; cleanup must permit retry.
 await assert.rejects(page.evaluate(()=>ftElectron.generatePoToken('test','null);parent.pwned=true;//','null','null')));
 assert.equal(await page.evaluate(()=>window.pwned),undefined);
 assert.equal(await page.locator('iframe').count(),0);
 assert.deepEqual(JSON.parse(await page.evaluate(()=>ftElectron.generatePoToken('retry','null','null','null'))),result);
 assert.equal(storeCalls,0);assert.equal(networkCalls,4);
 console.log(JSON.stringify({result,storeCalls,networkCalls,cleanup:true,injectionRejected:true}));
}finally{await browser.close();}
