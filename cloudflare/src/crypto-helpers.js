// HAVANA NICE V2 · one server-only credential/grant hashing primitive.
// Preserve lowercase SHA-256 hex values already stored in D1; no token migration.
const encoder=new TextEncoder();
export async function sha256Hex(value){
 const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(value));
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
