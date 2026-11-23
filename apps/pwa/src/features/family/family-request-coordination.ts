// A stale media request may settle after a new live invalidation and must not
// remove the newer in-flight request for the same private album.
export function finishFamilyAlbumRequest<T>(
 pending:Map<string,Promise<T>>,actorId:string,request:Promise<T>,
):boolean{
 if(pending.get(actorId)!==request)return false;
 pending.delete(actorId);
 return true;
}
