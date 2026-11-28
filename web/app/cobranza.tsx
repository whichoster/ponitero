'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Viaje = { id: string; reference: string; customer: string; producto: string; flete: string | null;
  factura: string | null; remision: string | null; saldo_producto: string | null; saldo_flete: string | null };
type Linea = { viaje: string; referencia: string; saldo: string; importe: string; retencion: string };
type Documento = { id: string; concepto: 'producto' | 'flete'; referencia: string; cliente: string;
  saldo: string; total: string; fecha: string; fecha_envio: string; adelanto_agrupado: string; lineas: Linea[] };
type Fondo = { id: string; tipo: 'deposito' | 'adelanto'; cliente: string; referencia: string;
  saldo: string; importe: string; temporada: string | null };
type Movimiento = { id: string; fondo: string; documento: string | null; viaje: string | null;
  referencia: string; fecha: string; importe: string };
export type EstadoCobranza = { viajes: Viaje[]; documentos: Documento[]; fondos: Fondo[]; movimientos: Movimiento[] };

const secciones = [
  { id: 'saldos', etiqueta: 'Saldos por viaje' },
  { id: 'documentos', etiqueta: 'Facturas y fletes' },
  { id: 'ingresos', etiqueta: 'Depósitos y adelantos' },
  { id: 'aplicaciones', etiqueta: 'Aplicaciones y devoluciones' },
] as const;

const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const pesos = (valor: string | null) => moneda.format(Number(valor ?? 0));
const documentoNombre = (doc: Documento) => (doc.concepto === 'producto' ? 'Factura ' : 'Remisión de flete ') + doc.referencia;
const fecha = (valor: string) => valor.slice(0, 10);

