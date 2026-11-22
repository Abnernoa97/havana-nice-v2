// Same-origin, expiring artwork bridge for iOS Media Session.
// All access is still authorized by the short-lived R2 grant in the Worker.
// Do not cache private photos or expose the R2 object key.
const BACKEND='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
const CAPABILITY=/^[a-f0-9]{32}$/;
async function artwork(context,head=false){
 const token=context.params?.token;
 if(typeof token!=='string'||!CAPABILITY.test(token))
  return new Response('Not found',{status:404,headers:{'cache-control':'private,no-store'}});
 let response;
 try{
  response=await fetch(BACKEND+'/api/audio/media/'+token,{
   method:head?'HEAD':'GET',
   headers:{'Accept':'image/jpeg,image/png,image/webp'},
   redirect:'error',
   cf:{cacheTtl:0,cacheEverything:false}
  });
 }catch{return new Response('Artwork unavailable',{status:502,headers:{'cache-control':'private,no-store'}});}
 if(!response.ok)return new Response('Artwork not found',{
  status:response.status===404?404:502,
  headers:{'cache-control':'private,no-store'}
 });
 const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 if(!['image/jpeg','image/png','image/webp'].includes(mime)){
  await response.body?.cancel().catch(()=>{});
  return new Response('Not an image',{status:415,headers:{'cache-control':'private,no-store'}});
 }
 const headers=new Headers({
  'content-type':mime,'cache-control':'private,no-store,max-age=0',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer'
 });
 const size=response.headers.get('content-length');
 if(size&&/^\d+$/.test(size))headers.set('content-length',size);
 return new Response(head?null:response.body,{status:200,headers});
}
export const onRequestGet=context=>artwork(context,false);
export const onRequestHead=context=>artwork(context,true);
