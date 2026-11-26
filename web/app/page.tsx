'use client';

import { type FormEvent, useCallback, useState } from 'react';
import { Apertura, confirmarSalida, DatosDelViaje, type DatosApertura } from './apertura';
import { Volver } from './volver';
import { Operacion, type Expediente } from './operacion';

type Business = { id: string; name: string; status: string; canOpen: boolean; canDelete: boolean; nextStatus: string | null };
type Profile = { email: string; superAdmin: boolean; canRegisterBusiness: boolean; businesses: Business[] };
type Details = {
  role: string;
  canManageTrips: boolean;
  canManageWorkers: boolean;
  requests: { id: string; datos: DatosApertura; status: 'pendiente' | 'devuelta' | 'aprobada'; reason: string | null;
    trip_id: string | null; email: string; can_approve: boolean;
    history: { id: number; action: string; email: string; created_at: string; reason: string | null }[] | null }[];
  trips: { id: string; reference: string; customer: string; assigned: string[]; apertura: DatosApertura | null; can_open: boolean; vehicle: DatosApertura; vehicle_assigned: boolean; can_assign_vehicle: boolean }[];
  members: { user_id: string; email: string; role: 'administrador' | 'encargado'; can_manage_workers: boolean }[];
  history: { id: string; action: string; email: string; created_at: string; details: Record<string, string> }[];
};
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, token = '', method = 'GET', body?: object): Promise<T> {
  const response = await fetch(api + path, {
    method,
    headers: { ...(token && { Authorization: 'Bearer ' + token }), ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.message ?? 'No se pudo completar la operación.'), { data });
  }
  return data as T;
}

