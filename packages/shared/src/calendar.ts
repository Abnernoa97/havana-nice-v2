import {HAVANA_V2_DEV_API_BASE_URL} from './api-base';
export type CalendarEventStatus='tentative'|'confirmed'|'cancelled';
export interface CalendarEvent {
 id:string;date:string;timeZone:string;title:string;venue:string;city:string;
 callTime:string;soundcheckTime:string;arrivalTime:string;showTime:string;endTime:string;
 wardrobe:string;details:string;contactName:string;contactPhone:string;notes:string;
 mapUrl:string;status:CalendarEventStatus;statusText:string;version:number;updatedAt:string;
 dateSort?:string|null; // Validated ISO date; custom date text remains unchanged.
 memoryCount?:number; // Photos attached to this event; no private URLs in date listing.
 recipientIds?:string[]; // Administrator only; not returned to musicians.
}
export type CalendarEventInput=Omit<CalendarEvent,'id'|'version'|'updatedAt'|'dateSort'|'memoryCount'> & {recipientIds:string[]};
export interface CalendarEventList {events:CalendarEvent[];hasMore:boolean}
export class CalendarHttpError extends Error {
 constructor(message:string,public readonly status:number){super(message);this.name='CalendarHttpError';}
}
const PAGE=100;
// One endpoint and token from the existing V2 session. No second login/cache.
export async function getCalendarEvents(
 token:string,base:string,admin=false,signal?:AbortSignal
):Promise<CalendarEvent[]>{
 const results:CalendarEvent[]=[];
 for(let offset=0;offset<=10000;offset+=PAGE){
  const res=await fetch(base+(admin?'/api/calendar/admin/events':'/api/calendar/events')+
   '?offset='+offset,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},cache:'no-store',...(signal?{signal}:{})});
  const data=await res.json() as CalendarEventList&{error?:string};
  if(!res.ok)throw new CalendarHttpError(data.error||'Calendario no disponible ('+res.status+')',res.status);
  results.push(...data.events);
  if(!data.hasMore)return sortCalendarEvents(results);
 }
 throw Error('Demasiadas fechas. Contacta al Administrador.');
}
// The Administration form intentionally accepts free-text dates. Recognize
// explicit Spanish/English months for sorting and automatic completed stamps;
// never reinterpret ambiguous prose as a calendar day.
const CALENDAR_MONTHS:Record<string,number>={
 enero:1,ene:1,january:1,jan:1,
 febrero:2,feb:2,february:2,
 marzo:3,mar:3,march:3,
 abril:4,abr:4,april:4,apr:4,
 mayo:5,may:5,
 junio:6,jun:6,june:6,
 julio:7,jul:7,july:7,
 agosto:8,ago:8,august:8,aug:8,
 septiembre:9,setiembre:9,sep:9,sept:9,set:9,september:9,
 octubre:10,oct:10,october:10,
 noviembre:11,nov:11,november:11,
 diciembre:12,dic:12,dec:12,december:12
};
export function calendarSortDate(input:string):string|null{
 const value=input.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 let year=0,month=0,day=0;
 const iso=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
 const numeric=/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/.exec(value);
 const words=/^(\d{1,2})\s*(?:(?:de|del|d)\s+)?([a-z]+)\.?\s*(?:(?:de|del|d)\s+)?(\d{2}|\d{4})$/.exec(value);
 if(iso){year=Number(iso[1]);month=Number(iso[2]);day=Number(iso[3]);}
 else if(numeric){year=Number(numeric[3]);month=Number(numeric[2]);day=Number(numeric[1]);}
 else if(words){year=Number(words[3]);if(year<100)year+=2000;month=CALENDAR_MONTHS[words[2]]||0;day=Number(words[1]);}
 else return null;
 if(year<1900||year>2100||month<1||month>12||day<1||day>31)return null;
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 return String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}
export function sortCalendarEvents<T extends Pick<CalendarEvent,'id'|'date'|'dateSort'>>(events:readonly T[]):T[]{
 return [...events].sort((a,b)=>{
  const left=a.dateSort||calendarSortDate(a.date);
  const right=b.dateSort||calendarSortDate(b.date);
  if(left&&right)return left.localeCompare(right)||a.id.localeCompare(b.id);
  if(left)return -1;if(right)return 1;
  return a.date.localeCompare(b.date,'es')||a.id.localeCompare(b.id);
 });
}

