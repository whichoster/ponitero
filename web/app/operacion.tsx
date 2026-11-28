'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Volver } from './volver';
import { confirmarSalida, DatosDelViaje, type DatosApertura } from './apertura';

type Fila = Record<string, string | null>;
type Expediente = {
  resumen: Omit<Fila, 'acuerdos'> & { acuerdos?: boolean | { producto: string; venta: string } };
  beneficiario: string;
  planes?: (Fila & { escenario?: EscenarioGuardado })[];
  compras: (Fila & { version?: number })[];
  remisiones?: Fila[];
  gastos?: Fila[];
  tarifas?: Fila[];
  sugerencias?: Fila[];
  abonos?: Fila[];
  recepcion?: Fila;
  entrega?: Fila;
  ticketFabrica?: Fila;
};
type Campo = [nombre: string, etiqueta: string, tipo?: 'fecha' | 'decimal' | 'opcional' | string[]];
const fecha: Campo = ['fecha', 'Fecha', 'fecha'];
const motivo: Campo = ['motivo', 'Motivo'];
const conceptosTicket = ['corte','estiba','flete local','vaciado','pasaje'];
const importe: Campo = ['importe', 'Importe en MXN', 'decimal'];
const gastosFijos = ['Corte', 'Estiba'];
const gastosOpcionales = [
  ['canastos', 'Canastos'], ['escalera', 'Escalera'],
  ['flete local', 'Flete'], ['pasaje', 'Pasaje'], ['mandados', 'Mandados'],
  ['combustible propio', 'Combustible propio'], ['agua', 'Agua'], ['lonches', 'Lunch'], ['otro', 'Otros'],
];
const pesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

type GastoAdicional = { id: number; concepto: string; cantidad: string; tarifaUnitaria: string };

function subtotalAdicional({ cantidad, tarifaUnitaria }: GastoAdicional) {
  if (!/^[1-9][0-9]{0,8}$/.test(cantidad) || !/^[0-9]{1,9}(\.[0-9]{1,2})?$/.test(tarifaUnitaria)) return '—';
  const [pesosEnteros, decimales = ''] = tarifaUnitaria.split('.');
  const centavos = Number(pesosEnteros + decimales.padEnd(2, '0'));
  const total = centavos * Number(cantidad);
  return total > 0 && total < 100000000000000 ? pesos.format(total / 100) : '—';
}

const variedades = ['Cayena', 'MD2', 'Champaca', 'Otra'];
const camposTicket: Campo[] = [
  ['folio','Folio del ticket de finca'], ['finca','Finca'], ['variedad','Variedad',variedades],
  ['descripcion','Descripción de otra variedad','opcional'], ['kg','Peso en kg','decimal'],
];
const camposCompraNueva: Campo[] = [
  ['productor','Productor'], ...camposTicket, ['tarifa','Compra por tonelada','decimal'], ['reserva','Reserva pactada (MXN)','decimal'],
];

function detalleGastoUnitario(gasto: Fila) {
  if (gasto.cantidad == null || gasto.tarifa_unitaria == null) return '';
  return ' · ' + gasto.cantidad + ' × ' + pesos.format(Number(gasto.tarifa_unitaria));
}

function valoresTicket(ticket: Fila) {
  const variedad = ticket.variedad ?? '';
  return variedades.includes(variedad) ? ticket : { ...ticket, variedad: 'Otra', descripcion: variedad };
}

