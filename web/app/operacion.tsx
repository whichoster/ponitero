'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Fila = Record<string, string | null>;
type Expediente = {
  resumen: Omit<Fila, 'acuerdos'> & { acuerdos?: boolean | { producto: string; venta: string } };
  planes?: Fila[];
  compras: Fila[];
  remisiones?: Fila[];
  gastos?: Fila[];
  abonos?: Fila[];
  recepcion?: Fila;
  entrega?: Fila;
  ticketFabrica?: Fila;
};
type Campo = [nombre: string, etiqueta: string, tipo?: 'fecha' | 'decimal' | 'opcional' | string[]];
const fecha: Campo = ['fecha', 'Fecha', 'fecha'];
const motivo: Campo = ['motivo', 'Motivo'];
const importe: Campo = ['importe', 'Importe en MXN', 'decimal'];
const pesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function Formulario({ titulo, accion, campos, enviar, inicial, tickets }: {
  titulo: string; accion: string; campos: Campo[];
  enviar: (datos: object) => Promise<boolean>; inicial?: object; tickets?: Fila[];
}) {
  const [guardando, setGuardando] = useState(false);
  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const valores = Object.fromEntries([...new FormData(form)].filter(([, value]) => value !== ''));
    setGuardando(true);
    try {
      if (await enviar({ accion, ...inicial, ...valores })) form.reset();
    } finally {
      setGuardando(false);
    }
  }

  return <details className="accion"><summary>{titulo}</summary>
    <form className="captura" onSubmit={guardar}>
      {campos.map(([nombre, etiqueta, tipo]) => <label key={nombre}>{etiqueta}
        {Array.isArray(tipo) ? <select name={nombre} required>
          {tipo.map(opcion => <option key={opcion}>{opcion}</option>)}
        </select> : <input name={nombre} required={tipo !== 'opcional'}
          type={tipo === 'fecha' ? 'date' : 'text'}
          inputMode={tipo === 'decimal' ? 'decimal' : undefined} maxLength={200} />}
      </label>)}
      {tickets && <label>Ticket de finca<select name="ticket">
        <option value="">Gasto general</option>
        {tickets.map(ticket => <option key={ticket.id} value={ticket.id ?? ''}>
          {ticket.folio} · {ticket.finca} · {ticket.kg} kg
        </option>)}
      </select></label>}
      <button disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
    </form>
  </details>;
}

