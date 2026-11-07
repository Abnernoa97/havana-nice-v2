import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {join,resolve,sep,extname} from 'node:path';

// Browser-only regression test for the BUILT BOOK, not a second renderer.
// It runs a fake six-photo edition in memory: no D1/R2 writes, no accounts,
// no changes to live Book or Familia media.
const dist=resolve('apps/pwa/dist');
assert.ok(existsSync(join(dist,'book.html')),'Build PWA before the BOOK browser QA');

const candidates=['google-chrome','google-chrome-stable','chromium','chromium-browser'];
const executable=candidates.find(cmd=>spawnSync('which',[cmd],{encoding:'utf8'}).status===0);
assert.ok(executable,'A real Chromium/Chrome binary is required for turn+layout QA');

const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css',
 '.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const pages=Array.from({length:6},(_,i)=>({
 id:'browser-qa-page-'+i,
 url:'/api/book/media/'+String(i+1).repeat(32),
 fit:'cover',
 position:(i+1)*100,
 published:true
}));
const bootstrap=`<script>
// Chrome virtual-time moves timers without rendering normal display frames.
// This QA-only window uses deterministic 60fps callbacks so we can assert
// real StPageFlip state changes without changing any production source.
window.requestAnimationFrame=(callback)=>setTimeout(()=>callback(performance.now()),16);
window.cancelAnimationFrame=(id)=>clearTimeout(id);
window.ReactNativeWebView={
 postMessage(message){
  if(message==='havana-v2-book-ready')
   queueMicrotask(()=>dispatchEvent(new CustomEvent('havana-v2-book-auth',
    {detail:'${'A'.repeat(64)}'})));
 }
};
const getFetch=window.fetch.bind(window);
let renew=0;
window.fetch=(input,options)=>{
 const address=typeof input==='string'?input:input.url;
 if(address.includes('/api/book/pages')){
  renew++;
  const pages=${JSON.stringify(pages)}.map(p=>({...p,url:p.url.slice(0,-1)+(renew%10)}));
  return Promise.resolve(new Response(JSON.stringify({section:'BOOK HAVANA NICE',pages}),
   {status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*'}}));
 }
 return getFetch(input,options);
};
</script>`;
const fixture=`<script>
(async()=>{
 window.__qaRafCount=0;
 const frame=()=>{window.__qaRafCount++;requestAnimationFrame(frame);};
 requestAnimationFrame(frame);
 const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
 const wait=async(selector)=>{
  for(let i=0;i<75;i++){
   const el=document.querySelector(selector);
   if(el)return el;
   await sleep(80);
  }
  throw Error('Missing '+selector);
 };
 const rect=el=>{
  const r=el.getBoundingClientRect();
  return {x:r.x,y:r.y,width:r.width,height:r.height};
 };
 const measure=()=>{
  const stage=document.querySelector('.hn-book-stage');
  const wrapper=document.querySelector('.hn-book-flip-host .stf__wrapper');
  return {stage:rect(stage),wrapper:rect(wrapper),scrollX:scrollX,
   scrollY:scrollY,docWidth:document.documentElement.scrollWidth,
   windowWidth:innerWidth,
   count:document.querySelector('.hn-book-counter strong')?.textContent?.trim(),
   turning:!!document.querySelector('.hn-book-turning'),
   pageElements:document.querySelectorAll('.stf__item').length,
   samplePage:document.querySelector('.stf__item')?.style.transform||'',
   hosts:document.querySelectorAll('.hn-book-flip-host').length,
   rafCount:window.__qaRafCount||0,
   time:performance.now(),engine:engineStatus()};
 };
 // Inspect React's mounted ref ONLY in this throwaway browser fixture.
 // No instrumentation or debug API is added to production components.
 const engine=()=>{
  const stage=document.querySelector('.hn-book-stage');
  if(!stage)return null;
  const key=Object.keys(stage).find(name=>name.startsWith('__reactFiber
 const stable=(a,b)=>
  near(a.stage.x,b.stage.x)&&near(a.stage.y,b.stage.y)&&
  near(a.stage.width,b.stage.width)&&near(a.stage.height,b.stage.height)&&
  near(a.wrapper.height,b.wrapper.height)&&
  near(a.scrollX,b.scrollX)&&near(a.scrollY,b.scrollY)&&
  b.docWidth<=b.windowWidth+2&&b.hosts===1;
 try{
  await wait('.hn-book-flip-host .stf__wrapper');
  await sleep(200);
  const initial=measure();
  if(initial.stage.height<150||initial.wrapper.height<150)
   throw Error('BOOK stage/wrapper collapsed: '+JSON.stringify(initial));
  const next=document.querySelector('button[aria-label="Página siguiente"]');
  if(!next||next.disabled)throw Error('Next button not ready');
  next.click();await sleep(900);
  const second=measure();
  if(second.count===initial.count||!stable(initial,second)){
   const mounted=engine();
   if(mounted&&second.count===initial.count){
    mounted.flipNext('bottom');
    await sleep(900);
   }
   throw Error('First flip moved viewport or missed animation: '+
    JSON.stringify({initial,second,manual:measure()}));
  }
  const stage=document.querySelector('.hn-book-stage');
  const r=stage.getBoundingClientRect(),x=r.left+r.width*.81,y=r.top+r.height*.55;
  for(const name of ['pointerdown','pointerup'])
   stage.dispatchEvent(new PointerEvent(name,{bubbles:true,pointerId:1,
    isPrimary:true,clientX:x,clientY:y,pointerType:'touch'}));
  await sleep(900);
  const third=measure();
  if(third.count===second.count||!stable(initial,third))
   throw Error('Quick tap failed or shifted viewport: '+JSON.stringify({second,third}));
  dispatchEvent(new Event('havana-v2-book-refresh'));
  await sleep(180);
  const renewed=measure();
  if(!stable(initial,renewed))
   throw Error('Grant renewal recreated BOOK or shifted viewport: '+JSON.stringify(renewed));
  const success={initial,second,third,renewed};
  document.documentElement.setAttribute('data-book-browser-qa','PASS');
  document.documentElement.setAttribute('data-book-browser-details',JSON.stringify(success));
 }catch(error){
  document.documentElement.setAttribute('data-book-browser-qa','FAIL');
  document.documentElement.setAttribute('data-book-browser-error',String(error.message||error));
 }
})();
</script>`;

