import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleAdminChat} from '../src/modules/admin/admin-chat.js';
const TOKEN='Q'.repeat(43),BASE='https://v2.example';
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
async function fixture(){
 const digest=await sha(TOKEN);
 const rows=[
  {seq:1,client_message_id:'aaaaaaaaaaaa',sender_id:'member:old',sender_name:'Noa',body:'Original',created_at:'2026-10-27T12:00:00.000Z',reply_to_seq:null,deleted_at:null,edited_at:null},
  {seq:2,client_message_id:'bbbbbbbbbbbb',sender_id:'member:new',sender_name:'Fer',body:'Respuesta',created_at:'2026-10-27T12:01:00.000Z',reply_to_seq:1,deleted_at:null,edited_at:null},
  {seq:3,client_message_id:'cccccccccccc',sender_id:'member:new',sender_name:'Fer',body:'[mensaje eliminado]',created_at:'2026-10-27T12:02:00.000Z',reply_to_seq:null,deleted_at:'2026-10-27T12:03:00.000Z',edited_at:null}
 ];
 const reactions=[{message_seq:1,actor_id:'member:new',emoji:'👍'}];
 const signals=[];
 const DB={prepare(sql){return {bind(...args){return {
   async first(){
    if(sql.includes('FROM chat_admin_sessions'))return args[0]===digest?{expires_at:Date.now()+90_000,revoked_at:null}:null;
    if(sql==='SELECT seq FROM chat_messages WHERE seq=?')return rows.find(m=>m.seq===args[0])??null;

    throw Error('Unexpected first: '+sql);
   },
   async all(){
    if(sql.startsWith('SELECT seq,client_message_id'))return {results:rows.filter(m=>!m.deleted_at&&(!sql.includes('seq<?')||m.seq<args[0])).sort((a,b)=>b.seq-a.seq).slice(0,args.at(-1))};
    if(sql.includes('FROM chat_reactions WHERE message_seq IN'))return {results:reactions.filter(r=>args.includes(r.message_seq))};
    if(sql.includes('FROM chat_media_objects'))return {results:[]};
    throw Error('Unexpected all '+sql);
   },
   async run(){
    if(sql.startsWith('UPDATE chat_messages SET reply_to_seq=NULL')){
     for(const row of rows)if(row.reply_to_seq===args[0])row.reply_to_seq=null;
     return {meta:{changes:1}};
    }
    if(sql.startsWith('DELETE FROM chat_reactions')){
     for(let i=reactions.length-1;i>=0;i--)if(reactions[i].message_seq===args[0])reactions.splice(i,1);
     return {meta:{changes:1}};
    }
    if(sql.startsWith('DELETE FROM chat_messages')){
     for(let i=rows.length-1;i>=0;i--)if(rows[i].seq===args[0])rows.splice(i,1);
     return {meta:{changes:1}};
    }
    throw Error('Unexpected run '+sql);
   }
  };}}},async batch(statements){return Promise.all(statements.map(x=>x.run()))}};
 const env={DB,V2_ADMIN_LOGIN_MODE:'enabled',V2_ADMIN_LOGIN_SECRET:'S'.repeat(48),
  CHAT_ROOMS:{idFromName:x=>x,get:()=>({fetch:async(url,request)=>{signals.push({url,payload:JSON.parse(request.body)});return Response.json({ok:true})}})}};
 return {env,rows,reactions,signals};
}
async function request(f,method,path,valid=true){
 const req=new Request(BASE+path,{method,headers:valid?{authorization:'Bearer '+TOKEN}:{}});
 const response=await handleAdminChat(req,f.env,new URL(req.url),'',(v,status=200)=>Response.json(v,{status}));
 return {status:response.status,json:await response.json()};
}
test('only Administrator can read or remove messages',async()=>{
 const f=await fixture();
 assert.equal((await request(f,'GET','/api/chat/admin/messages',false)).status,401);
 assert.equal((await request(f,'DELETE','/api/chat/admin/messages/1',false)).status,401);
 assert.equal(f.rows.length,3);
});
test('history excludes all old deletion notices and includes named authors',async()=>{
 const f=await fixture(),r=await request(f,'GET','/api/chat/admin/messages');
 assert.equal(r.status,200);
 assert.deepEqual(r.json.messages.map(m=>m.senderName),['Noa','Fer']);
 assert.equal((await request(f,'GET','/api/chat/admin/messages?beforeSeq=2')).json.messages.length,1);
});
test('moderation physically removes message, reactions and reply reference',async()=>{
 const f=await fixture(),r=await request(f,'DELETE','/api/chat/admin/messages/1');
 assert.equal(r.status,200);
 assert.deepEqual(r.json,{ok:true,seq:1});
 assert.equal(f.rows.some(m=>m.seq===1),false);
 assert.equal(f.rows.find(m=>m.seq===2).reply_to_seq,null);
 assert.deepEqual(f.reactions,[]);
 assert.deepEqual(f.signals,[{url:'https://internal/admin-chat-message-deleted',payload:{seq:1}}]);
 assert.equal((await request(f,'DELETE','/api/chat/admin/messages/1')).status,404);
});
test('one deletion implementation, broadcast event and CORS preflight',()=>{
 const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
 const helper=readFileSync(new URL('../src/modules/chat/message-removal.js',import.meta.url),'utf8');
 assert.match(source,/deleteChatMessageRecord\(this.env,input.seq\)/);
 assert.match(source,/this.broadcast\(\{type:'chat.deleted',seq:input.seq\}\)/);
 assert.match(source,/'chat.deleted':'admin.chat.deleted'/);
 assert.match(source,/'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS'/);
 assert.match(helper,/UPDATE chat_messages SET reply_to_seq=NULL/);
 assert.match(helper,/DELETE FROM chat_reactions/);
 assert.match(helper,/DELETE FROM chat_messages/);
});