export default function Home() {
  const [token, setToken] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [viaje, setViaje] = useState<string | null>(null);
  const [captura, setCaptura] = useState<string | null>(null);
  const [eliminar, setEliminar] = useState(false);
  const [nombre, setNombre] = useState('');
  const [duplicado, setDuplicado] = useState<{ existingId: string | null } | null>(null);
  const [registroNegocio, setRegistroNegocio] = useState(false);
  const [rolAlta, setRolAlta] = useState('encargado');
  const encargados = details?.members.filter(item => item.role === 'encargado') ?? [];
  const base = '/businesses/' + business?.id;

  const rutaOperacion = base + '/trips/' + viaje + '/operation';
  const cargarOperacion = useCallback(() => request<Expediente>(rutaOperacion, token), [rutaOperacion, token]);
  const registrarOperacion = (datos: object) => request(rutaOperacion, token, 'POST', datos);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>, action: (data: FormData) => Promise<void>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      await action(data);
      form.reset();
      delete form.dataset.dirty;
    });
  }

  async function select(item: Business) {
    const contenido = item.canOpen ? await request<Details>('/businesses/' + item.id, token) : null;
    if (item.id !== business?.id) {
      setViaje(null);
      setCaptura(null);
      setEliminar(false);
    }
    setBusiness(item);
    setDetails(contenido);
  }

  async function write(path: string, data: object, method = 'POST') {
    await request(path, token, method, data);
    const updated = await request<Profile>('/me', token);
    setProfile(updated);
    const selected = updated.businesses.find(item => item.id === business?.id);
    if (selected) await select(selected);
    else {
      setBusiness(null);
      setDetails(null);
      setViaje(null);
    }
    setNotice('Cambios guardados.');
  }

  function abrirCaptura(id: string) {
    if (!confirmarSalida()) return;
    setViaje(null);
    setCaptura(id);
  }

  function enviarApertura(path: string, method: string) {
    return (_event: FormEvent<HTMLFormElement>, datos: DatosApertura) => void run(async () => {
      await write(path, datos, method);
      setCaptura(null);
    });
  }

  async function registrarNegocio() {
    const body = { name: nombre };
    const match = await request<{ duplicate: boolean; existingId: string | null }>('/businesses/name-check', token, 'POST', body);
    if (match.duplicate) {
      setDuplicado(match);
      return;
    }
    try {
      await write('/businesses', body);
      setNombre('');
      setRegistroNegocio(false);
    } catch (error) {
      if (error instanceof Error && 'data' in error) {
        const data = error.data as { duplicate?: boolean; existingId: string | null };
        if (data.duplicate) {
          setDuplicado(data);
          return;
        }
      }
      throw error;
    }
  }

  return <main onChange={event => {
    const campo = event.target as HTMLInputElement | HTMLSelectElement;
    if (campo.form && !campo.form.hasAttribute('data-dirty')) campo.form.dataset.dirty = 'true';
  }}>
    <header><strong>ponitero</strong>
      {profile && <button type="button" disabled={busy} onClick={() => {
        if (!confirmarSalida()) return;
        setCaptura(null); setEliminar(false); setNombre(''); setDuplicado(null); setRegistroNegocio(false);
        setViaje(null); setToken(''); setProfile(null); setBusiness(null); setDetails(null); setError(''); setNotice('');
      }}>Cerrar sesión</button>}
    </header>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!profile ? <section className="panel login">
      <h1>{register ? 'Crear cuenta' : 'Iniciar sesión'}</h1>
      <form key={String(register)} onSubmit={event => submit(event, async data => {
        const body = { email: data.get('email'), password: data.get('password') };
        if (register) {
          const result = await request<{ message: string }>('/auth/register', '', 'POST', body);
          setRegister(false);
          setNotice(result.message);
          return;
        }
        const session = await request<{ accessToken: string }>('/auth/login', '', 'POST', body);
        setProfile(await request<Profile>('/me', session.accessToken));
        setToken(session.accessToken);
      })}>
        <label>Correo<input name="email" type="email" autoComplete="email" required /></label>
        <label>Contraseña<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={8} required /></label>
        <button disabled={busy}>{register ? 'Crear cuenta' : 'Entrar'}</button>
      </form>
      {register ? <Volver etiqueta="Volver al inicio de sesión" disabled={busy} onClick={() => {
        if (confirmarSalida()) setRegister(false);
      }} /> : <button type="button" className="secondary" disabled={busy} onClick={() => setRegister(true)}>
        Crear cuenta
      </button>}
    </section> : <>
      <h1>{profile.superAdmin ? 'Administración general' : 'Mis negocios'}</h1>
      <p>{profile.email}</p>
      <div className="workspace">
        <aside className="panel">
          <h2>Negocios</h2>
          {!profile.businesses.length && <p>Aún no tienes negocios vinculados.</p>}
          {profile.businesses.map(item => <button className="business secondary" key={item.id}
            aria-pressed={item.id === business?.id} disabled={busy} onClick={() => { if (confirmarSalida()) void run(() => select(item)); }}>
            <strong>{item.name}</strong><span>{item.status}</span>
          </button>)}
          {profile.canRegisterBusiness && (registroNegocio ? <form data-dirty={Boolean(nombre)}
            onSubmit={event => submit(event, registrarNegocio)}>
            <label>Nombre del negocio<input value={nombre} onChange={event => setNombre(event.target.value)}
              readOnly={Boolean(duplicado)} minLength={2} maxLength={100} required /></label>
            {duplicado ? <>
              <p role="alert">Ya existe un negocio con ese nombre.</p>
              <button type="button" onClick={event => {
                const form = event.currentTarget.form;
                setDuplicado(null);
                requestAnimationFrame(() => form?.querySelector('input')?.focus());
              }}>Cambiar el nombre</button>
              {duplicado.existingId && <button type="button" className="secondary" disabled={busy}
                onClick={() => void run(async () => {
                  const actualizado = await request<Profile>('/me', token);
                  setProfile(actualizado);
                  const existente = actualizado.businesses.find(item => item.id === duplicado.existingId);
                  if (existente) {
                    await select(existente);
                    setDuplicado(null);
                    setRegistroNegocio(false);
                  } else setDuplicado({ existingId: null });
                })}>Ir al negocio existente</button>}
            </> : <button disabled={busy}>Registrar negocio</button>}
            <Volver disabled={busy} onClick={() => {
              setDuplicado(null);
              setRegistroNegocio(false);
            }} />
          </form> : <button type="button" disabled={busy} onClick={() => setRegistroNegocio(true)}>Registrar negocio</button>)}
        </aside>
        {business && <section className="panel">
          <div className="encabezado-negocio">
            <Volver etiqueta="Volver a negocios" disabled={busy} onClick={() => {
              if (!confirmarSalida()) return;
              setBusiness(null); setDetails(null); setViaje(null); setCaptura(null); setEliminar(false);
            }} />
            <h2>{business.name}</h2>
            {details && captura !== 'nueva' && <button type="button" disabled={busy} onClick={() => abrirCaptura('nueva')}>
              {details.canManageTrips ? 'Registrar viaje' : 'Solicitar viaje'}
            </button>}
          </div>
          <p>{business.status}{details && ' · ' + details.role}</p>
          {details && captura === 'nueva' && <Apertura titulo={details.canManageTrips ? 'Registrar viaje' : 'Enviar solicitud'}
            busy={busy} volver={() => setCaptura(null)}
            enviar={enviarApertura(base + (details.canManageTrips ? '/trips' : '/trip-requests'), 'POST')} />}
          {business.nextStatus && <form onSubmit={event => submit(event, data =>
            write(base + '/status', { status: business.nextStatus, reason: data.get('reason') }, 'PATCH'))}>
            <label>Motivo<input name="reason" minLength={3} maxLength={300} required /></label>
            <button disabled={busy}>{business.nextStatus === 'suspendido' ? 'Suspender negocio' : 'Aprobar negocio'}</button>
          </form>}
          {business.canDelete && (eliminar ? <form onSubmit={event => submit(event, async data => {
            await write(base, { confirm: true, reason: data.get('reason') }, 'DELETE');
            setEliminar(false);
          })}>
            <p role="alert">Eliminar {business.name} revocará el acceso al negocio, sus viajes y sus solicitudes. Se conservará el historial.</p>
            <label>Motivo<input name="reason" minLength={3} maxLength={300} required /></label>
            <div className="acciones">
              <Volver disabled={busy} onClick={() => { if (confirmarSalida()) setEliminar(false); }} />
              <button disabled={busy}>Confirmar eliminación</button>
            </div>
          </form> : <button type="button" className="secondary" disabled={busy}
            onClick={() => setEliminar(true)}>Eliminar negocio</button>)}
          {!business.canOpen && <p>El negocio requiere aprobación para habilitar la operación.</p>}
          {details && <>
            <h3>Viajes</h3>
            {!details.trips.length && <p>Aún no hay viajes disponibles.</p>}
            {details.trips.map(trip => <article id={'viaje-' + trip.id} key={trip.id}>
              <strong>{trip.reference}</strong> · {trip.customer}
              {trip.can_open ? <p>{viaje === trip.id ?
                <Volver etiqueta="Volver al listado de viajes" disabled={busy}
                  onClick={() => { if (confirmarSalida()) setViaje(null); }} /> :
                <button type="button" className="secondary" disabled={busy} onClick={() => {
                  if (!confirmarSalida()) return;
                  setCaptura(null);
                  setViaje(trip.id);
                }}>Abrir expediente</button>}</p> :
                details.canManageTrips ? captura === trip.id ?
                  <Apertura key={trip.id} titulo="Guardar apertura" busy={busy} folioFijo vehiculoFijo={trip.vehicle_assigned}
                    inicial={{ reference: trip.reference, customer: trip.customer, ...trip.vehicle }} volver={() => setCaptura(null)}
                    enviar={enviarApertura(base + '/trips/' + trip.id + '/opening', 'PATCH')} />
                  : <p><button type="button" disabled={busy} onClick={() => abrirCaptura(trip.id)}>Completar apertura</button></p>
                : <p>Administración debe completar los acuerdos del viaje.</p>}
              {trip.vehicle_assigned ? <details><summary>Vehículo · {trip.vehicle.placas}</summary>
                <DatosDelViaje datos={trip.vehicle} />
              </details> : trip.can_assign_vehicle && captura !== trip.id && (captura === 'vehiculo-' + trip.id ?
                <Apertura key={'vehiculo-' + trip.id} titulo="Asignar vehículo" soloVehiculo busy={busy}
                  inicial={trip.vehicle} volver={() => setCaptura(null)}
                  enviar={enviarApertura(base + '/trips/' + trip.id + '/vehicle', 'PATCH')} /> :
                <p><button type="button" className="secondary" disabled={busy}
                  onClick={() => abrirCaptura('vehiculo-' + trip.id)}>Asignar vehículo</button></p>)}
              {viaje === trip.id && <>
                {trip.apertura && <details><summary>Datos de apertura</summary><DatosDelViaje datos={trip.apertura} /></details>}
                <Operacion key={trip.id} cargar={cargarOperacion} registrar={registrarOperacion} administra={details.canManageTrips} />
              </>}
              {details.canManageTrips && <>
                <p>{encargados.filter(item => trip.assigned.includes(item.user_id)).map(item => item.email).join(', ') || 'Sin encargado asignado'}</p>
                {encargados.some(item => !trip.assigned.includes(item.user_id)) && <form onSubmit={event => submit(event, data =>
                  write(base + '/trips/' + trip.id + '/assignments', { userId: data.get('userId') }))}>
                  <label>Encargado<select name="userId" required defaultValue="">
                    <option value="" disabled>Selecciona una cuenta</option>
                    {encargados.filter(item => !trip.assigned.includes(item.user_id)).map(item =>
                      <option key={item.user_id} value={item.user_id}>{item.email}</option>)}
                  </select></label>
                  <button disabled={busy}>Asignar viaje</button>
                </form>}
              </>}
            </article>)}
            <h3>{details.canManageTrips ? 'Solicitudes de viaje' : 'Mis solicitudes'}</h3>
            {!details.requests.length && <p>Aún no hay solicitudes.</p>}
            {details.requests.map(solicitud => {
              const path = base + '/trip-requests/' + solicitud.id;
              return <article key={solicitud.id}>
                <strong>{solicitud.datos.reference}</strong> · {solicitud.datos.customer} · {
                  solicitud.status === 'pendiente' ? 'Pendiente de aprobación' : solicitud.status === 'devuelta' ? 'Devuelta' : 'Aprobada'
                }
                {details.canManageTrips && <p>{solicitud.email}</p>}
                {solicitud.reason && <p>Motivo de devolución: {solicitud.reason}</p>}
                <details><summary>Ver datos de la solicitud</summary><DatosDelViaje datos={solicitud.datos} /></details>
                {solicitud.history && <details><summary>Historial de la solicitud</summary>
                  <ul>{solicitud.history.map(entry => <li key={entry.id}>
                    {entry.action.replaceAll('_', ' ')} · {entry.email} · {new Date(entry.created_at).toLocaleString('es-MX')}
                    {entry.reason && ' · ' + entry.reason}
                  </li>)}</ul>
                </details>}
                {solicitud.trip_id && details.trips.some(trip => trip.id === solicitud.trip_id) &&
                  <p><a href={'#viaje-' + solicitud.trip_id}>Ir al viaje aprobado</a></p>}
                {details.canManageTrips && solicitud.status === 'pendiente' && <>
                  {solicitud.can_approve && <button type="button" disabled={busy}
                    onClick={() => void run(() => write(path + '/review', { action: 'aprobar' }))}>Aprobar y asignar viaje</button>}
                  {!solicitud.can_approve && <p>La cuenta solicitante ya no está activa como encargado.</p>}
                  <form onSubmit={event => submit(event, data => write(path + '/review', { action: 'devolver', reason: data.get('reason') }))}>
                    <label>Motivo de devolución<input name="reason" minLength={3} maxLength={300} required /></label>
                    <button disabled={busy}>Devolver solicitud</button>
                  </form>
                </>}
                {details.role === 'encargado' && solicitud.status === 'devuelta' && (
                  captura === solicitud.id ? <Apertura key={solicitud.id} titulo="Reenviar solicitud" busy={busy}
                    inicial={solicitud.datos} volver={() => setCaptura(null)} enviar={enviarApertura(path, 'PATCH')} /> :
                    <button type="button" disabled={busy} onClick={() => abrirCaptura(solicitud.id)}>Corregir solicitud</button>
                )}
              </article>;
            })}
            {details.canManageTrips && <>
              <h3>Integrantes</h3>
              {details.members.map(member => {
                const path = base + '/members/' + member.user_id;
                return <article key={member.user_id}>
                  <strong>{member.email}</strong> · {member.role}
                  {member.role === 'administrador' && <form onSubmit={event => submit(event, data =>
                    write(path, { canManageWorkers: !member.can_manage_workers, reason: data.get('reason') }, 'PATCH'))}>
                    <label>Motivo del cambio de permiso<input name="reason" minLength={3} maxLength={300} required /></label>
                    <button disabled={busy}>{member.can_manage_workers ? 'Revocar gestión de encargados' : 'Permitir gestión de encargados'}</button>
                  </form>}
                  {(details.role === 'superadministrador' || details.canManageWorkers && member.role === 'encargado') &&
                    <form onSubmit={event => submit(event, data => write(path, { reason: data.get('reason') }, 'DELETE'))}>
                      <label>Motivo de baja<input name="reason" minLength={3} maxLength={300} required /></label>
                      <button disabled={busy}>Dar de baja</button>
                    </form>}
                </article>;
              })}
              {details.canManageWorkers && <form onSubmit={event => submit(event, data => write(base + '/members', {
                email: data.get('email'), role: details.role === 'superadministrador' ? rolAlta : 'encargado',
                reason: data.get('reason'), canManageWorkers: data.has('canManageWorkers'),
              }))}>
                {details.role === 'superadministrador' && <label>Rol<select value={rolAlta} onChange={event => setRolAlta(event.target.value)}>
                  <option value="encargado">Encargado</option><option value="administrador">Administrador</option>
                </select></label>}
                <label>Correo de la cuenta registrada<input name="email" type="email" required /></label>
                <label>Motivo del alta<input name="reason" minLength={3} maxLength={300} required /></label>
                {details.role === 'superadministrador' && rolAlta === 'administrador' &&
                  <label className="casilla"><input name="canManageWorkers" type="checkbox" /> Puede gestionar encargados</label>}
                <button disabled={busy}>Agregar integrante</button>
              </form>}
              <details><summary>Historial de actividad</summary>
                <ul>{details.history.map(entry => <li key={entry.id}>
                  {entry.action.replaceAll('_', ' ')} · {entry.email} · {new Date(entry.created_at).toLocaleString('es-MX')}
                  {entry.details.reason && ' · ' + entry.details.reason}
                </li>)}</ul>
              </details>
            </>}
          </>}
        </section>}
      </div>
    </>}
  </main>;
}
