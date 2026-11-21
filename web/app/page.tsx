'use client';

import { type FormEvent, useCallback, useState } from 'react';
import { Operacion, type Expediente } from './operacion';

type Business = { id: string; name: string; status: string; canOpen: boolean; nextStatus: string | null };
type Profile = { email: string; superAdmin: boolean; canRegisterBusiness: boolean; businesses: Business[] };
type Details = {
  role: string;
  canManageTrips: boolean;
  trips: { id: string; reference: string; customer: string; assigned: string[] }[];
  members: { user_id: string; email: string }[];
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
  if (!response.ok) throw new Error(data.message ?? 'No se pudo completar la operación.');
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
    const data = new FormData(event.currentTarget);
    void run(() => action(data));
  }

  async function select(item: Business) {
    if (item.id !== business?.id) setViaje(null);
    setBusiness(item);
    setDetails(null);
    if (item.canOpen) setDetails(await request<Details>('/businesses/' + item.id, token));
  }

  async function write(path: string, data: object, method = 'POST') {
    await request(path, token, method, data);
    const updated = await request<Profile>('/me', token);
    setProfile(updated);
    const selected = updated.businesses.find(item => item.id === business?.id);
    if (selected) await select(selected);
    setNotice('Cambios guardados.');
  }

  return <main>
    <header><strong>ponitero</strong>
      {profile && <button type="button" disabled={busy} onClick={() => {
        setViaje(null); setToken(''); setProfile(null); setBusiness(null); setDetails(null); setError(''); setNotice('');
      }}>Cerrar sesión</button>}
    </header>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!profile ? <section className="panel login">
      <h1>{register ? 'Crear cuenta' : 'Iniciar sesión'}</h1>
      <form onSubmit={event => submit(event, async data => {
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
      <button type="button" className="secondary" disabled={busy} onClick={() => setRegister(!register)}>
        {register ? 'Ya tengo cuenta' : 'Crear cuenta'}
      </button>
    </section> : <>
      <h1>{profile.superAdmin ? 'Administración general' : 'Mis negocios'}</h1>
      <p>{profile.email}</p>
      <div className="workspace">
        <aside className="panel">
          <h2>Negocios</h2>
          {!profile.businesses.length && <p>Aún no tienes negocios vinculados.</p>}
          {profile.businesses.map(item => <button className="business secondary" key={item.id}
            aria-pressed={item.id === business?.id} disabled={busy} onClick={() => void run(() => select(item))}>
            <strong>{item.name}</strong><span>{item.status}</span>
          </button>)}
          {profile.canRegisterBusiness && <form onSubmit={event => submit(event, data => write('/businesses', { name: data.get('name') }))}>
            <label>Nombre del negocio<input name="name" minLength={2} maxLength={100} required /></label>
            <button disabled={busy}>Registrar negocio</button>
          </form>}
        </aside>
        {business && <section className="panel">
          <h2>{business.name}</h2><p>{business.status}{details && ' · ' + details.role}</p>
          {business.nextStatus && <form onSubmit={event => submit(event, data =>
            write(base + '/status', { status: business.nextStatus, reason: data.get('reason') }, 'PATCH'))}>
            <label>Motivo<input name="reason" minLength={3} maxLength={300} required /></label>
            <button disabled={busy}>{business.nextStatus === 'suspendido' ? 'Suspender negocio' : 'Aprobar negocio'}</button>
          </form>}
          {!business.canOpen && <p>El negocio requiere aprobación para habilitar la operación.</p>}
          {details && <>
            <h3>Viajes</h3>
            {!details.trips.length && <p>Aún no hay viajes disponibles.</p>}
            {details.trips.map(trip => <article key={trip.id}>
              <strong>{trip.reference}</strong> · {trip.customer}
              <p><button type="button" className="secondary" aria-expanded={viaje === trip.id}
                onClick={() => setViaje(viaje === trip.id ? null : trip.id)}>
                {viaje === trip.id ? 'Ocultar expediente' : 'Abrir expediente'}
              </button></p>
              {viaje === trip.id && <Operacion key={trip.id} cargar={cargarOperacion}
                registrar={registrarOperacion} administra={details.canManageTrips} />}
              {details.canManageTrips && <>
                <p>{details.members.filter(item => trip.assigned.includes(item.user_id)).map(item => item.email).join(', ') || 'Sin encargado asignado'}</p>
                {details.members.some(item => !trip.assigned.includes(item.user_id)) && <form onSubmit={event => submit(event, data =>
                  write(base + '/trips/' + trip.id + '/assignments', { userId: data.get('userId') }))}>
                  <label>Encargado<select name="userId" required defaultValue="">
                    <option value="" disabled>Selecciona una cuenta</option>
                    {details.members.filter(item => !trip.assigned.includes(item.user_id)).map(item =>
                      <option key={item.user_id} value={item.user_id}>{item.email}</option>)}
                  </select></label>
                  <button disabled={busy}>Asignar viaje</button>
                </form>}
              </>}
            </article>)}
            {details.canManageTrips && <>
              <form onSubmit={event => submit(event, data =>
                write(base + '/trips', { reference: data.get('reference'), customer: data.get('customer') }))}>
                <label>Folio<input name="reference" maxLength={50} required /></label>
                <label>Cliente<input name="customer" minLength={2} maxLength={100} required /></label>
                <button disabled={busy}>Registrar viaje</button>
              </form>
              <h3>Encargados</h3>
              <form onSubmit={event => submit(event, data => write(base + '/members', { email: data.get('email') }))}>
                <label>Correo de la cuenta registrada<input name="email" type="email" required /></label>
                <button disabled={busy}>Agregar encargado</button>
              </form>
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