export function calendarDate(date:string):string{
 const clean=date.trim();
 if(!clean)return 'Fecha por definir';
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
 if(!match)return clean; // Show exactly the administrator's entered text.
 const display=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),12);
 if(display.getFullYear()!==Number(match[1])||display.getMonth()!==Number(match[2])-1||display.getDate()!==Number(match[3]))return clean;
 return display.toLocaleDateString('es-MX',
  {weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
// A date is completed only after local midnight in the EVENT'S time zone.
// Free-form date strings are not guessed, and cancelled dates never get stamps.
export function calendarEventCompleted(item:Pick<CalendarEvent,'dateSort'|'timeZone'|'status'>&{date?:string},now=new Date()):boolean{
 const dateSort=item.dateSort||calendarSortDate(item.date||'');
 if(item.status!=='confirmed'||!dateSort)return false;
 try{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:item.timeZone,
   year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=(type:string)=>parts.find(p=>p.type===type)?.value||'';
  const today=value('year')+'-'+value('month')+'-'+value('day');
  return dateSort<today;
 }catch{return false;}
}
export interface CalendarMemoryPhoto {
 id:string;url:string;fit:'cover';position:number;
 originalUrl?:string;sizeBytes?:number;optimizedSizeBytes?:number;
}
export interface CalendarMemoryList {photos:CalendarMemoryPhoto[]}
const CALENDAR_MEDIA=/^\/api\/calendar\/photo\/[a-f0-9]{32}$/;
export function calendarMemoryUrl(path:string):string|null{
 try{
  const endpoint=new URL(HAVANA_V2_DEV_API_BASE_URL);
  const result=new URL(path,endpoint);
  return result.protocol==='https:'&&result.origin===endpoint.origin&&
   CALENDAR_MEDIA.test(result.pathname)?result.href:null;
 }catch{return null;}
}
function memoryEndpoint(eventId:string,admin:boolean){
 const root=HAVANA_V2_DEV_API_BASE_URL+(admin?'/api/calendar/admin/events/':'/api/calendar/events/');
 return root+encodeURIComponent(eventId)+'/photos';
}
export async function getCalendarMemories(token:string,eventId:string,admin=false):Promise<CalendarMemoryPhoto[]>{
 const result=await fetch(memoryEndpoint(eventId,admin),{
  headers:{Authorization:'Bearer '+token},cache:'no-store'
 });
 const data=await result.json() as CalendarMemoryList&{error?:string};
 if(!result.ok)throw new Error(data.error||'No se pudieron cargar las fotografías.');
 return data.photos||[];
}
async function calendarMediaMutation(token:string,eventId:string,path:string,init:RequestInit){
 const result=await fetch(memoryEndpoint(eventId,true)+path,{
  ...init,cache:'no-store',headers:{Authorization:'Bearer '+token,...init.headers}
 });
 const data=await result.json() as {id?:string;error?:string};
 if(!result.ok)throw new Error(data.error||'Error al guardar fotografía.');
 return data;
}
export async function addCalendarMemory(token:string,eventId:string,file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type))
  throw Error('Se requiere una fotografía JPG, PNG, WebP o HEIC.');
 if(!file.size||file.size>15*1024*1024)throw Error('Máximo 15 MB por fotografía.');
 const result=await calendarMediaMutation(token,eventId,'',{
  method:'POST',headers:{'Content-Type':file.type},body:file
 });
 if(!result.id)throw Error('Fotografía sin identificador.');
 return result.id;
}
export async function addCalendarMemoryWebp(token:string,eventId:string,id:string,blob:Blob,width:number,height:number):Promise<void>{
 if(blob.type!=='image/webp'||blob.size>5*1024*1024)throw Error('WebP inválido.');
 await calendarMediaMutation(token,eventId,'/'+encodeURIComponent(id)+'/optimized',{
  method:'POST',headers:{'Content-Type':'image/webp','X-Book-Width':String(width),
   'X-Book-Height':String(height)},body:blob
 });
}
export async function deleteCalendarMemory(token:string,eventId:string,id:string):Promise<void>{
 await calendarMediaMutation(token,eventId,'/'+encodeURIComponent(id),{method:'DELETE'});
}
export async function moveCalendarMemory(token:string,eventId:string,id:string,position:number):Promise<void>{
 await calendarMediaMutation(token,eventId,'/'+encodeURIComponent(id),{
  method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({position})
 });
}

export function safeCalendarMapUrl(text:string):string|null{
 try{
  const url=new URL(text);
  return url.protocol==='https:'?url.toString():null;
 }catch{return null;}
}
