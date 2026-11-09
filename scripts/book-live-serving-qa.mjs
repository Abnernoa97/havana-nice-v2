import assert from 'node:assert/strict';

// Probe what the real phone downloads from Cloudflare Pages, not a local Vite mock.
// Public static files only; no musician credentials or private API requests.
const base='https://havana-nice-v2.pages.dev';
const response=await fetch(base+'/book.html',{redirect:'follow',signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache'}});
const html=await response.text();
console.log('BOOK live document',JSON.stringify({status:response.status,finalPath:new URL(response.url).pathname,type:response.headers.get('content-type'),bytes:html.length}));
assert.equal(response.status,200,'Real BOOK page must return HTTP 200');
assert.equal(new URL(response.url).pathname,'/book.html','BOOK must not redirect to a login/SPA fallback');
assert.match(response.headers.get('content-type')||'',/text\/html/);
assert.match(html,/id="book-root"/,'The deployed document must be the real BOOK shell');
const asset=html.match(/<script\b[^>]*\bsrc="([^"]+\.js)"/i)?.[1];
assert.ok(asset,'Deployed BOOK must contain an actual built JavaScript file, not the development .tsx source');
const jsUrl=new URL(asset,base);
assert.equal(jsUrl.origin,base,'Bundled script must be same-origin and compatible with strict CSP');
const script=await fetch(jsUrl,{signal:AbortSignal.timeout(15000)});
const body=await script.text();
console.log('BOOK live JS',JSON.stringify({status:script.status,path:jsUrl.pathname,type:script.headers.get('content-type'),bytes:body.length}));
assert.equal(script.status,200,'BOOK main script must download on device');
assert.match(script.headers.get('content-type')||'',/javascript/);
assert.ok(body.length>100,'BOOK JS bundle must not be empty');
console.log('SUCCESS: live Pages BOOK serves expected HTML and executable production JavaScript');
