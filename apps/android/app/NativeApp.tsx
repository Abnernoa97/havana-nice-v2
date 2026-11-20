// One native entry. All session/transport state is owned by the controller,
// and all on-screen controls are pure presentation.
import React from 'react';
import {useNativeChatController} from '../features/chat/useNativeChatController';
import NativeChatSurface from '../features/chat/NativeChatSurface';
export default function App(){
 const ui=useNativeChatController();
 return <NativeChatSurface ui={ui}/>;
}
