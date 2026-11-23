// A musician sees unread counts only for states not viewed on this PWA installation.
// Store IDs only, never private image capabilities, credentials, or media.
const PREFIX='hn-v2-story-seen:',LIMIT=150;
const memory=new Map<string,string[]>();
export function readSeenStoryIds(actorId:string|undefined):string[]{
 if(!actorId)return [];
 try{const saved=localStorage.getItem(PREFIX+actorId);
  if(saved){const data:unknown=JSON.parse(saved);
   if(Array.isArray(data))return data.filter((id):id is string=>typeof id==='string').slice(-LIMIT);}
 }catch{}
 return memory.get(actorId)||[];
}
export function saveSeenStoryId(actorId:string|undefined,id:string):string[]{
 if(!actorId||!id)return [];
 const prior=readSeenStoryIds(actorId);
 if(prior.includes(id))return prior;
 const next=[...prior,id].slice(-LIMIT);
 memory.set(actorId,next);
 try{localStorage.setItem(PREFIX+actorId,JSON.stringify(next));}catch{}
 return next;
}
