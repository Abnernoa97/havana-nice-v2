import test from 'node:test';
import assert from 'node:assert/strict';
import {memberPushCopy} from '../src/modules/notices/push-copy.js';

test('A real musician is identified in Chat and private message text stays off the lock screen',()=>{
 const message=memberPushCopy({kind:'chat.message',actorName:'Rafa',preview:'Contrato privado 123'});
 assert.deepEqual(message,{title:'HAVANA NICE · Chat',body:'Rafa envió un mensaje al Chat'});
 assert.doesNotMatch(JSON.stringify(message),/Contrato privado/);
 assert.equal(memberPushCopy({kind:'chat.message',actorName:'Andy',preview:'Nueva foto en Chat'}).body,
  'Andy envió una foto al Chat');
 assert.equal(memberPushCopy({kind:'chat.message',actorName:'Andy',preview:'Nuevo video en Chat'}).body,
  'Andy envió un video al Chat');
 assert.equal(memberPushCopy({kind:'chat.reaction',actorName:'Orly',emoji:'😂'}).body,
  'Orly reaccionó 😂 a tu mensaje');
});
test('Story publication, reactions, comments, voice and profile copy carry the right actor',()=>{
 assert.equal(memberPushCopy({kind:'story.created',actorName:'Fer',preview:'3 nuevos Estados publicados'}).body,
  'Fer publicó 3 Estados');
 assert.equal(memberPushCopy({kind:'story.comment',actorName:'Jali',preview:'Información privada'}).body,
  'Jali comentó tu Estado');
 assert.equal(memberPushCopy({kind:'story.voice',actorName:'Fer'}).body,
  'Fer envió un mensaje de voz a tu Estado');
 assert.equal(memberPushCopy({kind:'story.reaction',actorName:'Noah',emoji:'❤️'}).body,
  'Noah reaccionó ❤️ a tu Estado');
 assert.equal(memberPushCopy({kind:'profile.photo',actorName:'Rafa'}).body,
  'Rafa actualizó su foto de perfil');
});
test('Admin Familia notices explicitly identify the album owner and file type',()=>{
 assert.equal(memberPushCopy({kind:'family.media',actorName:'Fer',preview:'Nueva fotografía en Familia'}).body,
  'Administración agregó una foto al álbum de Fer');
 assert.equal(memberPushCopy({kind:'family.media',actorName:'Orly',preview:'Nuevo video en Familia'}).body,
  'Administración agregó un video al álbum de Orly');
});
test('User-provided text or unsafe names cannot enter lock screen copies',()=>{
 const copy=memberPushCopy({kind:'chat.message',actorName:'Andy\nSecret',preview:'Bank account 123'});
 assert.doesNotMatch(JSON.stringify(copy),/Bank account|\n/);
 assert.ok(copy.body.length<=160);
});
