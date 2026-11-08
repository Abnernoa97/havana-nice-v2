import {getFamilyDirectory} from './family';
// Use the canonical authorized chat_members roster through the existing
// private directory API. Never create a parallel identity table or backend.
export type MusicianDirectoryEntry={actorId:string;name:string};
export async function getMusicianDirectory(token:string):Promise<MusicianDirectoryEntry[]>{
 const data=await getFamilyDirectory(token);
 return data.albums.map(({actorId,name})=>({actorId,name}));
}
