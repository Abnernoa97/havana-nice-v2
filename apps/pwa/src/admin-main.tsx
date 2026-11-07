import React from 'react';
import {createRoot} from 'react-dom/client';
import AdminApp from './AdminApp';
import './admin.css';

// One administrator PWA from the same HAVANA NICE V2 source and deployment.
// Admin navigation and private API responses MUST remain network-only.
createRoot(document.getElementById('admin-root')!).render(
  <React.StrictMode><AdminApp/></React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'})
    .then(registration=>registration.update()).catch(()=>{});
}

// Never reload while an Administrator session is active OR any form contains
// unsaved input. The auth token lives in React memory and would be lost.
// Fresh versions apply automatically only at a safe point (after logout, or
// while the login page has no draft). No secret/session is persisted in storage.
let checking=false;
async function checkAdminUpdate() {
  if (checking || document.hidden) return;
  const current=document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src');
  if (!current?.startsWith('/assets/')) return;
  checking=true;
  try {
    const response=await fetch('/admin.html',{cache:'no-store'});
    if (!response.ok) return;
    const latest=new DOMParser().parseFromString(await response.text(),'text/html')
      .querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src');
    if(latest?.startsWith('/assets/') && latest!==current) {
      const active=document.documentElement.dataset.adminSessionActive==='true';
      const formHasDraft=[...document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')]
        .some(input=>input.value.trim().length>0);
      if(active||formHasDraft){
        document.documentElement.dataset.adminUpdatePending='true';
        window.dispatchEvent(new Event('havana-admin-update-pending'));
      } else {
        window.location.reload();
      }
    }
  } catch { /* Offline: retain active state and try again on reconnection. */ }
  finally { checking=false; }
}
window.addEventListener('pageshow',()=>void checkAdminUpdate());
window.addEventListener('online',()=>void checkAdminUpdate());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkAdminUpdate();});
window.setInterval(()=>void checkAdminUpdate(),60_000);

window.addEventListener('havana-admin-session-ended',()=>void checkAdminUpdate());
