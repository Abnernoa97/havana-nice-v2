import {useCallback,useEffect,useState} from 'react';
import {adminStorageSummary,type AdminStorageSummary as Summary,isAdminUnauthorized}
 from '../../services/admin-api';
import './admin-storage-summary.css';

const bytes=(value:number)=>value<1_000_000?
 (value/1000).toFixed(0)+' KB':value<1_000_000_000?
 (value/1_000_000).toFixed(1)+' MB':(value/1_000_000_000).toFixed(2)+' GB';
export default function AdminStorageSummary({token,onExpired}:{token:string;onExpired:()=>void}){
 const [data,setData]=useState<Summary|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const refresh=useCallback(async()=>{
  setLoading(true);
  try{const next=await adminStorageSummary(token);setData(next);setError('');}
  catch(e){if(isAdminUnauthorized(e))onExpired();
   else setError(e instanceof Error?e.message:'No fue posible cargar la memoria.');}
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
   <p className="hn-storage-intro">{data.indexedFiles} archivos registrados en los módulos privados</p>
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
