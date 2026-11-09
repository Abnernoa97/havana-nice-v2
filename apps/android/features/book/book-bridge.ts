// Single in-memory bridge between the authorized Android shell and the
// existing PWA BOOK reader. No browser login, URL secrets, or persistent cache.
export const BOOK_ORIGIN='https://havana-nice-v2.pages.dev';
export const BOOK_PATH='/book';
export const BOOK_READER_URL=BOOK_ORIGIN+BOOK_PATH;
export type BookSessionPayload={token:string;eventId:string;title:string};

export function trustedBookUrl(raw:string):boolean{
 if(raw==='about:blank')return true;
 try{
  const url=new URL(raw);
  return url.origin===BOOK_ORIGIN&&url.pathname===BOOK_PATH&&!url.search&&!url.hash;
 }catch{return false;}
}

// Called only after the PWA reports it has installed the receiving listener.
// evaluateJavascript executes in the already loaded, origin-checked WebView.
// JSON is encoded *twice* to prevent any event title being interpreted as JS.
export function bookContextDeliveryScript(
 payload:BookSessionPayload,
 targetOrigin=BOOK_ORIGIN,
 targetPath=BOOK_PATH
):string{
 const encoded=JSON.stringify(JSON.stringify(payload));
 return '(function(){'+
  'if(location.origin!=='+JSON.stringify(targetOrigin)+
  '||location.pathname!=='+JSON.stringify(targetPath)+
  '||location.search||location.hash)return;'+
  'window.dispatchEvent(new CustomEvent("havana-v2-book-context",{detail:'+encoded+'}));'+
  '})();true;';
}
