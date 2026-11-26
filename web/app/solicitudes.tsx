'use client';

import { useState } from 'react';
import { Apertura, type DatosApertura } from './apertura';
import { Volver } from './volver';

export function RevisionSolicitud({ inicial, puedeAprobar, busy, resolver }: {
  inicial: DatosApertura; puedeAprobar: boolean; busy: boolean;
  resolver: (payload: object) => Promise<void>;
}) {
  const [accion, setAccion] = useState<'aprobar' | 'devolver' | 'cancelar'>();
  if (accion === 'aprobar' || accion === 'devolver') return <Apertura
    key={accion} inicial={inicial} motivo={accion === 'devolver'} busy={busy}
    titulo={accion === 'aprobar' ? 'Aprobar y asignar viaje' : 'Devolver solicitud'}
    volver={() => setAccion(undefined)}
    enviar={(event, datos) => void resolver({ action: accion, datos, reason: new FormData(event.currentTarget).get('reason') })} />;
  if (accion === 'cancelar') return <form onSubmit={event => {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('reason');
    void resolver({ action: 'cancelar', reason, confirm: true });
  }}>
    <p>La solicitud quedará cerrada para edición y aprobación.</p>
    <label>Motivo de cancelación<input name="reason" minLength={3} maxLength={300} required /></label>
    <div className="acciones"><Volver disabled={busy} onClick={() => {
      if (window.confirm('¿Quieres salir de la cancelación?')) setAccion(undefined);
    }} /><button disabled={busy}>Confirmar cancelación</button></div>
  </form>;
  return <div className="acciones">
    {puedeAprobar && <button disabled={busy} onClick={() => setAccion('aprobar')}>Revisar y aprobar</button>}
    {!puedeAprobar && <p>La cuenta solicitante ya no está activa como encargado.</p>}
    <button disabled={busy} className="secondary" onClick={() => setAccion('devolver')}>Revisar y devolver</button>
    <button disabled={busy} className="secondary" onClick={() => setAccion('cancelar')}>Cancelar solicitud</button>
  </div>;
}

type Fila = Record<string, string>;
type Referencia = { reference: string; compras: Fila[]; ticket?: Fila; entrega?: Fila; gastos?: Fila[]; abonos?: Fila[] };

export function ReferenciaViaje({ cargar }: { cargar: () => Promise<Referencia> }) {
  const [datos, setDatos] = useState<Referencia>();
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  return <details onToggle={async event => {
    if (!event.currentTarget.open || datos || cargando) return;
    setCargando(true);
    setError('');
    try { setDatos(await cargar()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo consultar el viaje de origen.'); }
    finally { setCargando(false); }
  }}>
    <summary>Viaje original · referencia de solo lectura</summary>
    {cargando && <p>Cargando referencia…</p>}
    {error && <p role="alert">{error}</p>}
    {datos && <ul>
      <li>Folio original {datos.reference}</li>
      {datos.compras.map((item, indice) => <li key={indice}>Ticket de finca {item.folio} · {item.finca} · {item.kg} kg</li>)}
      {datos.ticket && <li>Ticket de fábrica {datos.ticket.folio} · {datos.ticket.fecha} · {datos.ticket.kg} kg</li>}
      {datos.entrega && <li>Remisión {datos.entrega.folio} · {datos.entrega.fecha} · {datos.entrega.kg} kg</li>}
      {datos.gastos?.map(item => <li key={item.id}>Gasto {item.concepto} · {item.beneficiario} · ${item.importe} MXN · {item.estado}</li>)}
      {datos.abonos?.map(item => <li key={item.id}>Abono {item.referencia} · {item.fecha} · ${item.importe} MXN</li>)}
    </ul>}
  </details>;
}
