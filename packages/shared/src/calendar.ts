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
  if(!res.ok)throw Error(data.error||'Calendario no disponible ('+res.status+')');
  results.push(...data.events);
  if(!data.hasMore)return results;
 }
 throw Error('Demasiadas fechas. Contacta al Administrador.');
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
export function calendarEventCompleted(item:Pick<CalendarEvent,'dateSort'|'timeZone'|'status'>,now=new Date()):boolean{
 if(item.status!=='confirmed'||!item.dateSort||!/^\d{4}-\d{2}-\d{2}$/.test(item.dateSort))return false;
 try{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:item.timeZone,
   year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=(type:string)=>parts.find(p=>p.type===type)?.value||'';
  const today=value('year')+'-'+value('month')+'-'+value('day');
  return item.dateSort<today;
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
