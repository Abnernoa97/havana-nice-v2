// Installed mobile apps prefer portrait. Android's installed PWA may honor
// the native Screen Orientation API; iPhone standalone Safari can ignore both
// this API and the manifest, so it additionally gets a visual portrait frame.
export function enableMusicianPortrait(){
  const standalone=window.matchMedia('(display-mode: standalone)').matches||
    (navigator as Navigator&{standalone?:boolean}).standalone===true;
  if(!standalone)return;
  try{void screen.orientation?.lock?.('portrait-primary').catch(()=>{});}
  catch{/* Safari does not expose the lock; the iPhone frame below is the fallback. */}
  if(!/iPhone|iPod/.test(navigator.userAgent))return;
  const orientation=window.matchMedia('(orientation: landscape)');
  const sync=()=>{
    const wide=orientation.matches;
    const angle=(window as Window&{orientation?:number}).orientation??
      screen.orientation?.angle??90;
    document.documentElement.classList.toggle('hn-pwa-portrait-landscape',wide);
    document.body.classList.toggle('hn-pwa-portrait-landscape',wide);
    document.body.classList.toggle('hn-pwa-portrait-ccw',wide&&(angle===-90||angle===270));
  };
  sync();
  orientation.addEventListener?.('change',sync);
  window.addEventListener('orientationchange',sync);
  window.addEventListener('resize',sync);
}