function Formulario({ titulo, accion, campos, enviar, inicial, tickets, beneficiario, valoresIniciales, children, alCambiar, canastosViaje, etiquetaGuardar = 'Guardar' }: {
  titulo: string; accion: string; campos: Campo[];
  enviar: (datos: object) => Promise<boolean>; inicial?: object; tickets?: Fila[]; beneficiario?: string; valoresIniciales?: Fila; children?: ReactNode; alCambiar?: (campo: HTMLSelectElement) => void; canastosViaje?: string; etiquetaGuardar?: string;
}) {
  const [guardando, setGuardando] = useState(false);
  const [adicionales, setAdicionales] = useState<GastoAdicional[]>([]);
  const siguienteAdicional = useRef(0);

  function actualizarAdicional(id: number, cambios: Partial<GastoAdicional>) {
    setAdicionales(previos => previos.map(partida => partida.id === id ? { ...partida, ...cambios } : partida));
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const valores = Object.fromEntries([...new FormData(form)].filter(([, value]) => value !== ''));
    const partidasFijas = gastosFijos.flatMap(etiqueta => {
      const concepto = etiqueta.toLowerCase();
      return valores[concepto] ? [{ concepto, importe: valores[concepto] }] : [];
    });
    const partidas = [...partidasFijas, ...adicionales.map(({ concepto, cantidad, tarifaUnitaria }) =>
      ({ concepto, cantidad, tarifaUnitaria }))];
    setGuardando(true);
    try {
      if (await enviar({ accion, ...inicial, ...valores, ...(accion === 'gastos' && { partidas }) })) {
        form.reset();
        setAdicionales([]);
        delete form.dataset.dirty;
      }
    } finally {
      setGuardando(false);
    }
  }

  return <details className="accion"><summary onClick={event => {
    const panel = event.currentTarget.parentElement;
    if (panel?.hasAttribute('open') && panel.querySelector('[data-dirty="true"]')) event.preventDefault();
  }}>{titulo}</summary>
    <form className="captura" onSubmit={guardar}>
      {children}
      {campos.map(([nombre, etiqueta, tipo]) => <label key={nombre}>{etiqueta}
        {Array.isArray(tipo) ? <select name={nombre} defaultValue={valoresIniciales?.[nombre] ?? undefined} onChange={event => alCambiar?.(event.currentTarget)} required>
          {tipo.map(opcion => <option key={opcion}>{opcion}</option>)}
        </select> : <input name={nombre} defaultValue={nombre === 'beneficiario' ? beneficiario : valoresIniciales?.[nombre] ?? undefined} required={tipo !== 'opcional'}
          type={tipo === 'fecha' ? 'date' : 'text'}
          inputMode={tipo === 'decimal' ? 'decimal' : undefined} maxLength={nombre === 'beneficiario' ? 254 : 200} />}
      </label>)}
      {accion === 'gastos' && <fieldset>
        <legend>Importes en MXN</legend>
        <div className="captura">
          {gastosFijos.map(etiqueta => <label key={etiqueta}>{etiqueta}
            <input name={etiqueta.toLowerCase()} inputMode="decimal" pattern="[0-9]{1,9}([.][0-9]{1,2})?" />
          </label>)}
          <fieldset className="conceptos-adicionales">
            <legend>Conceptos adicionales</legend>
            {adicionales.map(partida => <div className="captura partida-adicional" key={partida.id}>
              <label>Concepto<select required value={partida.concepto} onChange={event => {
                const concepto = event.target.value;
                actualizarAdicional(partida.id, { concepto, cantidad: concepto === 'canastos' ? canastosViaje ?? '' : '' });
              }}>
                <option value="">Selecciona un concepto</option>
                {gastosOpcionales.map(([valor, etiqueta]) => <option key={valor} value={valor}
                  disabled={adicionales.some(otra => otra.id !== partida.id && otra.concepto === valor)}>{etiqueta}</option>)}
              </select></label>
              <label>Cantidad<input required value={partida.cantidad} inputMode="numeric"
                pattern="[1-9][0-9]{0,8}" onChange={event => actualizarAdicional(partida.id, { cantidad: event.target.value })} /></label>
              <label>Tarifa por unidad (MXN)<input required value={partida.tarifaUnitaria} inputMode="decimal"
                pattern="[0-9]{1,9}([.][0-9]{1,2})?"
                onChange={event => actualizarAdicional(partida.id, { tarifaUnitaria: event.target.value })} /></label>
              <p>Subtotal <output>{subtotalAdicional(partida)}</output></p>
              <button type="button" className="secondary" disabled={guardando} onClick={event => {
                if (event.currentTarget.form) event.currentTarget.form.dataset.dirty = 'true';
                setAdicionales(previos => previos.filter(otra => otra.id !== partida.id));
              }}>Quitar {gastosOpcionales.find(([valor]) => valor === partida.concepto)?.[1] ?? 'concepto'}</button>
            </div>)}
            <button type="button" className="secondary" disabled={guardando || adicionales.length >= gastosOpcionales.length}
              onClick={event => {
                if (event.currentTarget.form) event.currentTarget.form.dataset.dirty = 'true';
                const id = siguienteAdicional.current++;
                setAdicionales(previos => [...previos, { id, concepto: '', cantidad: '', tarifaUnitaria: '' }]);
              }}>Agregar concepto</button>
          </fieldset>
        </div>
      </fieldset>}
      {tickets && <label>Ticket de finca<select name="ticket" defaultValue={valoresIniciales?.ticket ?? undefined} onChange={event => alCambiar?.(event.currentTarget)} required>
        <option value="">Selecciona un ticket</option>
        {tickets.map(ticket => <option key={ticket.id} value={ticket.id ?? ''}>
          {ticket.folio} · {ticket.finca} · {ticket.kg} kg
        </option>)}
      </select></label>}
      <div className="acciones">
        <Volver disabled={guardando} onClick={event => {
          const form = event.currentTarget.form;
          if (!form || (form.dataset.dirty === 'true' && !confirmarSalida())) return;
          form.reset();
          setAdicionales([]);
          delete form.dataset.dirty;
          form.closest('details')?.removeAttribute('open');
        }} />
        <button disabled={guardando}>{guardando ? 'Guardando…' : etiquetaGuardar}</button>
      </div>
    </form>
  </details>;
}

