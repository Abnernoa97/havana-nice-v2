import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve,sep,extname} from 'node:path';
import {tmpdir} from 'node:os';

// Actual Chrome and wall-clock requestAnimationFrame. Fake private images only:
// this browser suite never writes to HAVANA's real D1, R2 or accounts.
const dist=resolve('apps/pwa/dist');
assert.ok(existsSync(join(dist,'book.html')),'Build PWA first');
const candidates=['google-chrome','google-chrome-stable','chromium','chromium-browser'];
const browser=candidates.find(x=>spawnSync('which',[x],{encoding:'utf8'}).status===0);
assert.ok(browser,'Chrome/Chromium required');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css',
 '.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const pages=Array.from({length:6},(_,i)=>({
 id:'book-qa-'+i,position:(i+1)*100,published:true,fit:'cover',
 url:'/api/book/media/'+String(i+1).repeat(32)
}));
const boot=[
 'window.ReactNativeWebView={postMessage(message){',
 'if(message==="havana-v2-book-ready")',
 'queueMicrotask(()=>dispatchEvent(new CustomEvent("havana-v2-book-auth",{detail:"'+('A'.repeat(64))+'"})));',
 '}};',
 'const originalFetch=window.fetch.bind(window);let refreshCount=0;',
 'window.fetch=(input,options)=>{',
 'const name=typeof input==="string"?input:input.url;',
 'if(name.includes("/api/book/pages")){refreshCount++;',
 'return Promise.resolve(new Response(JSON.stringify({section:"BOOK HAVANA NICE",',
 'pages:'+JSON.stringify(pages)+'.map(p=>({...p,url:p.url+"?grant="+refreshCount}))',
 '}),{status:200,headers:{"content-type":"application/json"}}));}',
 'return originalFetch(input,options);};'
].join('\n');
const server=createServer((req,res)=>{
 const name=new URL(req.url||'/', 'http://127.0.0.1').pathname;
 if(name.startsWith('/api/book/media/')){
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="900"><rect width="640" height="900" fill="#284a39"/><path d="M10 450 L640 600" stroke="#efe6ce" stroke-width="40"/></svg>';
  res.writeHead(200,{'content-type':'image/svg+xml','cache-control':'no-store'});res.end(svg);return;
 }
 const file=resolve(dist,'.'+name);
 if(!file.startsWith(dist+sep)||!existsSync(file)){res.writeHead(404);res.end();return}
 res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});
 res.end(readFileSync(file));
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const servePort=server.address().port;
const profile=mkdtempSync(join(tmpdir(),'havana-book-cdp-'));
const cdpPort=9339;
const chrome=spawn(browser,[
 '--headless=new','--no-sandbox','--disable-dev-shm-usage',
 '--no-first-run','--no-default-browser-check',
 '--remote-debugging-port='+cdpPort,'--remote-allow-origins=*',
 '--user-data-dir='+profile,'--window-size=1200,900','about:blank'
],{stdio:['ignore','ignore','pipe']});
let errors='';chrome.stderr.on('data',v=>errors=(errors+v.toString()).slice(-2500));
const pending=new Map();
let ws,sequence=0;
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
function rpc(method,params={},timeout=12000){
 return new Promise((resolve,reject)=>{
  const id=++sequence;
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},timeout);
  pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},
   reject:e=>{clearTimeout(timer);reject(e)}});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function js(expression,timeout=17000){
 const reply=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeout);
 if(reply.result?.exceptionDetails)throw Error('Chrome exception: '+
  JSON.stringify(reply.result.exceptionDetails).slice(0,1000));
 return reply.result?.result?.value;
}
async function attach(){
 for(let i=0;i<110;i++){
  if(chrome.exitCode!==null)throw Error('Chrome exited: '+errors);
  try{
   const response=await fetch('http://127.0.0.1:'+cdpPort+'/json');
   const items=await response.json();
   const page=items.find(p=>p.type==='page'&&p.webSocketDebuggerUrl);
   if(page){
    ws=new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((done,fail)=>{ws.onopen=done;ws.onerror=()=>fail(Error('CDP connect'))});
    ws.onmessage=event=>{
     const data=JSON.parse(event.data);
     if(data.id&&pending.has(data.id)){
      const task=pending.get(data.id);pending.delete(data.id);
      if(data.error)task.reject(Error(JSON.stringify(data.error)));else task.resolve(data);
     }
    };
    return;
   }
  }catch{}
  await sleep(100);
 }
 throw Error('Chrome DevTools not ready: '+errors);
}
const scenario=[
 '(async()=>{',
 'const sleep=ms=>new Promise(r=>setTimeout(r,ms));',
 'const until=async(fn,label)=>{for(let i=0;i<80;i++){if(fn())return;await sleep(50);}throw Error("Timeout "+label)};',
 'await until(()=>document.querySelector(".hn-book-flip-host .stf__wrapper"),"BOOK mounted");',
 'await sleep(120);',
 'const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};',
 'const snap=()=>{const stage=document.querySelector(".hn-book-stage");',
 'const wrapper=document.querySelector(".hn-book-flip-host .stf__wrapper");',
 'return {stage:rect(stage),wrapper:rect(wrapper),x:scrollX,y:scrollY,',
 'docWidth:document.documentElement.scrollWidth,width:innerWidth,',
 'count:document.querySelector(".hn-book-counter strong")?.textContent?.trim(),',
 'hosts:document.querySelectorAll(".hn-book-flip-host").length}};',
 'const original=snap();',
 'if(original.stage.h<200||original.wrapper.h<200)throw Error("Collapsed "+JSON.stringify(original));',
 'const equal=(x,y)=>Math.abs(x-y)<1.5;',
 'const stable=(a,b)=>equal(a.stage.x,b.stage.x)&&equal(a.stage.y,b.stage.y)&&',
 'equal(a.stage.w,b.stage.w)&&equal(a.stage.h,b.stage.h)&&equal(a.wrapper.h,b.wrapper.h)&&',
 'equal(a.x,b.x)&&equal(a.y,b.y)&&b.docWidth<=b.width+2&&b.hosts===1;',
 'const next=document.querySelector("button[aria-label=\\"Página siguiente\\"]");',
 'if(!next||next.disabled)throw Error("Next is disabled");',
 'next.click();await until(()=>snap().count!==original.count,"first turn");',
 'await sleep(100);const first=snap();',
 'if(!stable(original,first))throw Error("First turn shifted viewport "+JSON.stringify({original,first}));',
 'const stage=document.querySelector(".hn-book-stage"),r=stage.getBoundingClientRect();',
 'const x=r.left+r.width*.8,y=r.top+r.height*.5;',
 'stage.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,pointerId:9,isPrimary:true,pointerType:"touch",clientX:x,clientY:y}));',
 'stage.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,pointerId:9,isPrimary:true,pointerType:"touch",clientX:x,clientY:y}));',
 'await until(()=>snap().count!==first.count,"quick tap");',
 'await sleep(100);const tapped=snap();',
 'if(!stable(original,tapped))throw Error("Tap shifted viewport "+JSON.stringify({original,tapped}));',
 'dispatchEvent(new Event("havana-v2-book-refresh"));await sleep(180);',
 'const renewed=snap();',
 'if(!stable(original,renewed))throw Error("Grant refresh rebuilt book "+JSON.stringify({original,renewed}));',
 'return {original,first,tapped,renewed};',
 '})()'
].join('\n');
try{
 await attach();
 await rpc('Page.enable');await rpc('Runtime.enable');
 await rpc('Page.addScriptToEvaluateOnNewDocument',{source:boot});
 for(const [width,height,label] of [[390,844,'phone'],[1024,800,'desktop']]){
  await rpc('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
  await rpc('Page.navigate',{url:'http://127.0.0.1:'+servePort+'/book.html'});
  const result=await js(scenario,17500);
  assert.ok(result,'Browser BOOK test must return result');
  assert.equal(result.original.width,width,'Actual Chrome emulated width mismatch');
  console.log('BOOK 3D '+label+': PASS '+result.original.count+' -> '+
   result.first.count+' -> '+result.tapped.count+
   '; stage y='+result.original.stage.y+' -> '+result.renewed.stage.y+
   ', instances='+result.renewed.hosts);
 }
 console.log('PASS: real Chrome frame animation, mobile taps, stable layout and grant renewal');
}finally{
 try{ws?.close()}catch{}
 chrome.kill('SIGTERM');
 await new Promise(done=>server.close(done));
 rmSync(profile,{recursive:true,force:true});
}
