import type {ChatEmoji} from './index';

// Visual-only effects. One short tap still produces just one ordinary reaction.
export const CHAT_REACTION_BURST_WAVES=9;
export const CHAT_REACTION_BURST_WAVE_GAP_MS=95;
export const CHAT_REACTION_BURST_PER_TICK=3;
export const CHAT_REACTION_BURST_MAX_PARTICLES=48;

export type ChatReactionParticle={
 id:number;
 emoji:ChatEmoji;
 x:number;
 y:number;
 dx:number;
 dy:number;
 size:number;
 duration:number;
};
type Point={x:number;y:number};
type Viewport={width:number;height:number};

// Pure, shared motion geometry: no network, persistence, timers or platform APIs.
// Distribute particles from around the held emoji across the visible screen.
export function makeChatReactionParticles(
 emoji:ChatEmoji,origin:Point,viewport:Viewport,firstId:number,
 random:()=>number=Math.random,
):ChatReactionParticle[]{
 const width=Math.max(100,viewport.width),height=Math.max(200,viewport.height);
 const rand=()=>Math.min(.999999,Math.max(0,random()));
 const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
 return Array.from({length:CHAT_REACTION_BURST_PER_TICK},(_,index)=>{
   const x=clamp(origin.x+(rand()-.5)*width*.95,16,width-16);
   const y=clamp(origin.y+(rand()-.3)*height*.5,26,height-26);
   return {
     id:firstId+index,emoji,x,y,
     dx:(rand()-.5)*Math.min(width*.75,260),
     dy:-height*(.34+rand()*.49),
     size:25+Math.round(rand()*19),
     duration:1500+Math.round(rand()*650),
   };
 });
}
