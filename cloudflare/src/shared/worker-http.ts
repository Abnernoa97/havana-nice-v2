// HAVANA NICE V2 · single JSON response policy used by the Worker router
// and its existing ChatRoom Durable Object. Never cache private material.
export function respond(data:unknown,status=200,origin=''){
 return new Response(JSON.stringify(data),{status,headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':origin||'https://havana-nice-v2-dev.pages.dev',
  'vary':'Origin',
 }});
}
