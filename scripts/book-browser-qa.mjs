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
async function swipe(x1,y1,x2,y2){
 await rpc('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y:y1,id:1}]});
 for(let step=1;step<=7;step++){
  await sleep(25);
  await rpc('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{
   x:x1+(x2-x1)*step/7,y:y1+(y2-y1)*step/7,id:1}]
  });
 }
 await rpc('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await sleep(440);
}
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
     if(data.method==='Fetch.requestPaused'){
      // Fake media bodies on the *actual* private Worker origin: exercise
      // image decoding and portrait/landscape fitting, never real R2.
      const paused=data.params;
      const numeric=/\/api\/book\/media\/([1-6])/.exec(paused.request.url);
      if(!numeric){
       void rpc('Fetch.continueRequest',{requestId:paused.requestId}).catch(()=>{});
       return;
      }
      const landscape=Number(numeric[1])%2===0;
      const width=landscape?900:600,height=landscape?520:900;
      const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+
       '" height="'+height+'"><rect width="100%" height="100%" fill="#214b38"/>'+
       '<circle cx="50%" cy="50%" r="100" fill="#eadfc6"/></svg>';
      void rpc('Fetch.fulfillRequest',{requestId:paused.requestId,responseCode:200,
       responseHeaders:[{name:'Content-Type',value:'image/svg+xml'},
        {name:'Access-Control-Allow-Origin',value:'*'}],
       body:Buffer.from(svg).toString('base64')}).catch(error=>{
        console.warn('BOOK test image intercept:',String(error));
       });
      return;
     }
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
 'await until(()=>{const img=document.querySelector(".hn-book-flip-host .hn-book-wide-photo>img");',
 'return img&&img.complete&&img.naturalWidth>img.naturalHeight;}, "landscape fit and real photo decoding");',
 'const wide=document.querySelector(".hn-book-flip-host .hn-book-wide-photo>img");',
 'if(getComputedStyle(wide).objectFit!=="contain")throw Error("Wide photo was cropped");',
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
 await rpc('Fetch.enable',{patterns:[{urlPattern:'*api/book/media/*',requestStage:'Request'}]});
 await rpc('Page.addScriptToEvaluateOnNewDocument',{source:boot});
 for(const [width,height,label] of [[390,844,'phone'],[1024,800,'desktop']]){
  await rpc('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
  await rpc('Emulation.setTouchEmulationEnabled',{enabled:width<700,maxTouchPoints:1});
  await rpc('Page.navigate',{url:'http://127.0.0.1:'+servePort+'/book.html'});
  const result=await js(scenario,17500);
  assert.ok(result,'Browser BOOK test must return result');
  assert.equal(result.original.width,width,'Actual Chrome emulated width mismatch');
  if(width<700){
   // Put content above and below BOOK so the app has an actual scroll range.
   // This is DOM created exclusively in the isolated Chrome test page.
   const start=await js(`(async()=>{
    for(const position of ['before','after']){
     const block=document.createElement('div');block.style.height='720px';
     block.dataset.testScrollSpacer=position;
     if(position==='before')document.body.prepend(block);else document.body.append(block);
    }
    await new Promise(r=>setTimeout(r,60));
    const stage=document.querySelector('.hn-book-stage');
    window.scrollTo(0,window.scrollY+stage.getBoundingClientRect().top-120);
    await new Promise(r=>setTimeout(r,100));
    const r=stage.getBoundingClientRect();
    const action=getComputedStyle(stage).touchAction;
    return {y:scrollY,count:document.querySelector('.hn-book-counter strong').textContent,
     x:r.left+r.width*.78,t:r.top+r.height*.64,
     touchAction:action,bookHeight:r.height,stageY:r.y};
   })()`);
   assert.ok(start.y>100,'Need a real scrollable test document');
   assert.match(start.touchAction,/pan-y/,'BOOK must permit browser vertical panning');
   await swipe(start.x,start.t,start.x,start.t-115);
   const vertical=await js(`({y:scrollY,
    count:document.querySelector('.hn-book-counter strong').textContent,
    hosts:document.querySelectorAll('.hn-book-flip-host').length})`);
   assert.ok(vertical.y>start.y+25,
    'Touch up/down over BOOK should scroll document (before '+start.y+', after '+vertical.y+')');
   assert.equal(vertical.count,start.count,'Vertical scroll must not turn a page');
   assert.equal(vertical.hosts,1,'Vertical scroll cannot recreate book');
   const h=await js(`(()=>{const stage=document.querySelector('.hn-book-stage');
    const r=stage.getBoundingClientRect();
    return {x:r.left+r.width*.82,y:r.top+r.height*.55,
     turning:!!stage.querySelector('.hn-book-turning'),
     nextDisabled:document.querySelector('button[aria-label="Página siguiente"]')?.disabled,
     pointInStage:!!document.elementFromPoint(r.left+r.width*.82,r.top+r.height*.55)?.closest('.hn-book-stage')}})()`);
   await swipe(h.x,h.y,h.x-135,h.y);
   // A complete page curl lasts 780 ms: inspect the final page, not the
   // middle of its animation (the touch synthesizer itself stops at 440 ms).
   await sleep(600);
   const sideways=await js(`({count:document.querySelector('.hn-book-counter strong').textContent,
    hosts:document.querySelectorAll('.hn-book-flip-host').length})`);
   assert.notEqual(sideways.count,vertical.count,'Horizontal swipe should turn a paper page: '+JSON.stringify({start,vertical,h,sideways}));
   assert.equal(sideways.hosts,1);
   console.log('BOOK real touch: vertical scroll '+start.y+' -> '+vertical.y+
    ', page unchanged '+vertical.count+'; horizontal swipe turns to '+sideways.count);
  }
  console.log('BOOK 3D '+label+': PASS '+result.original.count+' -> '+
   result.first.count+' -> '+result.tapped.count+
   '; stage y='+result.original.stage.y+' -> '+result.renewed.stage.y+
   ', instances='+result.renewed.hosts);
 }
 console.log('PASS: real Chrome frame animation, mobile taps, stable layout and grant renewal');
}finally{
 try{ws?.close()}catch{}
 const exit=chrome.exitCode!==null?Promise.resolve():
  new Promise(done=>chrome.once('exit',done));
 chrome.kill('SIGTERM');
 await Promise.race([exit,sleep(3000)]);
 await new Promise(done=>server.close(done));
 // Chromium's child renderer sometimes writes its profile after the parent
 // exits. Clean it best-effort; a transient temp-file race is not a BOOK bug.
 try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:150});}
 catch(error){console.warn('Chrome temp profile cleanup:',String(error));}
}
