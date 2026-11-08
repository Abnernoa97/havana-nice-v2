// One-time, in-memory reader context provided by the already-authorized Android
// shell. Never create a second session, persist the token, or place it in a URL.
export type NativeBookContext={
 token:string;
 memory:{eventId:string;title:string}|null;
};
const TOKEN=/^[A-Za-z0-9_-]{40,100}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseNativeBookContext(json:string|undefined|null):NativeBookContext|null{
 if(!json||json.length>600)return null;
 try{
  const data:unknown=JSON.parse(json);
  if(!data||typeof data!=='object')return null;
  const value=data as Record<string,unknown>;
  if(typeof value.token!=='string'||!TOKEN.test(value.token))return null;
  if(value.eventId!==undefined&&value.eventId!==''&&
    (typeof value.eventId!=='string'||!UUID.test(value.eventId)))return null;
  const title=typeof value.title==='string'?value.title.slice(0,160):'';
  const memory=typeof value.eventId==='string'&&UUID.test(value.eventId)
   ?{eventId:value.eventId.toLowerCase(),title}:null;
  return {token:value.token,memory};
 }catch{return null;}
}
