// Read-only story refresh lifecycle. Uploads, deletes and image playback are
// independent. One GET in flight; a forced signal queues one reconciliation.
type Loader=(signal:AbortSignal,isCurrent:()=>boolean)=>Promise<boolean>;
type Pending={controller:AbortController;promise:Promise<void>};
export function createNativeStoryRefreshGate(now=()=>Date.now()){
 let active=false,dirty=true,lastSuccess=0;
 let pending:Pending|null=null;
 const setActive=(next:boolean)=>{
  if(active===next)return;
  active=next;
  if(!active&&pending){
   const old=pending;pending=null;dirty=true;old.controller.abort();
  }
 };
 const request=(load:Loader,force=false):Promise<void>=>{
  if(force)dirty=true;
  if(!active)return Promise.resolve();
  if(pending)return pending.promise;
  if(!dirty&&now()-lastSuccess<45_000)return Promise.resolve();
  const task:Pending={controller:new AbortController(),promise:Promise.resolve()};
  pending=task;
  const current=()=>active&&pending===task&&!task.controller.signal.aborted;
  task.promise=Promise.resolve().then(async()=>{
   try{
    while(current()){
     dirty=false;
     const ok=await load(task.controller.signal,()=>current()&&!dirty);
     if(!current())return;
     if(dirty)continue;
     if(ok)lastSuccess=now();
     else dirty=true;
     break;
    }
   }finally{if(pending===task)pending=null;}
  });
  return task.promise;
 };
 return {setActive,request};
}