function descargarRemision(documento: Documento) {
  const contenido = [
    'ponitero · Remisión de flete',
    'Folio: ' + documento.referencia,
    'Cliente: ' + documento.cliente,
    'Fecha: ' + fecha(documento.fecha),
    'Fecha de solicitud: ' + fecha(documento.fecha_envio),
    '',
    ...documento.lineas.map(linea => linea.referencia + ' · ' + pesos(linea.importe)),
    '',
    'Importe total: ' + pesos(documento.total),
    'Adelanto aplicado: ' + pesos(documento.adelanto_agrupado),
    'Saldo de la solicitud: ' + pesos(documento.saldo),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/plain;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'remision-flete-' + documento.referencia.replace(/[^a-z0-9_-]/gi, '-') + '.txt';
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DatosMovimiento({ referencia = 'Referencia' }: { referencia?: string }) {
  return <>
    <label>{referencia}<input name="referencia" required maxLength={200} /></label>
    <label>Fecha<input type="date" name="fecha" required /></label>
  </>;
}

export function Cobranza({ cargar, registrar, viajeFiltrado, limpiarFiltro }: {
  viajeFiltrado: string;
  limpiarFiltro: () => void;
  cargar: () => Promise<EstadoCobranza>;
  registrar: (datos: object) => Promise<unknown>;
}) {
  const [estado, setEstado] = useState<EstadoCobranza>();
  const [mensaje, setMensaje] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [seccion, setSeccion] = useState<(typeof secciones)[number]['id']>('saldos');
  const [concepto, setConcepto] = useState<'producto' | 'flete'>('producto');
  const [clienteViajes, setClienteViajes] = useState('');
  const [tipo, setTipo] = useState<'deposito' | 'adelanto'>('deposito');
  const [fondoId, setFondoId] = useState('');
  const [documentoId, setDocumentoId] = useState('');

  useEffect(() => {
    let vigente = true;
    cargar().then(datos => { if (vigente) setEstado(datos); })
      .catch(error => { if (vigente) setMensaje(error.message); });
    return () => { vigente = false; };
  }, [cargar]);

  async function guardar(event: FormEvent<HTMLFormElement>, preparar: (datos: FormData) => object) {
    event.preventDefault();
    const form = event.currentTarget;
    setMensaje('');
    setOcupado(true);
    try {
      await registrar(preparar(new FormData(form)));
      delete form.dataset.dirty;
      form.reset();
      setEstado(await cargar());
      setMensaje('Movimiento guardado.');
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo guardar el movimiento.');
    } finally {
      setOcupado(false);
    }
  }

  const fondo = estado?.fondos.find(item => item.id === fondoId);
  const documento = estado?.documentos.find(item => item.id === documentoId);
  const descuentoAgrupado = fondo?.tipo === 'adelanto' && documento?.concepto === 'flete';
  const clientes = [...new Set((estado?.viajes ?? []).map(viaje => viaje.customer))];
  const elegibles = (estado?.viajes ?? []).filter(v => v.customer === clienteViajes &&
    (concepto === 'producto' ? !v.factura && Number(v.producto) > 0 : !v.remision && Number(v.flete) > 0));
  const viajesVisibles = estado?.viajes.filter(viaje => !viajeFiltrado || viaje.id === viajeFiltrado) ?? [];
  const disponibles = estado?.fondos.filter(item => Number(item.saldo) > 0) ?? [];

  return <section>
    <h3>Cobranza</h3>
    {mensaje && <p role="status">{mensaje}</p>}
    {!estado && !mensaje && <p>Cargando saldos…</p>}
    {estado && <>
      <nav className="acciones" aria-label="Secciones de cobranza">
        {secciones.map(item => <button key={item.id} type="button" aria-pressed={seccion === item.id}
          className={seccion === item.id ? undefined : 'secondary'}
          aria-controls={'cobranza-' + item.id} onClick={() => setSeccion(item.id)}>{item.etiqueta}</button>)}
      </nav>
      <section id="cobranza-saldos" hidden={seccion !== 'saldos'} aria-labelledby="titulo-saldos">
        <h4 id="titulo-saldos">Saldos por viaje</h4>
        {viajeFiltrado && <button type="button" className="secondary" onClick={limpiarFiltro}>Ver todos los viajes</button>}
        {viajesVisibles.length === 0 && <p>Los viajes aparecen cuando se confirma su recepción.</p>}
        <ul>{viajesVisibles.map(viaje => <li key={viaje.id}>
          {viaje.reference} · {viaje.customer} · Piña {pesos(viaje.saldo_producto ?? viaje.producto)}
          {viaje.factura ? '' : ' por facturar'} · Flete {pesos(viaje.saldo_flete ?? viaje.flete)}
          {viaje.remision || !Number(viaje.flete) ? '' : ' por solicitar'}
        </li>)}</ul>
      </section>
      <section id="cobranza-documentos" hidden={seccion !== 'documentos'} aria-labelledby="titulo-documentos">
        <h4 id="titulo-documentos">Facturas y remisiones de flete</h4>
        <details>
          <summary>Registrar factura o solicitud de flete</summary>
          <form className="captura" onSubmit={event => void guardar(event, datos => ({
            accion: 'documento', concepto, referencia: datos.get('referencia'), fecha: datos.get('fecha'),
            fechaEnvio: datos.get('fechaEnvio'), lineas: datos.getAll('viaje').map(viaje => ({
              viaje, ...(concepto === 'producto' && { retencion: datos.get('retencion-' + viaje) || '0' }),
            })),
          }))}>
            <label>Concepto<select value={concepto} onChange={event => setConcepto(event.target.value as typeof concepto)}>
              <option value="producto">Factura de piña</option><option value="flete">Remisión de flete</option>
            </select></label>
            <label>Cliente<select value={clienteViajes} onChange={event => setClienteViajes(event.target.value)} required>
              <option value="">Selecciona un cliente</option>
              {clientes.map(cliente => <option key={cliente}>{cliente}</option>)}
            </select></label>
            <DatosMovimiento referencia={concepto === 'producto' ? 'UUID de la factura' : 'Folio de la remisión de flete'} />
            <label>{concepto === 'producto' ? 'Fecha de envío' : 'Fecha de solicitud'}<input type="date" name="fechaEnvio" required /></label>
            <fieldset className="ancho-completo" key={concepto + ':' + clienteViajes}>
              <legend>Viajes disponibles</legend>
              {elegibles.length === 0 && <p>Selecciona un cliente con viajes disponibles para este concepto.</p>}
              {elegibles.map(viaje => <div key={viaje.id}>
                <label><input type="checkbox" name="viaje" value={viaje.id} /> {viaje.reference} · {pesos(viaje[concepto])}</label>
                {concepto === 'producto' && <label>Retención de {viaje.reference} (MXN)
                  <input name={'retencion-' + viaje.id} inputMode="decimal" />
                </label>}
              </div>)}
            </fieldset>
            <button disabled={ocupado || !elegibles.length}>Guardar documento</button>
          </form>
        </details>

        {estado.documentos.map(doc => <details key={doc.id}>
          <summary>{documentoNombre(doc)} · {doc.cliente} · Saldo {pesos(doc.saldo)}</summary>
          <p>Importe {pesos(doc.total)} · Fecha {fecha(doc.fecha)} · Envío o solicitud {fecha(doc.fecha_envio)}</p>
          {Number(doc.adelanto_agrupado) > 0 && <p>Adelanto aplicado al total de la remisión {pesos(doc.adelanto_agrupado)}</p>}
          {doc.concepto === 'flete' && <button type="button" onClick={() => descargarRemision(doc)}>
            Descargar nota de remisión
          </button>}
          <ul>{doc.lineas.map(linea => <li key={linea.viaje}>
            {linea.referencia} · {pesos(linea.importe)} · Saldo por viaje {pesos(linea.saldo)}
            {Number(linea.retencion) > 0 && <> · Retención {pesos(linea.retencion)}</>}
          </li>)}</ul>
        </details>)}
      </section>
      <section id="cobranza-ingresos" hidden={seccion !== 'ingresos'} aria-labelledby="titulo-ingresos">
        <h4 id="titulo-ingresos">Depósitos y adelantos</h4>
        <details>
          <summary>Registrar depósito o adelanto</summary>
          <form className="captura" onSubmit={event => void guardar(event, datos => ({
            accion: 'fondo', tipo, cliente: datos.get('cliente'), referencia: datos.get('referencia'),
            fecha: datos.get('fecha'), importe: datos.get('importe'),
            ...(tipo === 'adelanto' && { temporada: datos.get('temporada') }),
          }))}>
            <label>Tipo<select value={tipo} onChange={event => setTipo(event.target.value as typeof tipo)}>
              <option value="deposito">Depósito</option><option value="adelanto">Adelanto de cliente</option>
            </select></label>
            <label>Cliente<input name="cliente" required list="clientes-cobranza" maxLength={200} /></label>
            <datalist id="clientes-cobranza">{clientes.map(cliente => <option key={cliente} value={cliente} />)}</datalist>
            <DatosMovimiento />
            {tipo === 'adelanto' && <label>Temporada de origen<input name="temporada" required maxLength={200} /></label>}
            <label>Importe (MXN)<input name="importe" required inputMode="decimal" /></label>
            <button disabled={ocupado}>Registrar ingreso</button>
          </form>
        </details>

        {estado.fondos.map(item => <details key={item.id}>
          <summary>{item.tipo === 'deposito' ? 'Depósito' : 'Adelanto'} {item.referencia} · {item.cliente} · Disponible {pesos(item.saldo)}</summary>
          <p>Importe {pesos(item.importe)}{item.temporada && <> · Temporada {item.temporada}</>}</p>
          <ul>{estado.movimientos.filter(m => m.fondo === item.id).map(mov => {
            const doc = estado.documentos.find(d => d.id === mov.documento);
            const viaje = doc?.lineas.find(l => l.viaje === mov.viaje);
            return <li key={mov.id}>{fecha(mov.fecha)} · {doc ? documentoNombre(doc) : 'Devolución'}
              {viaje && <> · {viaje.referencia}</>} · {pesos(mov.importe)}</li>;
          })}</ul>
        </details>)}
      </section>
      <section id="cobranza-aplicaciones" hidden={seccion !== 'aplicaciones'} aria-labelledby="titulo-aplicaciones">
        <h4 id="titulo-aplicaciones">Aplicaciones y devoluciones</h4>
        <details>
          <summary>Aplicar un depósito o adelanto</summary>
          <form className="captura" onSubmit={event => void guardar(event, datos => ({
            accion: 'aplicar', fondo: fondoId, documento: documentoId, fecha: datos.get('fecha'),
            referencia: datos.get('referencia'), partidas: descuentoAgrupado ? [{ importe: datos.get('importe') }]
              : documento?.lineas.flatMap(linea => {
                const importe = datos.get('aplicar-' + linea.viaje);
                return importe ? [{ viaje: linea.viaje, importe }] : [];
              }),
          }))}>
            <label>Ingreso<select value={fondoId} required onChange={event => {
              setFondoId(event.target.value);
              setDocumentoId('');
            }}>
              <option value="">Selecciona un ingreso</option>
              {disponibles.map(item => <option key={item.id} value={item.id}>
                {item.tipo} · {item.referencia} · {item.cliente} · {pesos(item.saldo)}
              </option>)}
            </select></label>
            <label>Documento<select value={documentoId} required onChange={event => setDocumentoId(event.target.value)}>
              <option value="">Selecciona un documento</option>
              {estado.documentos.filter(doc => doc.cliente === fondo?.cliente && Number(doc.saldo) > 0).map(doc => <option key={doc.id} value={doc.id}>
                {documentoNombre(doc)} · {pesos(doc.saldo)}
              </option>)}
            </select></label>
            <DatosMovimiento referencia="Referencia de aplicación" />
            {documento && (descuentoAgrupado
              ? <label key={documento.id}>Adelanto aplicado al total de la remisión (MXN)<input name="importe" inputMode="decimal" required /></label>
              : <fieldset className="ancho-completo" key={documento.id}>
                <legend>Importe por viaje (MXN)</legend>
                {documento.lineas.filter(linea => Number(linea.saldo) > 0).map(linea => <label key={linea.viaje}>
                  {linea.referencia} · saldo {pesos(linea.saldo)}
                  <input name={'aplicar-' + linea.viaje} inputMode="decimal" />
                </label>)}
              </fieldset>)}
            <button disabled={ocupado || !documento || !fondo || Number(fondo.saldo) <= 0 || Number(documento.saldo) <= 0}>Aplicar al saldo</button>
          </form>
        </details>

        <details>
          <summary>Devolver adelanto</summary>
          <form className="captura" onSubmit={event => void guardar(event, datos => ({
            accion: 'devolver', fondo: datos.get('fondo'), referencia: datos.get('referencia'),
            fecha: datos.get('fecha'), importe: datos.get('importe'),
          }))}>
            <label>Adelanto<select name="fondo" required>
              <option value="">Selecciona un adelanto</option>
              {disponibles.filter(item => item.tipo === 'adelanto').map(item => <option key={item.id} value={item.id}>
                {item.cliente} · {item.temporada} · {item.referencia} · {pesos(item.saldo)}
              </option>)}
            </select></label>
            <DatosMovimiento referencia="Referencia de devolución" />
            <label>Importe (MXN)<input name="importe" required inputMode="decimal" /></label>
            <button disabled={ocupado}>Registrar devolución</button>
          </form>
        </details>
      </section>
    </>}
  </section>;
}
