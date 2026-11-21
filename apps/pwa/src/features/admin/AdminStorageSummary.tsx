import {useCallback,useEffect,useState} from 'react';
import {adminStorageSummary,type AdminStorageSummary as Summary,isAdminUnauthorized,AdminApiError}
 from '../../services/admin-api';
import {getFamilyDirectory} from '@havana/shared';
import './admin-storage-summary.css';

const bytes=(value:number)=>value<1_000_000?
 (value/1000).toFixed(0)+' KB':value<1_000_000_000?
 (value/1_000_000).toFixed(1)+' MB':(value/1_000_000_000).toFixed(2)+' GB';
export default function AdminStorageSummary({token,onExpired}:{token:string;onExpired:()=>void}){
 const [data,setData]=useState<Summary|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [limited,setLimited]=useState(false);
 const refresh=useCallback(async()=>{
  setLoading(true);
  try{const next=await adminStorageSummary(token);setData(next);setLimited(false);setError('');}
  catch(e){
   if(isAdminUnauthorized(e)){onExpired();return;}
   if(e instanceof AdminApiError&&e.status===404){
    // Backward compatible with the currently installed Worker. The existing
    // authorized Familia directory already provides aggregate cross-module R2 usage.
    try{
     const directory=await getFamilyDirectory(token,true);
     if(!directory.storage)throw Error('El almacenamiento aún no está disponible.');
     const count=directory.albums.reduce((sum,a)=>sum+a.photoCount+a.videoCount,0);
     setData({storage:directory.storage,rows:[],indexedFiles:count,
      indexedBytes:directory.storage.usedBytes,outsideQuotaBytes:0,
      note:'La memoria total ya se consulta desde el servidor. El desglose por módulo se habilitará con la próxima publicación del Worker.'});
     setLimited(true);setError('');return;
    }catch(fallback){
     if(isAdminUnauthorized(fallback))onExpired();
     else setError(fallback instanceof Error?fallback.message:'Memoria no disponible.');
     return;
    }
   }
   setError(e instanceof Error?e.message:'No fue posible cargar la memoria.');
  }
  finally{setLoading(false);}
 },[token,onExpired]);
 useEffect(()=>{void refresh();},[refresh]);
 const total=data?.storage.maxBytes||0;
 const occupied=(data?.storage.usedBytes||0)+(data?.storage.pendingBytes||0);
 return <section className="hn-admin-storage" aria-label="Resumen privado de almacenamiento">
  <div className="hn-storage-top">
   <h2>Archivos y memoria</h2>
   <button type="button" disabled={loading} onClick={()=>void refresh()}>Actualizar</button>
  </div>
  {error&&<p role="alert" className="a-admin-error">{error}</p>}
  {loading&&!data?<p>Consultando archivos…</p>:data&&<>
   <div className="hn-storage-total">
    <span>Memoria controlada</span><strong>{bytes(occupied)} <small>/ {bytes(total)}</small></strong>
    <progress max={total||1} value={Math.min(total,occupied)} aria-label="Espacio controlado utilizado"/>
    <div><span>Disponible: {bytes(data.storage.remainingBytes)}</span>
     <span>{Math.min(100,100*occupied/(total||1)).toFixed(1)}% ocupado</span></div>
   </div>
   <p className="hn-storage-intro">{data.indexedFiles} {limited?'archivos en Familia':'archivos registrados en los módulos privados'}</p>
   {limited&&<p className="hn-storage-intro">Desglose de Chat, BOOK, Calendario, Estados y Perfiles pendiente de activación.</p>}
   <div className="hn-storage-list">
    {data.rows.map(row=><article key={row.id} className="hn-storage-row">
     <span><strong>{row.name}</strong><small>{row.count} archivos</small></span>
     <b>{bytes(row.bytes)}</b>
    </article>)}
   </div>
   {data.storage.pendingBytes>0&&<p className="hn-storage-pending">Subidas reservadas o en curso: {bytes(data.storage.pendingBytes)}</p>}
   <p className="hn-storage-note">{data.note} Las cantidades pueden cambiar después de las tareas de limpieza.</p>
  </>}
 </section>;
}
