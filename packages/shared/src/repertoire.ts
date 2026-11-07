import {HAVANA_V2_DEV_API_BASE_URL as API} from './api-base';
export type RepertoireSong={
 id:string;title:string;artist:string;category:string;position:number;active:boolean;
 referenceUrl:string;version:number;updatedAt:string;
};
export type RepertoireSongInput=Omit<RepertoireSong,'id'|'version'|'updatedAt'>;
export type RepertoireEventItem={
 id:string;eventId:string;songId:string|null;title:string;artist:string;
 referenceUrl:string;position:number;completed:boolean;updatedAt:string;
};
async function read<T>(token:string,path:string):Promise<T>{
 const response=await fetch(API+path,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},cache:'no-store'});
 const data=await response.json() as T&{error?:string};
 if(!response.ok)throw Error(data.error||'No se pudo cargar Repertorio.');
 return data;
}
export async function getRepertoireSongs(token:string,admin=false):Promise<RepertoireSong[]>{
 const songs:RepertoireSong[]=[];
 for(let offset=0;offset<=10000;offset+=250){
  const result=await read<{songs:RepertoireSong[];hasMore:boolean}>(token,
   (admin?'/api/repertoire/admin/songs':'/api/repertoire/songs')+'?offset='+offset);
  songs.push(...result.songs);
  if(!result.hasMore)return songs;
 }
 throw Error('Hay demasiadas canciones. Contacta al Administrador.');
}
export async function getEventRepertoire(token:string,eventId:string,admin=false):Promise<RepertoireEventItem[]>{
 const prefix=admin?'/api/repertoire/admin/events/':'/api/repertoire/events/';
 const value=await read<{items:RepertoireEventItem[]}>(token,prefix+encodeURIComponent(eventId)+'/items');
 return value.items;
}

/** Read all songs in events currently assigned to this authenticated musician.
 * One paginated request per 250 songs, not one request per calendar event. */
export async function getAssignedEventRepertoire(token:string):Promise<RepertoireEventItem[]>{
 const items:RepertoireEventItem[]=[];
 for(let offset=0;offset<=10000;offset+=250){
  const page=await read<{items:RepertoireEventItem[];hasMore:boolean}>(
   token,'/api/repertoire/events/assigned?offset='+offset);
  items.push(...page.items);
  if(!page.hasMore)return items;
 }
 throw Error('Demasiadas canciones por evento. Contacta al Administrador.');
}
export function safeRepertoireLink(value:string):string|null{
 try{const u=new URL(value);return u.protocol==='https:'?u.toString():null;}catch{return null;}
}
