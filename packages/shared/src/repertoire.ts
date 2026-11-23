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
// Both API collections share the exact 250-item offset policy and hard cap.
async function readPages<T,K extends 'songs'|'items'>(
 token:string,route:string,key:K,overflowError:string,
):Promise<T[]>{
 const values:T[]=[];
 for(let offset=0;offset<=10000;offset+=250){
  const page=await read<Record<K,T[]>&{hasMore:boolean}>(token,route+'?offset='+offset);
  values.push(...page[key]);
  if(!page.hasMore)return values;
 }
 throw Error(overflowError);
}
export function getRepertoireSongs(token:string,admin=false):Promise<RepertoireSong[]>{
 return readPages<RepertoireSong,'songs'>(token,
  admin?'/api/repertoire/admin/songs':'/api/repertoire/songs',
  'songs','Hay demasiadas canciones. Contacta al Administrador.');
}
export async function getEventRepertoire(token:string,eventId:string,admin=false):Promise<RepertoireEventItem[]>{
 const prefix=admin?'/api/repertoire/admin/events/':'/api/repertoire/events/';
 const value=await read<{items:RepertoireEventItem[]}>(token,prefix+encodeURIComponent(eventId)+'/items');
 return value.items;
}

/** Read all songs in events currently assigned to this authenticated musician.
 * One paginated request per 250 songs, not one request per calendar event. */
export function getAssignedEventRepertoire(token:string):Promise<RepertoireEventItem[]>{
 return readPages<RepertoireEventItem,'items'>(
  token,'/api/repertoire/events/assigned','items',
  'Demasiadas canciones por evento. Contacta al Administrador.');
}
/** Exactly three musician sections. Unknown legacy categories remain visible
 * in ESPAÑOL until Administration reclassifies them. */
export const REPERTOIRE_SECTIONS=['ENGLISH','ESPAÑOL','INSTRUMENTALES'] as const;
export type RepertoireSection=typeof REPERTOIRE_SECTIONS[number];
export function repertoireSection(value:string):RepertoireSection{
 const key=value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 if(key.includes('INSTRUMENT'))return 'INSTRUMENTALES';
 if(key==='ENGLISH'||key==='INGLES')return 'ENGLISH';
 return 'ESPAÑOL';
}
export function safeRepertoireLink(value:string):string|null{
 try{const u=new URL(value);return u.protocol==='https:'?u.toString():null;}catch{return null;}
}