type PartidaCompra = { productor: string; kg: string; tarifa: string; gastos: string };
type EscenarioGuardado = { partidas: PartidaCompra[]; resultado: Fila };

function ResultadoCompra({ resultado }: { resultado: Fila }) {
  return <span>{resultado.kg_recibidos} kg en fábrica · Costo {pesos.format(Number(resultado.costo_total))}
    {' · '}Reserva {pesos.format(Number(resultado.reserva))} · Utilidad {pesos.format(Number(resultado.utilidad))}
    {' · '}Margen {resultado.margen == null ? 'pendiente' : resultado.margen + ' %'}
    {resultado.carga_completa !== 'true' && Number(resultado.kg_pendientes) > 0 && <> · {resultado.kg_pendientes} kg pendientes</>}
  </span>;
}

function PlanCompra({ resumen, plan, registrar, guardar }: {
  resumen: Expediente['resumen'];
  plan?: NonNullable<Expediente['planes']>[number];
  registrar: (datos: object) => Promise<unknown>;
  guardar: (datos: object) => Promise<boolean>;
}) {
  const [filas, setFilas] = useState(() => (plan?.escenario?.partidas ?? []).map((partida, id) => ({ id, partida })));
  const [siguiente, setSiguiente] = useState(filas.length);
  const [resultados, setResultados] = useState<{ proveedores: string; resultado: Fila }[]>([]);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const mes = resumen.fecha_viaje?.slice(5, 7);
  const merma = mes === '12' ? '1' : mes === '05' ? '3.75' : '';
  async function calcular(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const datos = new FormData(form);
    const valor = (nombre: string) => String(datos.get(nombre) ?? '');
    const partidas = filas.map(({ id }) => ({
      productor: valor('productor-' + id), kg: valor('kg-' + id),
      tarifa: valor('tarifa-' + id), gastos: valor('gastos-' + id),
    }));
    const captura = { kg: valor('kg'), merma: valor('merma'), gastos: valor('gastos'), partidas };
    setError('');
    setOcupado(true);
    try {
      const boton = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      if (boton?.value === 'guardar') {
        if (await guardar({ accion: 'guardarEscenario', ...captura })) delete form.dataset.dirty;
      } else {
        const { resultado } = await registrar({ accion: 'simularCompra', ...captura }) as { resultado: Fila };
        setResultados(previos => [...previos, { proveedores: partidas.map(p => p.productor).join(', '), resultado }]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo simular la compra.');
    } finally {
      setOcupado(false);
    }
  }
  return <details className="accion"><summary>Planear la compra</summary>
    <p>{resumen.kg_comprados} kg comprados · {resumen.kg_pendientes ?? '—'} kg pendientes según la apertura</p>
    <form className="captura" onSubmit={calcular}>
      <label>Carga prevista en kg<input name="kg" defaultValue={plan?.kg ?? resumen.kg_previstos ?? ''} required inputMode="decimal" /></label>
      <label>Merma estimada (%)<input name="merma" defaultValue={plan?.merma ?? merma} required inputMode="decimal" /></label>
      <label>Gastos comunes (MXN)<input name="gastos" defaultValue={plan?.gastos ?? '0'} required inputMode="decimal" /></label>
      {filas.map(({ id, partida }) => <fieldset className="ancho-completo" key={id}>
        <legend>Oferta de compra</legend>
        <div className="captura">
          <label>Productor<input name={'productor-' + id} defaultValue={partida.productor} required /></label>
          <label>Kilos propuestos<input name={'kg-' + id} defaultValue={partida.kg} required inputMode="decimal" /></label>
          <label>Precio por tonelada<input name={'tarifa-' + id} defaultValue={partida.tarifa} required inputMode="decimal" /></label>
          <label>Gastos de la oferta (MXN)<input name={'gastos-' + id} defaultValue={partida.gastos} required inputMode="decimal" /></label>
          <button type="button" onClick={() => setFilas(previas => previas.filter(fila => fila.id !== id))}>Quitar oferta</button>
        </div>
      </fieldset>)}
      <div className="acciones">
        <button type="button" onClick={() => {
          setFilas(previas => [...previas, { id: siguiente, partida: { productor: '', kg: '', tarifa: '', gastos: '0' } }]);
          setSiguiente(siguiente + 1);
        }}>Agregar oferta</button>
        <button disabled={ocupado}>Simular</button>
        <button disabled={ocupado} value="guardar">Guardar estimación</button>
      </div>
    </form>
    {error && <p role="alert">{error}</p>}
    {resultados.length > 0 && <ol>{resultados.map(({ proveedores, resultado }, indice) => <li key={indice}>
      {proveedores || 'Compras registradas'} · <ResultadoCompra resultado={resultado} />
    </li>)}</ol>}
  </details>;
}

const seccionesViaje = [
  ['resumen', 'Resumen'], ['compras', 'Compras'], ['gastos', 'Gastos y chofer'],
  ['entrega', 'Entrega y cierre'], ['cobranza', 'Cobranza'],
] as const;
type SeccionViaje = (typeof seccionesViaje)[number][0];

export function Operacion({ cargar, registrar, administra, encargados, asignado, reasignar,
  aperturaViaje, vehiculo, abrirCobranza }: {
  aperturaViaje: DatosApertura | null;
  vehiculo: DatosApertura;
  abrirCobranza: () => void;
  cargar: () => Promise<Expediente>;
  registrar: (datos: object) => Promise<unknown>;
  administra: boolean;
  encargados: { user_id: string; email: string }[];
  asignado: string;
  reasignar: (datos: object) => Promise<void>;
}) {
  const [seccion, setSeccion] = useState<SeccionViaje>('resumen');
  const [datos, setDatos] = useState<Expediente>();
  const [mensaje, setMensaje] = useState('');
  const [reasignando, setReasignando] = useState(false);
  useEffect(() => {
    let vigente = true;
    cargar().then(resultado => { if (vigente) setDatos(resultado); }).catch(error => {
      if (vigente) setMensaje(error.message);
    });
    return () => { vigente = false; };
  }, [cargar]);

  async function enviar(nuevo: object) {
    setMensaje('');
    try {
      await registrar(nuevo);
      setDatos(await cargar());
      setMensaje('Registro guardado.');
      return true;
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'Ocurrió un error al guardar.');
      return false;
    }
  }

  const resumen = datos?.resumen;
  const cerrado = Boolean(resumen?.cerrado_en);
  const reasignado = Boolean(resumen?.reasignado_en);
  const camposGasto: Campo[] = [
    fecha, ['beneficiario','Beneficiario'],
    ['origen','Origen',administra ? ['directo','mensaje','llamada'] : ['directo']],
    cerrado ? motivo : ['motivo','Motivo de ajuste','opcional'],
  ];

  const camposGastoTicket: Campo[] = [...camposGasto, ['concepto','Concepto',conceptosTicket],
    importe, ['tarifa','Tarifa por tonelada','decimal']];
  function sugerirTarifa(ticket: string | null, concepto: string, form: HTMLFormElement | null) {
    const sugerencia = datos?.sugerencias?.find(item => item.ticket === ticket && item.concepto === concepto);
    if (!form) return;
    const campoTarifa = form.elements.namedItem('tarifa') as HTMLInputElement;
    const campoImporte = form.elements.namedItem('importe') as HTMLInputElement;
    campoTarifa.value = sugerencia?.tarifa ?? '';
    campoImporte.value = sugerencia?.importe ?? '';
  }

  function capturaGastoTicket(ticket: Fila) {
    if (!datos || reasignado || (cerrado && !administra)) return null;
    return <Formulario titulo="Registrar gasto" accion="gasto" enviar={enviar}
      beneficiario={datos.beneficiario} inicial={{ ticket: ticket.id }} campos={camposGastoTicket}
      alCambiar={(campo) => {
        if (campo.name === 'concepto') sugerirTarifa(ticket.id, campo.value, campo.form);
      }}>
      <p>Peso del ticket {ticket.kg} kg</p>
      {datos.sugerencias?.filter(item => item.ticket === ticket.id).map(item => <button
        type="button" className="secondary" key={item.concepto} onClick={event => {
          const form = event.currentTarget.form;
          const concepto = form?.elements.namedItem('concepto') as HTMLSelectElement | null;
          if (concepto && item.concepto) concepto.value = item.concepto;
          sugerirTarifa(ticket.id, item.concepto ?? '', form);
          if (form) form.dataset.dirty = 'true';
        }}>{item.concepto} · {pesos.format(Number(item.tarifa))}/t</button>)}
    </Formulario>;
  }

  let siguiente: { seccion: SeccionViaje; etiqueta: string } | undefined;
  if (administra && resumen?.acuerdos && !cerrado && !reasignado) {
    if (!resumen.kg_ticket || resumen.kg_correo == null || Number(resumen.kg_ticket) !== Number(resumen.kg_correo)) {
      siguiente = { seccion: 'entrega', etiqueta: 'Revisar entrega y recepción' };
    } else if (Number(resumen.gastos_pendientes) > 0 || datos?.gastos?.some(gasto => gasto.requiere_revision_ticket)) {
      siguiente = { seccion: 'gastos', etiqueta: 'Revisar gastos' };
    } else siguiente = { seccion: 'entrega', etiqueta: 'Ir al cierre' };
  }
  if (administra && cerrado && (Number(resumen?.saldo_producto ?? resumen?.venta_confirmada) > 0 ||
    Number(resumen?.saldo_flete ?? resumen?.flete_cliente) > 0)) {
    siguiente = { seccion: 'cobranza', etiqueta: 'Consultar saldos pendientes' };
  }

  return <section className="operacion">
    {mensaje && <p role="status">{mensaje}</p>}
    {!datos && !mensaje && <p>Cargando expediente…</p>}
    {datos && resumen && <>
      <h4>{reasignado ? 'Viaje reasignado' : cerrado ? 'Operación cerrada' : 'Operación abierta'}</h4>
      <nav className="acciones" aria-label="Secciones del viaje">
        {seccionesViaje.filter(([id]) => administra || (id !== 'entrega' && id !== 'cobranza')).map(([id, etiqueta]) =>
          <button type="button" key={id} aria-pressed={seccion === id}
            className={seccion === id ? undefined : 'secondary'} onClick={() => setSeccion(id)}>{etiqueta}</button>)}
      </nav>
      <section className="seccion-viaje" hidden={seccion !== 'resumen'}>
        <h4>Resumen</h4>
          <DatosDelViaje datos={aperturaViaje ?? vehiculo} />
          {siguiente && <p><button type="button" onClick={() => setSeccion(siguiente.seccion)}>{siguiente.etiqueta}</button></p>}
        {administra && resumen.acuerdos && <>
          <dl className="indicadores">
            {([
              ['Costo operativo', resumen.costo],
              ['Resultado de producto', resumen.resultado_producto],
              ['Resultado con flete', resumen.resultado_total],
            ] as const).map(([etiqueta, valor]) => <div key={etiqueta}>
              <dt>{etiqueta}</dt><dd>{valor == null ? 'Pendiente' : pesos.format(Number(valor))}</dd>
            </div>)}
          </dl>
          {resumen.kg_ticket && <p>Merma real {resumen.merma_kg} kg ({resumen.merma_pct ?? '—'} %).
            {Number(resumen.merma_kg) < 0 && ' Revisa el peso recibido.'}
            {resumen.kg_correo == null && ' Falta el correo de recepción.'}
            {resumen.kg_correo != null && Number(resumen.kg_ticket) !== Number(resumen.kg_correo) && ' El peso del correo difiere del ticket.'}</p>}
          <p>Margen de producto {resumen.margen_producto ?? '—'} % · Margen con flete {resumen.margen_total ?? '—'} %</p>
        </>}
      </section>
      <section className="seccion-viaje" hidden={seccion !== 'compras'}>
        <h4>Compras</h4>
        {administra && !!datos.planes?.length && <details><summary>Historial de estimaciones</summary><ul>
            {datos.planes.map(escenario => <li key={escenario.id}>
              {escenario.kg} kg · {escenario.merma} % de merma · Reserva {pesos.format(Number(escenario.reserva))}
              {escenario.escenario && <> · <ResultadoCompra resultado={escenario.escenario.resultado} /></>}
            </li>)}
          </ul></details>}
        {resumen.acuerdos && <>
          {administra && !cerrado && !reasignado && <PlanCompra key={datos.planes?.at(-1)?.id ?? 'inicial'} resumen={resumen} plan={datos.planes?.at(-1)}
            registrar={registrar} guardar={enviar} />}

          <p>Folio {resumen.folio_compra} · {resumen.kg_comprados} kg comprados
            {resumen.kg_pendientes != null && <> · {resumen.kg_pendientes} kg pendientes</>}
          </p>
          {administra && !cerrado && !reasignado && <Formulario titulo="Agregar ticket de finca"
            accion="compra" enviar={enviar} campos={camposCompraNueva}>
            <p>Folio de compra {resumen.folio_compra}</p>
          </Formulario>}
          {datos.remisiones?.map(remision => {
            const tickets = datos.compras.filter(ticket => ticket.productor === remision.productor);
            const fincas = [...new Set(tickets.flatMap(ticket => ticket.finca ? [ticket.finca] : []))];
            return <details key={remision.productor}>
              <summary>{remision.folio} · {remision.productor}</summary>
              <p>Total {remision.kg} kg · {pesos.format(Number(remision.importe))} · Reserva pactada {pesos.format(Number(remision.reserva))}</p>
              <p>Reserva sugerida {pesos.format(Number(remision.reserva_sugerida))}</p>
              {!cerrado && !reasignado && <Formulario titulo="Agregar ticket" accion="compra" enviar={enviar}
                inicial={{ productor: remision.productor }}
                campos={camposCompraNueva.filter(campo => campo[0] !== 'productor' && campo[0] !== 'finca')}
              >
                <p>{remision.productor} · {remision.folio}</p>
                <label>Finca<input name="finca" required maxLength={200} list={remision.folio ?? undefined}
                  defaultValue={fincas.length === 1 ? fincas[0] : undefined} /></label>
                <datalist id={remision.folio ?? undefined}>{fincas.map(finca => <option key={finca} value={finca} />)}</datalist>
              </Formulario>}
              {tickets.map(ticket => <details key={ticket.id}>
                <summary>{ticket.folio} · {ticket.finca} · {ticket.kg} kg</summary>
                <p>{ticket.variedad} · {pesos.format(Number(ticket.tarifa))}/t · Importe {pesos.format(Number(ticket.importe))}
                  {' · '}Reserva {pesos.format(Number(ticket.reserva))}</p>
                {!cerrado && !reasignado && <Formulario key={ticket.version} titulo="Corregir ticket"
                  accion="corregirCompra" enviar={enviar} inicial={{ ticket: ticket.id, version: ticket.version }}
                  valoresIniciales={valoresTicket(ticket)} campos={[...camposTicket, motivo]} />}
                {capturaGastoTicket(ticket)}
              </details>)}
            </details>;
          })}
          {!administra && datos.compras.map(ticket => <details key={ticket.id}>
            <summary>{ticket.folio} · {ticket.finca} · {ticket.kg} kg</summary>
            {capturaGastoTicket(ticket)}
          </details>)}
        </>}
      </section>
      <section className="seccion-viaje" hidden={seccion !== 'gastos'}>
        <h4>Gastos y chofer</h4>
          {administra && <p>Saldo del chofer {resumen.saldo_chofer == null ? 'pendiente' : pesos.format(Number(resumen.saldo_chofer))}</p>}
        {resumen.acuerdos && !reasignado && (administra || !cerrado) && <>
          {administra && !cerrado && <details><summary>Tarifas sugeridas por ticket</summary>
            <ul>{datos.tarifas?.map(tarifa => <li key={[tarifa.ambito, tarifa.referencia, tarifa.concepto].join(':')}>
              {tarifa.ambito === 'viaje' ? 'Este viaje' : tarifa.referencia} · {tarifa.concepto} · {pesos.format(Number(tarifa.tarifa))}/t
            </li>)}</ul>
            <Formulario titulo="Configurar tarifa" accion="tarifaGasto" enviar={enviar}
              campos={ [['ambito','Aplicar por',['viaje','finca','productor']],
                ['referencia','Nombre de la finca o productor','opcional'], ['concepto','Concepto',conceptosTicket],
                ['tarifa','Tarifa por tonelada','decimal'], motivo] } />
          </details>}
          <Formulario titulo="Capturar gasto" accion="gastos" enviar={enviar}
            beneficiario={datos.beneficiario} campos={camposGasto} canastosViaje={vehiculo.canastos ?? aperturaViaje?.canastos} />
          {datos.compras.length > 0 && <Formulario titulo="Capturar gasto por ticket de finca" accion="gasto" enviar={enviar}
            beneficiario={datos.beneficiario} tickets={datos.compras}
            campos={camposGastoTicket} alCambiar={campo => {
              if (!['ticket', 'concepto'].includes(campo.name) || !campo.form) return;
              const seleccion = new FormData(campo.form);
              sugerirTarifa(String(seleccion.get('ticket') ?? ''), String(seleccion.get('concepto') ?? ''), campo.form);
            }} />}
        </>}
        {administra && resumen.acuerdos && !reasignado && <Formulario titulo="Abonar al flete del chofer" accion="abono" enviar={enviar}
          campos={[fecha, importe, ['referencia','Referencia']]} />}
        {(reasignado || !administra) && !!datos.gastos?.length && <details><summary>Gastos registrados</summary>
          <ul>{datos.gastos.map(gasto => <li key={gasto.id}>{gasto.concepto} · {gasto.beneficiario} · {
            pesos.format(Number(gasto.importe))} · {gasto.estado}{detalleGastoUnitario(gasto)}</li>)}</ul>
        </details>}
        {administra && reasignado && !!datos.abonos?.length && <details><summary>Abonos registrados</summary>
          <ul>{datos.abonos.map(abono => <li key={abono.id}>{abono.referencia} · {
            pesos.format(Number(abono.importe))}</li>)}</ul>
        </details>}
        {administra && !reasignado && datos.gastos?.map(gasto => <Formulario key={gasto.id} titulo={
          gasto.concepto + ' · ' + gasto.beneficiario + ' · ' + pesos.format(Number(gasto.importe)) + ' · ' + gasto.estado
          + detalleGastoUnitario(gasto) + (gasto.requiere_revision_ticket ? ' · Revisar peso del ticket' : '')
        } accion="revision" enviar={enviar} inicial={{ gasto: gasto.id }}
          valoresIniciales={gasto} campos={ [['estado','Resultado de la revisión',['aprobado','devuelto']], importe, motivo] } />)}
      </section>
      {administra && <>
      <section className="seccion-viaje" hidden={seccion !== 'entrega'}>
        <h4>Entrega y cierre</h4>
          {datos.ticketFabrica && <p>Ticket de fábrica {datos.ticketFabrica.folio} · {datos.ticketFabrica.kg} kg</p>}
          {datos.recepcion && <p>Entrada SAP {datos.recepcion.sap} · {datos.recepcion.kg_correo} kg</p>}
          {datos.entrega && typeof resumen.acuerdos === 'object' && resumen.acuerdos && <details>
            <summary>Remisión de entrega · {datos.entrega.folio}</summary>
            <p>{datos.entrega.fecha} · {resumen.acuerdos.producto} · {datos.entrega.kg} kg</p>
            <p>Precio pactado por tonelada {pesos.format(Number(resumen.acuerdos.venta))}</p>
          </details>}
        {administra && resumen.acuerdos && !cerrado && !reasignado && <>
          <Formulario key={datos.ticketFabrica ? 'corregir-ticket' : 'registrar-ticket'}
            titulo={datos.ticketFabrica ? 'Corregir ticket de fábrica' : 'Registrar ticket de fábrica'}
            accion="ticketFabrica" enviar={enviar} valoresIniciales={datos.ticketFabrica} campos={[fecha,
              ['folio','Folio del ticket'], ['kg','Peso neto (kg)','decimal'], ...(datos.ticketFabrica ? [motivo] : [])]} />
          {!datos.entrega && datos.ticketFabrica?.folio?.trim() && datos.ticketFabrica.fecha && Number(datos.ticketFabrica.kg) > 0 &&
            typeof resumen.acuerdos === 'object' && <Formulario titulo="Emitir remisión de entrega" accion="entrega" enviar={enviar}
              etiquetaGuardar="Emitir remisión" campos={[fecha]} valoresIniciales={datos.ticketFabrica}>
              <p className="ancho-completo">{resumen.customer} · {resumen.acuerdos.producto} · {datos.ticketFabrica.kg} kg · {
                pesos.format(Number(resumen.acuerdos.venta))}/t. El folio se asigna al emitir.</p>
            </Formulario>}
          {datos.entrega && <Formulario titulo={datos.recepcion ? 'Corregir correo de recepción' : 'Registrar correo de recepción'}
            accion="recepcion" enviar={enviar}
            valoresIniciales={{ ...datos.recepcion, fecha: datos.recepcion?.fecha_capturada ?? null, folio: datos.entrega.folio, kgCorreo: datos.recepcion?.kg_correo ?? null }} campos={ [fecha, ['folio','Folio de remisión'], ['sap','Entrada SAP'], ['orden','Orden de compra'],
              ['kgCorreo','Peso del correo (kg)','decimal'], ['venta','Importe confirmado de producto (MXN)','decimal'],
              ...(datos.recepcion ? [motivo] : [])] } />}
          <details className="accion"><summary>Cerrar operación</summary>
            <Formulario titulo="Cerrar" etiquetaGuardar="Confirmar cierre" accion="cierre" enviar={enviar} campos={[motivo]} />
            <details className="accion"><summary>Reasignar como nueva solicitud</summary>
              <form className="captura" onSubmit={async event => {
                event.preventDefault();
                const form = event.currentTarget;
                const valores = new FormData(form);
                setReasignando(true);
                setMensaje('');
                try {
                  await reasignar({ userId: valores.get('userId'), reason: valores.get('reason') });
                  delete form.dataset.dirty;
                  setDatos(await cargar());
                  setMensaje('Viaje reasignado. La solicitud está pendiente de corrección.');
                } catch (cause) {
                  setMensaje(cause instanceof Error ? cause.message : 'No se pudo reasignar el viaje.');
                } finally { setReasignando(false); }
              }}>
                <p className="ancho-completo">El expediente original quedará como referencia de solo lectura.</p>
                <label>Encargado<select name="userId" required defaultValue={encargados.some(item => item.user_id === asignado) ? asignado : ''}>
                  <option value="" disabled>Selecciona un encargado</option>
                  {encargados.map(item => <option key={item.user_id} value={item.user_id}>{item.email}</option>)}
                </select></label>
                <label>Motivo<input name="reason" minLength={3} maxLength={300} required /></label>
                <div className="acciones"><Volver disabled={reasignando} onClick={event => {
                  const form = event.currentTarget.form;
                  if (!form || !confirmarSalida()) return;
                  form.reset();
                  delete form.dataset.dirty;
                  form.closest('details')?.removeAttribute('open');
                }} /><button disabled={reasignando || !encargados.length}>Confirmar reasignación</button></div>
              </form>
            </details>
          </details>
        </>}
      </section>
      <section className="seccion-viaje" hidden={seccion !== 'cobranza'}>
        <h4>Cobranza del viaje</h4>
          <dl className="indicadores">
            {([
              ['Saldo por cobrar de piña', resumen.saldo_producto ?? resumen.venta_confirmada],
              ['Saldo por cobrar de flete', resumen.saldo_flete ?? resumen.flete_cliente],
            ] as const).map(([etiqueta, valor]) => <div key={etiqueta}>
              <dt>{etiqueta}</dt><dd>{valor == null ? 'Pendiente' : pesos.format(Number(valor))}</dd>
            </div>)}
          </dl>
          {Number(resumen.adelanto_flete_agrupado) > 0 && <p>La remisión de flete tiene un adelanto agrupado. Consulta su saldo neto en Cobranza.</p>}
          <button type="button" onClick={abrirCobranza}>Ver saldos de este viaje</button>
      </section>
      </>}
    </>}
  </section>;
}

export type { Expediente };
