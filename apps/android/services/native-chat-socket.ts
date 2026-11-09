// Owns only the React Native WebSocket handshake. App owns the single socket,
// retries, event handlers and cleanup; never move the member token into a URL.
import {HAVANA_V2_DEV_API_BASE_URL,type ChatSession} from '@havana/shared';

type NativeChatWebSocketConstructor = new (
  url:string,
  protocols:string[],
  options:{headers:Record<string,string>},
)=>WebSocket;

export function openNativeChatSocket(session:ChatSession):WebSocket{
  const NativeWebSocket=WebSocket as unknown as NativeChatWebSocketConstructor;
  return new NativeWebSocket(
    `${HAVANA_V2_DEV_API_BASE_URL.replace(/^http/,'ws')}/ws`,
    ['havana-v2'],
    {headers:{Authorization:`Bearer ${session.token}`}},
  );
}