export function Operacion({ cargar, registrar, administra }: {
  cargar: () => Promise<Expediente>;
  registrar: (datos: object) => Promise<unknown>;
  administra: boolean;
}) {
  const [datos, setDatos] = useState<Expediente>();
  const [mensaje, setMensaje] = useState('');
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
  const plan = datos?.planes?.at(-1);
  const conceptos = ['corte','estiba','flete local','vaciado','pasaje','canastos','escalera','agua','lonches','mandados','combustible propio','otro'];

  return <section className="operacion">
    {mensaje && <p role="status">{mensaje}</p>}
    {!datos && !mensaje && <p>Cargando expediente…</p>}
    {datos && resumen && <>
      <h4>{cerrado ? 'Operación cerrada' : 'Operación abierta'}</h4>
      {administra && resumen.acuerdos && <>
        <dl className="indicadores">
          {([
            ['Tope conservador por tonelada', plan?.tope_por_tonelada],
            ['Costo operativo', resumen.costo],
            ['Resultado de producto', resumen.resultado_producto],
            ['Resultado con flete', resumen.resultado_total],
            ['Saldo del chofer', resumen.saldo_chofer],
            ['Flete acordado con cliente', resumen.flete_cliente],
          ] as const).map(([etiqueta, valor]) => <div key={etiqueta}>
            <dt>{etiqueta}</dt><dd>{valor == null ? 'Pendiente' : pesos.format(Number(valor))}</dd>
          </div>)}
        </dl>
        {Number(plan?.tope_conservador) < 0 && <p>La meta del 30 % es inviable con este escenario.</p>}
        {resumen.kg_ticket && <p>Merma real {resumen.merma_kg} kg ({resumen.merma_pct ?? '—'} %).
          {Number(resumen.merma_kg) < 0 && ' Revisa el peso recibido.'}
          {resumen.kg_correo == null && ' Falta el correo de recepción.'}
          {resumen.kg_correo != null && Number(resumen.kg_ticket) !== Number(resumen.kg_correo) && ' El peso del correo difiere del ticket.'}</p>}
        <p>Margen de producto {resumen.margen_producto ?? '—'} % · Margen con flete {resumen.margen_total ?? '—'} %</p>
        {!!datos.planes?.length && <details><summary>Historial de estimaciones</summary><ul>
          {datos.planes.map(escenario => <li key={escenario.id}>
            {escenario.kg} kg · {escenario.merma} % de merma · Tope comercial {pesos.format(Number(escenario.tope_comercial))}
            {' · '}Reserva {pesos.format(Number(escenario.reserva))} · Tope conservador {pesos.format(Number(escenario.tope_conservador))}
            {escenario.oferta != null && <> · Oferta {pesos.format(Number(escenario.oferta))}/t · Resultado simulado{' '}
              {pesos.format(Number(escenario.resultado_simulado))}{escenario.margen_simulado != null && ' (' + escenario.margen_simulado + ' %)'}</>}
          </li>)}
        </ul></details>}
        {datos.entrega && typeof resumen.acuerdos === 'object' && resumen.acuerdos && <details>
          <summary>Remisión de entrega · {datos.entrega.folio}</summary>
          <p>{datos.entrega.fecha} · {resumen.acuerdos.producto} · {datos.entrega.kg} kg</p>
          <p>Precio pactado por tonelada {pesos.format(Number(resumen.acuerdos.venta))}</p>
        </details>}
        {datos.remisiones?.map(remision => <details key={remision.productor}>
          <summary>Remisión de compra · {remision.productor}</summary>
          <ul>{datos.compras.filter(ticket => ticket.productor === remision.productor).map(ticket => <li key={ticket.id}>
            {ticket.folio} · {ticket.finca} · {ticket.variedad} · {ticket.kg} kg · {pesos.format(Number(ticket.importe))}
          </li>)}</ul>
          <p>Reserva sugerida {pesos.format(Number(remision.reserva_sugerida))}</p>
          <p>Total {remision.kg} kg · {pesos.format(Number(remision.importe))} · Reserva pactada {pesos.format(Number(remision.reserva))}</p>
        </details>)}
      </>}
      {administra && !resumen.acuerdos && <Formulario titulo="Fijar acuerdos" accion="acuerdos" enviar={enviar}
        campos={[fecha, ['producto','Producto'], ['chofer','Chofer'], ['vehiculo','Vehículo'], ['placas','Placas'],
          ['venta','Precio de venta por tonelada','decimal'], ['fleteChofer','Tarifa al chofer por tonelada','decimal'],
          ['fleteCliente','Flete al cliente por tonelada (0 si no aplica)','decimal']]} />}
      {administra && resumen.acuerdos && !cerrado && <>
        <Formulario titulo="Guardar estimación" accion="plan" enviar={enviar}
          campos={ [['kg','Compra prevista en kg','decimal'], ['merma','Merma estimada (%)','decimal'], ['gastos','Otros gastos previstos (MXN)','decimal'], ['oferta','Oferta a simular por tonelada','opcional']] } />
        <Formulario titulo="Agregar ticket de finca" accion="compra" enviar={enviar}
          campos={ [['folio','Folio'], ['finca','Finca'], ['productor','Productor'],
            ['variedad','Variedad',['Cayena','MD2','Champaca','Otra']], ['descripcion','Descripción de otra variedad','opcional'],
            ['kg','Peso en kg','decimal'], ['tarifa','Compra por tonelada','decimal'], ['reserva','Reserva pactada (MXN)','decimal']] } />
        {!datos.entrega && <Formulario titulo="Emitir remisión de entrega" accion="entrega" enviar={enviar}
          campos={[fecha, ['folio','Folio de remisión'], ['kg','Peso consignado (kg)','decimal']]} />}
        {datos.entrega && <Formulario titulo={datos.ticketFabrica ? 'Corregir ticket de fábrica' : 'Registrar ticket de fábrica'}
          accion="ticketFabrica" enviar={enviar} campos={[fecha, ['folio','Folio del ticket'], ['kg','Peso neto (kg)','decimal'],
            ...(datos.ticketFabrica ? [motivo] : [])]} />}
        {datos.entrega && <Formulario titulo={datos.recepcion ? 'Corregir correo de recepción' : 'Registrar correo de recepción'}
          accion="recepcion" enviar={enviar}
          campos={ [fecha, ['folio','Folio de remisión'], ['sap','Entrada SAP'], ['orden','Orden de compra'],
            ['kgCorreo','Peso del correo (kg)','decimal'], ['venta','Importe confirmado de producto (MXN)','decimal'],
            ...(datos.recepcion ? [motivo] : [])] } />}
        <Formulario titulo="Cerrar operación" accion="cierre" enviar={enviar} campos={[motivo]} />
      </>}
      {resumen.acuerdos && (administra || !cerrado) && <Formulario titulo="Capturar gasto" accion="gasto" enviar={enviar}
        tickets={datos.compras} campos={[fecha, ['concepto','Concepto',conceptos], ['beneficiario','Beneficiario'], importe,
          ['tarifa','Tarifa por tonelada (para ticket)','opcional'], ['origen','Origen',administra ? ['directo','mensaje','llamada'] : ['directo']],
          cerrado ? motivo : ['motivo','Motivo de ajuste','opcional']]} />}
      {administra && resumen.acuerdos && <Formulario titulo="Abonar al flete del chofer" accion="abono" enviar={enviar}
        campos={[fecha, importe, ['referencia','Referencia']]} />}
      {administra && datos.gastos?.map(gasto => <Formulario key={gasto.id} titulo={
        gasto.concepto + ' · ' + gasto.beneficiario + ' · ' + pesos.format(Number(gasto.importe)) + ' · ' + gasto.estado
      } accion="revision" enviar={enviar} inicial={{ gasto: gasto.id }}
        campos={ [['estado','Resultado de la revisión',['aprobado','devuelto']], importe, motivo] } />)}
    </>}
  </section>;
}

export type { Expediente };
