// Presentation only. The single musician session still belongs to App.tsx.
type Props={
  mode:'restoring'|'reader-denied'|'join';
  name:string;
  joining:boolean;
  error:string;
  onNameChange:(value:string)=>void;
  onJoin:()=>void;
  onCloseReader:()=>void;
};

export default function PwaMemberAccessPanel({
  mode,name,joining,error,onNameChange,onJoin,onCloseReader,
}:Props){
  if(mode==='restoring')
    return <section className="join-panel"><p>Abriendo HAVANA NICE…</p></section>;

  if(mode==='reader-denied')
    return <section className="join-panel">
      <span className="overline">BOOK HAVANA NICE · PWA</span>
      <h2>Sesión web no autorizada</h2>
      <p>Este lector 3D funciona con una sesión PWA previamente autorizada.
        La sesión de Android no se transfiere al navegador. No vuelvas a registrar
        el mismo nombre: solo puede estar vinculado a una instalación.</p>
      <button type="button" onClick={onCloseReader}>Volver a la aplicación PWA</button>
    </section>;

  return <section className="join-panel">
    <span className="overline">ACCESO HAVANA NICE</span>
    <h2>Bienvenido.</h2>
    <p>Introduce el nombre que el Administrador creó y autorizó para ti. Entrarás a Inicio.</p>
    <form onSubmit={event=>{event.preventDefault();onJoin();}}>
      <label htmlFor="chat-name">Tu nombre</label>
      <input id="chat-name" maxLength={28} autoComplete="nickname" autoCapitalize="none"
        value={name} onChange={event=>onNameChange(event.target.value)} placeholder="Tu nombre" />
      <button type="submit" disabled={joining||!name.trim()}>
        {joining?'Comprobando acceso…':'Continuar'}
      </button>
    </form>
    {error&&<p className="chat-error" role="alert">{error}</p>}
    <small>Si tu nombre no está registrado por el Administrador, no podrás entrar.</small>
  </section>;
}
