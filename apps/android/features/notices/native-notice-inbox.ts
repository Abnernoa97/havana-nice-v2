import type {MemberNoticeInbox} from '@havana/shared';

// One RAM-only inbox for the authenticated shell. UI and badge share it.
// No push registration, transport, disk storage or additional timers.
type Snapshot={inbox:MemberNoticeInbox|null;loading:boolean;error:string;marking:boolean};
type Read=(signal:AbortSignal)=>Promise<MemberNoticeInbox>;
type Mark=(id?:string)=>Promise<void>;
type Pending={controller:AbortController;promise:Promise<void>};

export function createNativeNoticeInbox(read:Read,write:Mark,isDenied:(error:unknown)=>boolean,now=()=>Date.now()){
 let snapshot:Snapshot={inbox:null,loading:true,error:'',marking:false};
 let active=false,dirty=true,lastSuccess=0;
 let pending:Pending|null=null;
 const listeners=new Set<()=>void>();
 const publish=(patch:Partial<Snapshot>)=>{
  snapshot={...snapshot,...patch};
  for(const listener of listeners)listener();
 };
 const subscribe=(listener:()=>void)=>{
  listeners.add(listener);return()=>{listeners.delete(listener);};
 };
 const getSnapshot=()=>snapshot;
 const setActive=(next:boolean)=>{
  if(active===next)return;
  active=next;
  if(!active){
   dirty=true;
   const old=pending;pending=null;old?.controller.abort();
  }
 };
 const report=(error:unknown,fallback:string)=>{
  const denied=isDenied(error);
  if(denied){lastSuccess=0;dirty=true;}
  publish({...(denied?{inbox:null}:{}),loading:false,
   error:error instanceof Error?error.message:fallback});
 };
 const refresh=(force=false):Promise<void>=>{
  if(force)dirty=true;
  if(!active)return Promise.resolve();
  if(pending)return pending.promise;
  if(!dirty&&snapshot.inbox!==null&&now()-lastSuccess<30_000)return Promise.resolve();
  const task:Pending={controller:new AbortController(),promise:Promise.resolve()};
  pending=task;
  if(snapshot.inbox===null)publish({loading:true});
  const current=()=>active&&pending===task&&!task.controller.signal.aborted;
  task.promise=Promise.resolve().then(async()=>{
   try{
    while(current()){
     dirty=false;
     try{
      const inbox=await read(task.controller.signal);
      if(!current())return;
      if(dirty)continue;
      lastSuccess=now();publish({inbox,loading:false,error:''});
     }catch(error){
      if(!current())return;
      if(dirty)continue;
      report(error,'No se pudieron cargar las notificaciones.');
      dirty=true;
     }
     break;
    }
   }finally{if(pending===task)pending=null;}
  });
  return task.promise;
 };
 const mark=async(id?:string)=>{
  if(!active||snapshot.marking)return;
  publish({marking:true,error:''});
  try{
   await write(id);
   // No optimistic decrement: the server knows the exact unread total,
   // including notices outside the latest 60 rows.
   await refresh(true);
  }catch(error){
   report(error,'No se pudo marcar como leído.');
  }finally{publish({marking:false});}
 };
 return {getSnapshot,subscribe,setActive,refresh,mark};
}
