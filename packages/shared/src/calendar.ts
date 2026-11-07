export type CalendarEventStatus='tentative'|'confirmed'|'cancelled';
export interface CalendarEvent {
 id:string;date:string;timeZone:string;title:string;venue:string;city:string;
 callTime:string;soundcheckTime:string;arrivalTime:string;showTime:string;endTime:string;
 wardrobe:string;details:string;contactName:string;contactPhone:string;notes:string;
 mapUrl:string;status:CalendarEventStatus;statusText:string;version:number;updatedAt:string;
 recipientIds?:string[]; // Administrator only; not returned to musicians.
}
export type CalendarEventInput=Omit<CalendarEvent,'id'|'version'|'updatedAt'> & {recipientIds:string[]};
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
export function safeCalendarMapUrl(text:string):string|null{
 try{
  const url=new URL(text);
  return url.protocol==='https:'?url.toString():null;
 }catch{return null;}
}
