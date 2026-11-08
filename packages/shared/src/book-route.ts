// Navigation metadata only. No bearer tokens, sessions or private media links in URLs.
export type PwaReaderTarget={kind:'book'}|{kind:'memory';eventId:string};
const BOOK_ORIGIN='https://havana-nice-v2.pages.dev/';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pwaReaderUrl(target:PwaReaderTarget):string{
 if(target.kind==='book')return BOOK_ORIGIN+'#reader=book';
 if(!UUID.test(target.eventId))throw new Error('Identificador de evento no válido');
 // Fragment stays out of the HTTP request and never contains session credentials.
 return BOOK_ORIGIN+'#reader=memory&event='+target.eventId.toLowerCase();
}

export function parsePwaReaderHash(value:string):PwaReaderTarget|null{
 if(value.length>125)return null;
 const params=new URLSearchParams(value.startsWith('#')?value.slice(1):value);
 if(params.get('reader')==='book'&&[...params.keys()].length===1)return {kind:'book'};
 const id=params.get('event');
 if(params.get('reader')==='memory'&&id&&UUID.test(id)&&
    [...params.keys()].length===2)return {kind:'memory',eventId:id.toLowerCase()};
 return null;
}
