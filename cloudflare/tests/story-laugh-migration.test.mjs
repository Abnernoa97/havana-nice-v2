import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const read=id=>readFileSync(new URL('../migrations/'+id,import.meta.url),'utf8');
const ACTOR='member:123e4567-e89b-42d3-a456-426614174001';
const STORY='123e4567-e89b-42d3-a456-426614174002';
test('Migration adds laughing reaction without losing already-recorded hearts and claps',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 db.exec('CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,active INTEGER NOT NULL)');
 db.prepare('INSERT INTO chat_members VALUES(?,?,1)').run(ACTOR,'Fer');
 db.exec(read('0031_member_stories.sql'));
 db.exec(read('0032_story_conversation.sql'));
 const now=1763688000000;
 db.prepare('INSERT INTO member_stories VALUES(?,?,?,?,?,?)')
  .run(STORY,ACTOR,'stories/test/cover.jpg',800,now,now+86400000);
 const insert=db.prepare('INSERT INTO member_story_reactions VALUES(?,?,?,?,?)');
 insert.run(STORY,ACTOR,'❤️',3,now);
 insert.run(STORY,ACTOR,'👏',2,now);
 db.exec(read('0033_story_laugh_reaction.sql'));
 const past=db.prepare('SELECT emoji,count FROM member_story_reactions ORDER BY emoji').all();
 assert.equal(past.length,2);
 assert.ok(past.some(row=>row.emoji==='❤️'&&row.count===3));
 assert.ok(past.some(row=>row.emoji==='👏'&&row.count===2));
 db.prepare('INSERT INTO member_story_reactions VALUES(?,?,?,?,?)').run(STORY,ACTOR,'😂',1,now+1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM member_story_reactions').get().n,3);
 assert.throws(()=>db.prepare('INSERT INTO member_story_reactions VALUES(?,?,?,?,?)')
  .run(STORY,ACTOR,'😈',1,now+2));
 db.prepare('DELETE FROM member_stories WHERE id=?').run(STORY);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM member_story_reactions').get().n,0);
 db.close();
});
