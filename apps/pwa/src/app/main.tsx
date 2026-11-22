import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../styles/chat/chat.css';
import '../styles/home/home.css';
import '../styles/mobile-viewport.css';
import '../features/viewport/musician-portrait.css';
import {enableMusicianPortrait} from '../features/viewport/musician-portrait';

enableMusicianPortrait();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  // Versioned Vite assets stay cached for offline use. When Cloudflare publishes
  // a new shell, the installed Android/iPhone PWA must stop showing old UI.
  // Never unregister/delete sessions, private storage, or the user's media.
  const previousController=navigator.serviceWorker.controller;
  let refreshed=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!previousController||refreshed)return;
    refreshed=true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{
      const update=()=>{
        if(document.visibilityState==='visible')void reg.update().catch(()=>{});
      };
      document.addEventListener('visibilitychange',update);
      window.addEventListener('online',update);
      void reg.update().catch(()=>{});
    }).catch((error) => {
      console.error('Service worker registration failed', error);
    });
  });
}
