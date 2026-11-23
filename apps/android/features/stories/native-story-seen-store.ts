import Storage from 'expo-sqlite/kv-store';

// Only private IDs (never pictures, R2 grants, tokens). Local to this Android
// installation, separated by musician identity, persisted across app restarts.
const PREFIX='hn-v2-story-seen:',LIMIT=150;
const memory=new Map<string,string[]>();
export function readNativeSeenStoryIds(actorId:string):string[]{
 if(!actorId)return [];
 try{
  const raw=Storage.getItemSync(PREFIX+actorId);
  if(raw){const items:unknown=JSON.parse(raw);
   if(Array.isArray(items))
    return items.filter((id):id is string=>typeof id==='string').slice(-LIMIT);}
 }catch{}
 return memory.get(actorId)||[];
}
export function saveNativeSeenStoryId(actorId:string,id:string):string[]{
 if(!actorId||!id)return [];
 const seen=readNativeSeenStoryIds(actorId);
 if(seen.includes(id))return seen;
 const next=[...seen,id].slice(-LIMIT);
 memory.set(actorId,next);
 try{Storage.setItemSync(PREFIX+actorId,JSON.stringify(next));}catch{}
 return next;
}
