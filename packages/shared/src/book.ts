// BOOK HAVANA NICE · one private API shared with the authorized musician and Administrator.
// The original images always live in private R2; expiring grants are not bucket URLs.
import {HAVANA_V2_DEV_API_BASE_URL as API} from './api-base';
// Private image grants live for ten minutes on the Worker. Renew once before
// expiry only while a reader/editor is mounted; this is not sync polling.
export const BOOK_GRANT_RENEW_MS=8*60*1000;
export interface BookPage {
 id:string;
 url:string;
 fit:'cover'|'contain';
 position:number;
 published:boolean;
 sizeBytes?:number; // Admin-only R2 master bytes
 originalUrl?:string; // Admin-only, expiring, private original capability
 optimizedSizeBytes?:number; // 0 means original fallback
 optimizedWidth?:number|null;
 optimizedHeight?:number|null;
}
export interface BookDirectory {section:'BOOK HAVANA NICE';pages:BookPage[]}
export class BookApiError extends Error {
 constructor(message:string,readonly status:number){super(message);this.name='BookApiError';}
}
const JSON_HEADERS={'content-type':'application/json'};
const url=(admin:boolean)=>API+(admin?'/api/book/admin/pages':'/api/book/pages');
export async function getBookPages(token:string,admin=false):Promise<BookPage[]>{
 const res=await fetch(url(admin),{cache:'no-store',headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 const data=await res.json() as BookDirectory&{error?:string};
 if(!res.ok)throw new BookApiError(data.error||'No se pudo cargar BOOK HAVANA NICE.',res.status);
 return data.pages||[];
}
export function bookMediaUrl(value:string|null|undefined):string|null{
 if(!value)return null;
 try{
  const base=new URL(API),result=new URL(value,base);
  return result.protocol==='https:'&&result.origin===base.origin&&
   /^\/api\/(?:book\/media|calendar\/photo)\/[a-f0-9]{32}$/.test(result.pathname)?result.href:null;
 }catch{return null;}
}
export async function uploadBookPage(
 token:string,file:File,onProgress?:(loaded:number,total:number)=>void
):Promise<string>{
 if(!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type.toLowerCase()))
  throw new Error('Elige una imagen JPG, PNG, WebP, HEIC o HEIF.');
 if(!file.size||file.size>15*1024*1024)throw new Error('La imagen debe ocupar menos de 15 MB.');
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('POST',url(true));
  xhr.setRequestHeader('Authorization','Bearer '+token);
  xhr.setRequestHeader('Content-Type',file.type);
  xhr.responseType='json';
  xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(e.loaded,file.size);};
  xhr.onerror=()=>reject(new Error('La conexión se interrumpió durante la subida.'));
  xhr.onabort=()=>reject(new Error('Se canceló el envío.'));
  xhr.onload=()=>{
   const result=xhr.response as {id?:string;error?:string}|null;
   if(xhr.status>=200&&xhr.status<300&&result?.id)resolve(result.id);
   else reject(new BookApiError(result?.error||'No se pudo subir la página.',xhr.status));
  };
  xhr.send(file);
 });
}
// One endpoint for newly added AND existing pages. Only Admin can create
// derived R2 objects. The caller never supplies a public URL or storage key.
export async function uploadBookOptimized(
 token:string,pageId:string,file:Blob,width:number,height:number
):Promise<void>{
 if(file.type!=='image/webp'||file.size<100||file.size>5*1024*1024)
  throw new Error('BOOK necesita una imagen WebP válida menor a 5 MB.');
 if(!Number.isInteger(width)||!Number.isInteger(height)||
    width<1||height<1||Math.max(width,height)>2200)
  throw new Error('Dimensiones BOOK inválidas.');
 const res=await fetch(url(true)+'/'+encodeURIComponent(pageId)+'/optimized',{
  method:'POST',cache:'no-store',
  headers:{Authorization:'Bearer '+token,'Content-Type':'image/webp',
   'X-Book-Width':String(width),'X-Book-Height':String(height)},
  body:file
 });
 const data=await res.json() as {error?:string};
 if(!res.ok)throw new BookApiError(data.error||'No se pudo optimizar la página.',res.status);
}
async function mutateBook(token:string,id:string,method:'PUT'|'DELETE',body?:unknown){
 const res=await fetch(url(true)+'/'+encodeURIComponent(id),{
  method,cache:'no-store',
  headers:{Authorization:'Bearer '+token,...(body?JSON_HEADERS:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const data=await res.json() as {error?:string};
 if(!res.ok)throw new BookApiError(data.error||'No se pudo guardar el cambio.',res.status);
}
export async function updateBookPage(token:string,id:string,update:Partial<Pick<BookPage,'fit'|'published'|'position'>>){
 await mutateBook(token,id,'PUT',update);
}
export async function removeBookPage(token:string,id:string){
 await mutateBook(token,id,'DELETE');
}