let page=readFileSync(join(dist,'book.html'),'utf8');
assert.ok(page.includes('</head>')&&page.includes('</body>'));
page=page.replace('</head>',bootstrap+'</head>')
 .replace('</body>',fixture+'</body>');

const server=createServer((req,res)=>{
 const pathname=new URL(req.url||'/', 'http://localhost').pathname;
 if(pathname==='/book-browser-test.html'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(page);return;
 }
 const file=resolve(dist,'.'+pathname);
 if(!file.startsWith(dist+sep)||!existsSync(file)){
  res.writeHead(404);res.end();return;
 }
 res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});
 res.end(readFileSync(file));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const port=server.address().port;
try{
 for(const [size,label] of [['390,844','phone'],['1024,800','desktop']]){
  const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--disable-background-networking','--no-first-run','--no-default-browser-check',
   '--window-size='+size,'--virtual-time-budget=7200','--dump-dom',
   'http://127.0.0.1:'+port+'/book-browser-test.html'];
  const output=await new Promise((done,reject)=>{
   const child=spawn(executable,args,{stdio:['ignore','pipe','pipe']});
   let stdout='',stderr='';
   child.stdout.on('data',b=>{stdout+=b.toString()});
   child.stderr.on('data',b=>{stderr+=b.toString().slice(-1200)});
   child.on('error',reject);
   child.on('exit',code=>done({code,stdout,stderr}));
  });
  const marker=/data-book-browser-qa="([^"]+)"/.exec(output.stdout);
  const problem=/data-book-browser-error="([^"]+)"/.exec(output.stdout);
  console.log('BOOK '+label+': '+(marker?.[1]||'NO RESULT'),
   'code='+output.code,'error='+(problem?.[1]||'none'));
  assert.equal(output.code,0,'Chrome process failed: '+output.stderr.slice(-500));
  assert.equal(marker?.[1],'PASS','Real BOOK 3D browser QA failed: '+
   (problem?.[1]||output.stdout.slice(-500)));
 }
 console.log('PASS: Chrome phone+desktop stable stage, animated turns, quick taps, grant refresh');
}finally{
 await new Promise(done=>server.close(done));
}
));
  for(let fiber=key?stage[key]:null;fiber;fiber=fiber.return){
   for(let h=fiber.memoizedState;h;h=h.next){
    const value=h.memoizedState?.current;
    if(value&&typeof value.flipNext==='function'&&typeof value.getPageCollection==='function')
     return value;
   }
  }
  return null;
 };
 const engineStatus=()=>{
  const app=engine();
  if(!app)return 'not-found';
  try{return {current:app.getCurrentPageIndex(),total:app.getPageCount(),
   orientation:app.getOrientation(),state:app.getState(),bounds:app.getBoundsRect(),
   spread:app.getPageCollection().getCurrentSpreadIndex(),
   last:app.getPageCollection().getSpreadIndexByPage(app.getPageCount()-1)};}
  catch(e){return 'error:'+String(e);}
 };
 const near=(a,b)=>Math.abs(a-b)<1.2;
 const stable=(a,b)=>
  near(a.stage.x,b.stage.x)&&near(a.stage.y,b.stage.y)&&
  near(a.stage.width,b.stage.width)&&near(a.stage.height,b.stage.height)&&
  near(a.wrapper.height,b.wrapper.height)&&
  near(a.scrollX,b.scrollX)&&near(a.scrollY,b.scrollY)&&
  b.docWidth<=b.windowWidth+2&&b.hosts===1;
 try{
  await wait('.hn-book-flip-host .stf__wrapper');
  await sleep(200);
  const initial=measure();
  if(initial.stage.height<150||initial.wrapper.height<150)
   throw Error('BOOK stage/wrapper collapsed: '+JSON.stringify(initial));
  const next=document.querySelector('button[aria-label="Página siguiente"]');
  if(!next||next.disabled)throw Error('Next button not ready');
  next.click();await sleep(900);
  const second=measure();
  if(second.count===initial.count||!stable(initial,second))
   throw Error('First flip moved viewport or missed animation: '+JSON.stringify({initial,second}));
  const stage=document.querySelector('.hn-book-stage');
  const r=stage.getBoundingClientRect(),x=r.left+r.width*.81,y=r.top+r.height*.55;
  for(const name of ['pointerdown','pointerup'])
   stage.dispatchEvent(new PointerEvent(name,{bubbles:true,pointerId:1,
    isPrimary:true,clientX:x,clientY:y,pointerType:'touch'}));
  await sleep(900);
  const third=measure();
  if(third.count===second.count||!stable(initial,third))
   throw Error('Quick tap failed or shifted viewport: '+JSON.stringify({second,third}));
  dispatchEvent(new Event('havana-v2-book-refresh'));
  await sleep(180);
  const renewed=measure();
  if(!stable(initial,renewed))
   throw Error('Grant renewal recreated BOOK or shifted viewport: '+JSON.stringify(renewed));
  const success={initial,second,third,renewed};
  document.documentElement.setAttribute('data-book-browser-qa','PASS');
  document.documentElement.setAttribute('data-book-browser-details',JSON.stringify(success));
 }catch(error){
  document.documentElement.setAttribute('data-book-browser-qa','FAIL');
  document.documentElement.setAttribute('data-book-browser-error',String(error.message||error));
 }
})();
</script>`;

let page=readFileSync(join(dist,'book.html'),'utf8');
assert.ok(page.includes('</head>')&&page.includes('</body>'));
page=page.replace('</head>',bootstrap+'</head>')
 .replace('</body>',fixture+'</body>');

const server=createServer((req,res)=>{
 const pathname=new URL(req.url||'/', 'http://localhost').pathname;
 if(pathname==='/book-browser-test.html'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(page);return;
 }
 const file=resolve(dist,'.'+pathname);
 if(!file.startsWith(dist+sep)||!existsSync(file)){
  res.writeHead(404);res.end();return;
 }
 res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});
 res.end(readFileSync(file));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const port=server.address().port;
try{
 for(const [size,label] of [['390,844','phone'],['1024,800','desktop']]){
  const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--disable-background-networking','--no-first-run','--no-default-browser-check',
   '--window-size='+size,'--virtual-time-budget=7200','--dump-dom',
   'http://127.0.0.1:'+port+'/book-browser-test.html'];
  const output=await new Promise((done,reject)=>{
   const child=spawn(executable,args,{stdio:['ignore','pipe','pipe']});
   let stdout='',stderr='';
   child.stdout.on('data',b=>{stdout+=b.toString()});
   child.stderr.on('data',b=>{stderr+=b.toString().slice(-1200)});
   child.on('error',reject);
   child.on('exit',code=>done({code,stdout,stderr}));
  });
  const marker=/data-book-browser-qa="([^"]+)"/.exec(output.stdout);
  const problem=/data-book-browser-error="([^"]+)"/.exec(output.stdout);
  console.log('BOOK '+label+': '+(marker?.[1]||'NO RESULT'),
   'code='+output.code,'error='+(problem?.[1]||'none'));
  assert.equal(output.code,0,'Chrome process failed: '+output.stderr.slice(-500));
  assert.equal(marker?.[1],'PASS','Real BOOK 3D browser QA failed: '+
   (problem?.[1]||output.stdout.slice(-500)));
 }
 console.log('PASS: Chrome phone+desktop stable stage, animated turns, quick taps, grant refresh');
}finally{
 await new Promise(done=>server.close(done));
}
