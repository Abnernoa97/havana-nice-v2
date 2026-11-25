// Session-owned, RAM-only lists. No storage, media, sockets or background polling.
export type NativeListSnapshot<T>={data:T|null;loading:boolean;error:string;version:number};
export class NativeModuleList<T>{
 private snapshot:NativeListSnapshot<T>={data:null,loading:true,error:'',version:0};
 private fetchedAt=0;
 private pending:{controller:AbortController;promise:Promise<void>}|null=null;
 private listeners=new Set<()=>void>();
 constructor(private readonly fallbackError:string,private readonly ttl=45_000,
  private readonly now=()=>Date.now()){}
 getSnapshot=()=>this.snapshot;
 subscribe=(listener:()=>void)=>{
  this.listeners.add(listener);return()=>{this.listeners.delete(listener);};
 };
 private publish(next:NativeListSnapshot<T>){
  this.snapshot=next;for(const notify of this.listeners)notify();
 }
 // A realtime change (including assignment revocation) clears the old list.
 // Do not show stale private data after a known invalidation.
 invalidate(){
  const old=this.pending;this.pending=null;old?.controller.abort();this.fetchedAt=0;
  if(this.snapshot.data!==null||!this.snapshot.loading||this.snapshot.error)
   this.publish({data:null,loading:true,error:'',version:this.snapshot.version});
 }
 load(loader:(signal:AbortSignal)=>Promise<T>):Promise<void>{
  if(this.pending)return this.pending.promise;
  if(this.snapshot.data!==null&&this.now()-this.fetchedAt<this.ttl)return Promise.resolve();
  const controller=new AbortController();
  const task={controller,promise:Promise.resolve()};
  this.pending=task;
  // A short same-session cache may paint immediately. On expired data, clear
  // before fetching; permission errors and network failures never retain it.
  this.publish({data:null,loading:true,error:'',version:this.snapshot.version});
  task.promise=Promise.resolve().then(async()=>{
   if(controller.signal.aborted)return;
   try{
    const data=await loader(controller.signal);
    if(this.pending!==task||controller.signal.aborted)return;
    this.fetchedAt=this.now();
    this.publish({data,loading:false,error:'',version:this.snapshot.version+1});
   }catch(e){
    if(this.pending!==task||controller.signal.aborted)return;
    this.publish({data:null,loading:false,error:e instanceof Error?e.message:this.fallbackError,version:this.snapshot.version});
   }finally{if(this.pending===task)this.pending=null;}
  });
  return task.promise;
 }
}
export function createNativeModuleLists<C,R>(){
 const calendar=new NativeModuleList<C>('No se pudo consultar Calendario.');
 const repertoire=new NativeModuleList<R>('No se pudo cargar Repertorio.');
 return {calendar,repertoire,invalidate:()=>{calendar.invalidate();repertoire.invalidate();}};
}

// Family metadata only. Owned by the authorized non-Chat shell; there is no
// persistent file cache, and no second notification connection.
export function createNativeFamilyLists<D,A>(){
 const directory=new NativeModuleList<D>('No se pudo abrir Familia HAVANA NICE.');
 const albums=new Map<string,NativeModuleList<A>>();
 const empty=new NativeModuleList<A>('No se pudo cargar el álbum.');
 return {directory,album:(actorId:string|null)=>{
  if(actorId===null)return empty;
  let list=albums.get(actorId);
  if(!list){list=new NativeModuleList<A>('No se pudo cargar el álbum.');albums.set(actorId,list);}
  return list;
 },invalidate:()=>{directory.invalidate();for(const list of albums.values())list.invalidate();}};
}
export type NativeFamilyLists<D,A>=ReturnType<typeof createNativeFamilyLists<D,A>>;
