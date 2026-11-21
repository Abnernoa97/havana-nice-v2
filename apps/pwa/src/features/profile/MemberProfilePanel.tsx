import {useRef,type ChangeEvent} from 'react';
import type {MemberProfile} from '@havana/shared';

type Props={name:string;photo:MemberProfile|undefined;required:boolean;
 saving:boolean;error:string;onUpload:(photo:File)=>Promise<void>;onClose:()=>void;};
export default function MemberProfilePanel({name,photo,required,saving,error,onUpload,onClose}:Props){
 const picker=useRef<HTMLInputElement|null>(null);
 const select=(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.currentTarget.files?.[0];
  event.currentTarget.value='';
  if(file)void onUpload(file);
 };
 return <div className="hn-profile-overlay" role="dialog" aria-modal="true"
  aria-label={required?'Configurar foto de perfil':'Mi perfil'}>
  <section className="hn-profile-card">
   {!required&&<button type="button" className="hn-profile-close" onClick={onClose} aria-label="Cerrar perfil">×</button>}
   <div className="hn-profile-picture">
    {photo?.photoUrl?<img src={photo.photoUrl} alt="" />:<span>{name.slice(0,1).toUpperCase()}</span>}
   </div>
   <h2>{required?'Tu foto de perfil':'Mi perfil'}</h2>
   <p>{required?('Hola, '+name+'. Agrega tu fotografía para comenzar.'):'Tu foto será visible para el equipo.'}</p>
   <input ref={picker} type="file" accept="image/*" className="hn-profile-file"
    onChange={select} aria-label="Elegir fotografía de perfil"/>
   <button type="button" disabled={saving} className="hn-profile-select"
    onClick={()=>picker.current?.click()}>{saving?'Guardando fotografía…':required?'Agregar mi foto':'Cambiar fotografía'}</button>
   {error&&<p className="hn-profile-error" role="alert">{error}</p>}
   {!required&&<p className="hn-profile-settings">Ajustes del perfil · Próximamente</p>}
  </section>
 </div>;
}
