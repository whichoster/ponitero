'use client';

import { Volver } from './volver';
import { useState, type FormEvent } from 'react';

const campos = [
  ['reference', 'Folio'], ['customer', 'Cliente'], ['producto', 'Producto'],
  ['variedad', 'Variedad o variedades'], ['fecha', 'Fecha', 'date'],
  ['kg', 'Kilos previstos'], ['venta', 'Precio de venta por tonelada'],
  ['chofer', 'Chofer'], ['placas', 'Placas'], ['vehiculo', 'Tipo de vehículo'],
  ['canastos', 'Cantidad de canastos'], ['tara', 'Tara del vehículo en kg (opcional)'],
  ['fleteChofer', 'Tarifa del chofer por tonelada'], ['fleteCliente', 'Flete del cliente por tonelada (opcional)'],
] as const;

export type DatosApertura = Partial<Record<typeof campos[number][0], string>>;

export function confirmarSalida() {
  return !document.querySelector('form[data-dirty="true"]') ||
    window.confirm('Hay datos sin guardar. ¿Quieres salir y descartar la captura?');
}

export function DatosDelViaje({ datos }: { datos: DatosApertura }) {
  return <dl>{campos.map(([nombre, etiqueta]) => datos[nombre] && <div key={nombre}>
    <dt>{etiqueta.replace(' (opcional)', '')}</dt><dd>{datos[nombre]}</dd>
  </div>)}</dl>;
}

export function Apertura({ titulo, inicial, busy, enviar, volver, folioFijo, soloVehiculo, vehiculoFijo, motivo }: {
  titulo: string;
  inicial?: DatosApertura;
  busy: boolean;
  enviar: (event: FormEvent<HTMLFormElement>, datos: DatosApertura) => void;
  volver: () => void;
  folioFijo?: boolean;
  soloVehiculo?: boolean;
  vehiculoFijo?: boolean;
  motivo?: boolean;
}) {
  const [paso, setPaso] = useState(0);
  const [datos, setDatos] = useState<DatosApertura>(inicial ?? {});
  const [dirty, setDirty] = useState(false);
  const [razon, setRazon] = useState('');
  return <form className="captura" data-dirty={dirty} onSubmit={event => {
    event.preventDefault();
    if (paso === 0 && !soloVehiculo) setPaso(1);
    else enviar(event, Object.fromEntries(Object.entries(datos).filter(([, valor]) => valor !== '')));
  }}>
    <h4>{soloVehiculo ? 'Datos del vehículo' : paso === 0 ? 'Datos del viaje' : 'Vehículo y tarifas de flete'}</h4>
    {(soloVehiculo ? campos.slice(7, 12) : paso === 0 ? campos.slice(0, 7) : campos.slice(vehiculoFijo ? 12 : 7)).map(([nombre, etiqueta, tipo]) => {
      const value = datos[nombre] ?? '';
      const actualizar = (valor: string) => {
        setDatos(anterior => ({ ...anterior, [nombre]: valor }));
        setDirty(true);
      };
      return <label key={nombre}>{etiqueta}
        {nombre === 'vehiculo' ? <select required value={value} onChange={event => actualizar(event.target.value)}>
          <option value="">Selecciona un tipo</option>
          {['Torton','Rabón','Camioneta','Jaula'].map(opcion => <option key={opcion}>{opcion}</option>)}
        </select> : <input type={tipo ?? 'text'} value={value} maxLength={nombre === 'reference' ? 50 : 100}
          minLength={nombre === 'customer' ? 2 : undefined}
          readOnly={folioFijo && (nombre === 'reference' || nombre === 'customer')}
          required={nombre !== 'tara' && nombre !== 'fleteCliente'}
          inputMode={nombre === 'canastos' ? 'numeric' : ['kg','venta','tara','fleteChofer','fleteCliente'].includes(nombre) ? 'decimal' : undefined}
          onChange={event => actualizar(event.target.value)} />}
      </label>;
    })}
    {paso === 1 && motivo && <label>Motivo de devolución<input name="reason" minLength={3} maxLength={300}
      required value={razon} onChange={event => { setRazon(event.target.value); setDirty(true); }} /></label>}
    <div className="acciones">
      <Volver disabled={busy} onClick={() => paso ? setPaso(0) : confirmarSalida() && volver()} />
      <button disabled={busy}>{paso === 0 && !soloVehiculo ? 'Continuar' : titulo}</button>
    </div>
  </form>;
}
