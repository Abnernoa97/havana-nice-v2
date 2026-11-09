// A single offline-first session restoration decision for PWA and native.
// Storage, navigation and WebSocket ownership remain with each existing client.
// A confirmed server revocation must never be mistaken for a network outage.
import type {ChatSession} from './index';

export type ChatAccessRecovery =
  | {state:'authorized';session:ChatSession}
  | {state:'offline';session:ChatSession}
  | {state:'revoked';session:null};

export async function recoverChatAccess(
  saved:ChatSession,
  validate:(session:ChatSession)=>Promise<ChatSession|null>,
):Promise<ChatAccessRecovery>{
  try{
    const authorized=await validate(saved);
    return authorized
      ? {state:'authorized',session:authorized}
      : {state:'revoked',session:null};
  }catch{
    // Retain the existing offline draft/outbox and retry verification on resume.
    return {state:'offline',session:saved};
  }
}
