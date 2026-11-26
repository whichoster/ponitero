'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Empleados } from './empleados';
import { RevisionSolicitud, ReferenciaViaje } from './solicitudes';
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
  requests: { id: string; datos: DatosApertura; status: 'pendiente' | 'devuelta' | 'aprobada' | 'cancelada' | 'pendiente_correccion'; version: number; source_trip_id: string | null; reason: string | null;
    trip_id: string | null; email: string; can_approve: boolean;
    history: { id: number; action: string; email: string; created_at: string; reason: string | null }[] | null }[];
  trips: { id: string; reference: string; customer: string; assigned: string[]; apertura: DatosApertura | null; can_open: boolean; vehicle: DatosApertura; vehicle_assigned: boolean; can_assign_vehicle: boolean; reasignado_en: string | null; cerrado_en: string | null }[];
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

export default function Panel() {
  const router = useRouter();
  const pathname = usePathname();
  const rutaEmpleados = /^\/negocios\/([^/]+)\/empleados$/.exec(pathname);
  const [apartado, setApartado] = useState<'viajes' | 'solicitudes' | null>(null);
  const [viajeSeleccionado, setViajeSeleccionado] = useState('');
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
  const negocioEmpleados = profile?.businesses.find(item => item.id === rutaEmpleados?.[1] && item.canOpen);
  const consultarEmpleados = useCallback(<T,>(sufijo: string, method?: string, body?: object) =>
    request<T>('/businesses/' + negocioEmpleados?.id + '/members' + sufijo, token, method, body),
  [negocioEmpleados?.id, token]);
  const vistaPorApartado = details?.role === 'administrador';
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
      setViajeSeleccionado('');
      setApartado(null);
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

  function cambiarApartado(valor: 'viajes' | 'solicitudes' | null, seleccionar = '') {
    if (!confirmarSalida()) return;
    setApartado(valor);
    setViajeSeleccionado(seleccionar);
    setViaje(seleccionar || null);
    setCaptura(null);
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
        setApartado(null); setViajeSeleccionado('');
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
    </section> : rutaEmpleados ? negocioEmpleados ? <Empleados
      key={negocioEmpleados.id} nombre={negocioEmpleados.name}
      consultar={consultarEmpleados}
      volver={() => void run(async () => {
        await select(negocioEmpleados);
        router.push('/');
      })} /> : <section className="panel">
        <Volver etiqueta="Volver a negocios" onClick={() => router.push('/')} />
        <p>El negocio no está disponible.</p>
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
              setBusiness(null); setDetails(null); setViaje(null); setViajeSeleccionado(''); setApartado(null); setCaptura(null); setEliminar(false);
            }} />
            <h2>{business.name}</h2>
            {details && !vistaPorApartado && captura !== 'nueva' && <button type="button" disabled={busy} onClick={() => abrirCaptura('nueva')}>
              {details.canManageTrips ? 'Registrar viaje' : 'Solicitar viaje'}
            </button>}
          </div>
          <p>{business.status}{details && ' · ' + details.role}</p>
          {details && !vistaPorApartado && captura === 'nueva' && <Apertura titulo={details.canManageTrips ? 'Registrar viaje' : 'Enviar solicitud'}
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
          {details?.canManageTrips && <div className="acciones">
            {vistaPorApartado && <>
              <button type="button" aria-pressed={apartado === 'viajes'} disabled={busy} onClick={() => cambiarApartado('viajes')}>Viajes</button>
              <button type="button" aria-pressed={apartado === 'solicitudes'} disabled={busy} onClick={() => cambiarApartado('solicitudes')}>Solicitudes de viaje</button>
            </>}
            <button type="button" disabled={busy} onClick={() => {
              if (!confirmarSalida()) return;
              setCaptura(null); setApartado(null); setViaje(null); setViajeSeleccionado('');
              router.push('/negocios/' + business.id + '/empleados');
            }}>Empleados</button>
          </div>}
          {vistaPorApartado && apartado && <p><Volver etiqueta="Volver al menú del negocio" disabled={busy}
            onClick={() => cambiarApartado(null)} /></p>}
          {details && <>
            {(!vistaPorApartado || apartado === 'viajes') && <>
            <h3>Viajes</h3>
            {vistaPorApartado && <>
              {captura === 'nueva' ? <Apertura titulo="Registrar viaje" busy={busy} volver={() => setCaptura(null)}
                enviar={enviarApertura(base + '/trips', 'POST')} /> :
                <button type="button" disabled={busy} onClick={() => abrirCaptura('nueva')}>Registrar viaje</button>}
              <label>Selecciona un viaje<select disabled={busy} value={viajeSeleccionado} onChange={event => {
                if (confirmarSalida()) {
                  setCaptura(null);
                  setViaje(null);
                  setViajeSeleccionado(event.target.value);
                }
              }}>
                <option value="">Selecciona un viaje</option>
                {details.trips.map(item => <option key={item.id} value={item.id}>{item.reference} · {item.customer}</option>)}
              </select></label>
            </>}
            {!details.trips.length && <p>Aún no hay viajes disponibles.</p>}
            {details.trips.filter(trip => !vistaPorApartado || trip.id === viajeSeleccionado).map(trip => <article id={'viaje-' + trip.id} key={trip.id}>
              <strong>{trip.reference}</strong> · {trip.customer}{trip.reasignado_en && ' · Reasignado'}
              {trip.can_open ? <p>{viaje === trip.id ?
                <Volver etiqueta="Volver al listado de viajes" disabled={busy}
                  onClick={() => { if (confirmarSalida()) { setViaje(null); if (vistaPorApartado) setViajeSeleccionado(''); } }} /> :
                <button type="button" className="secondary" disabled={busy} onClick={() => {
                  if (!confirmarSalida()) return;
                  setCaptura(null);
                  setViaje(trip.id);
                }}>Abrir expediente</button>}</p> :
                details.canManageTrips && !trip.reasignado_en ? captura === trip.id ?
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
                <Operacion key={trip.id} cargar={cargarOperacion} registrar={registrarOperacion} administra={details.canManageTrips}
                  encargados={encargados} asignado={trip.assigned.length === 1 ? trip.assigned[0] : ''}
                  reasignar={async datos => {
                    await request(base + '/trips/' + trip.id + '/reassignment', token, 'POST', datos);
                    if (business) await select(business);
                  }} />
              </>}
              {details.canManageTrips && <>
                <p>{encargados.filter(item => trip.assigned.includes(item.user_id)).map(item => item.email).join(', ') || 'Sin encargado asignado'}</p>
                {!trip.reasignado_en && encargados.some(item => !trip.assigned.includes(item.user_id)) && <form onSubmit={event => submit(event, data =>
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
            </>}
            {(!vistaPorApartado || apartado === 'solicitudes') && <>
            <h3>{details.canManageTrips ? 'Solicitudes de viaje' : 'Mis solicitudes'}</h3>
            {!details.requests.length && <p>Aún no hay solicitudes.</p>}
            {details.requests.map(solicitud => {
              const path = base + '/trip-requests/' + solicitud.id;
              return <article key={solicitud.id}>
                <strong>{solicitud.datos.reference}</strong> · {solicitud.datos.customer} · {
                  solicitud.status === 'pendiente' ? 'Pendiente de aprobación' : solicitud.status === 'devuelta' ? 'Devuelta' : solicitud.status === 'cancelada' ? 'Cancelada' :
                  solicitud.status === 'pendiente_correccion' ? 'Pendiente de corrección' : 'Aprobada'
                }
                {details.canManageTrips && <p>{solicitud.email}</p>}
                {solicitud.reason && <p>Motivo {' · '}{solicitud.reason}</p>}
                <details><summary>Ver datos de la solicitud</summary><DatosDelViaje datos={solicitud.datos} /></details>
                {solicitud.source_trip_id && <ReferenciaViaje cargar={() => request(path + '/source', token)} />}
                {solicitud.history && <details><summary>Historial de la solicitud</summary>
                  <ul>{solicitud.history.map(entry => <li key={entry.id}>
                    {entry.action.replaceAll('_', ' ')} · {entry.email} · {new Date(entry.created_at).toLocaleString('es-MX')}
                    {entry.reason && ' · ' + entry.reason}
                  </li>)}</ul>
                </details>}
                {solicitud.trip_id && details.trips.some(trip => trip.id === solicitud.trip_id) &&
                  <p>{vistaPorApartado ? <button type="button" className="secondary" onClick={() => cambiarApartado('viajes', solicitud.trip_id!)}>
                    Ir al viaje aprobado</button> : <a href={'#viaje-' + solicitud.trip_id}>Ir al viaje aprobado</a>}</p>}
                {details.canManageTrips && solicitud.status === 'pendiente' && <RevisionSolicitud
                  key={solicitud.id + ':' + solicitud.version} inicial={solicitud.datos} puedeAprobar={solicitud.can_approve}
                  busy={busy} resolver={datos => run(() => write(path + '/review', { ...datos, version: solicitud.version }))} />}
                {details.role === 'encargado' && ['devuelta','pendiente_correccion'].includes(solicitud.status) && (
                  captura === solicitud.id ? <Apertura key={solicitud.id} titulo="Reenviar solicitud" busy={busy}
                    inicial={solicitud.datos} volver={() => setCaptura(null)} enviar={enviarApertura(path, 'PATCH')} /> :
                    <button type="button" disabled={busy} onClick={() => abrirCaptura(solicitud.id)}>Corregir solicitud</button>
                )}
              </article>;
            })}
            </>}
            {details.canManageTrips && <>
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
