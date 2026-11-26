'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { confirmarSalida } from './apertura';
import { Volver } from './volver';

type Empleado = { user_id: string; email: string; role: string; can_manage_workers: boolean; can_edit: boolean; can_remove: boolean };
type Pagina = { members: Empleado[]; total: number; page: number; superAdmin: boolean; canAdd: boolean };
type Modal = { tipo: 'alta' } | { tipo: 'editar'; empleado: Empleado } | { tipo: 'baja'; empleados: Empleado[] };

export function Empleados({ nombre, consultar, volver }: {
  nombre: string;
  consultar: <T>(sufijo: string, method?: string, body?: object) => Promise<T>;
  volver: () => void;
}) {
  const [pagina, setPagina] = useState<Pagina>();
  const [seleccion, setSeleccion] = useState<Record<string, Empleado>>({});
  const [modal, setModal] = useState<Modal>();
  const [rol, setRol] = useState('encargado');
  const [error, setError] = useState('');
  const [errorModal, setErrorModal] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogo = useRef<HTMLDialogElement>(null);

  const cargar = useCallback((numero: number) => consultar<Pagina>('?page=' + numero), [consultar]);
  useEffect(() => {
    let vigente = true;
    cargar(1).then(resultado => { if (vigente) setPagina(resultado); }).catch(causa => {
      if (vigente) setError(causa.message);
    });
    return () => { vigente = false; };
  }, [cargar]);

  function abrir(accion: Modal) {
    setErrorModal('');
    setRol('encargado');
    setModal(accion);
    dialogo.current?.showModal();
  }

  function cerrar() {
    if (busy || !confirmarSalida()) return;
    dialogo.current?.close();
    setModal(undefined);
  }

  async function cambiarPagina(numero: number) {
    setBusy(true);
    setError('');
    try {
      setPagina(await cargar(numero));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la página.');
    } finally {
      setBusy(false);
    }
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || !pagina) return;
    const form = event.currentTarget;
    const datos = new FormData(form);
    const reason = datos.get('reason');
    setBusy(true);
    setErrorModal('');
    try {
      if (modal.tipo === 'alta') {
        await consultar('', 'POST', { email: datos.get('email'), role: rol, canManageWorkers: datos.has('permiso'), reason });
      } else if (modal.tipo === 'editar') {
        await consultar('/' + modal.empleado.user_id, 'PATCH', { canManageWorkers: datos.has('permiso'), reason });
      } else {
        const ids = modal.empleados.map(empleado => empleado.user_id);
        if (ids.length === 1) await consultar('/' + ids[0], 'DELETE', { reason });
        else await consultar('/bulk-removal', 'POST', { userIds: ids, reason });
        setSeleccion(anterior => Object.fromEntries(Object.entries(anterior).filter(([id]) => !ids.includes(id))));
      }
      delete form.dataset.dirty;
      dialogo.current?.close();
      setModal(undefined);
      await cambiarPagina(pagina.page);
    } catch (cause) {
      setErrorModal(cause instanceof Error ? cause.message : 'No se pudo completar el cambio.');
    } finally {
      setBusy(false);
    }
  }

  const elegibles = pagina?.members.filter(item => item.can_remove) ?? [];
  const todos = elegibles.length > 0 && elegibles.every(item => seleccion[item.user_id]);
  const seleccionados = Object.values(seleccion);
  function marcar(empleados: Empleado[], checked: boolean) {
    setSeleccion(anterior => {
      const siguiente = { ...anterior };
      for (const empleado of empleados) {
        if (checked) siguiente[empleado.user_id] = empleado;
        else delete siguiente[empleado.user_id];
      }
      return siguiente;
    });
  }

  return <section className="panel empleados">
    <div className="encabezado-negocio"><Volver etiqueta="Volver al negocio" disabled={busy} onClick={volver} /><h1>Empleados</h1></div>
    <p>{nombre}</p>
    {error && <p role="alert" className="error">{error}</p>}
    {pagina && <>
      <div className="acciones">
        {pagina.canAdd && <button disabled={busy} onClick={() => abrir({ tipo: 'alta' })}>Agregar empleado</button>}
        {pagina.canAdd && <button className="secondary" disabled={busy || !seleccionados.length}
          onClick={() => abrir({ tipo: 'baja', empleados: seleccionados })}>Eliminar seleccionados</button>}
        {seleccionados.length > 0 && <p role="status">Seleccionados {seleccionados.length}</p>}
      </div>
      <div className="tabla-desplazable"><table>
        <thead><tr>
          {pagina.canAdd && <th scope="col"><input type="checkbox" aria-label="Seleccionar empleados de esta página"
            checked={todos} disabled={busy || !elegibles.length} onChange={event => marcar(elegibles, event.target.checked)} /></th>}
          <th scope="col">Correo</th><th scope="col">Rol</th><th scope="col">Gestiona encargados</th><th scope="col">Acciones</th>
        </tr></thead>
        <tbody>{pagina.members.map(empleado => <tr key={empleado.user_id}>
          {pagina.canAdd && <td>{empleado.can_remove && <input type="checkbox" aria-label={'Seleccionar ' + empleado.email}
            checked={Boolean(seleccion[empleado.user_id])} disabled={busy} onChange={event => marcar([empleado], event.target.checked)} />}</td>}
          <td>{empleado.email}</td><td>{empleado.role}</td>
          <td>{empleado.role === 'administrador' ? empleado.can_manage_workers ? 'Sí' : 'No' : '—'}</td>
          <td><div className="acciones">
            {empleado.can_edit && <button className="secondary" disabled={busy} aria-label={'Editar ' + empleado.email}
              title="Editar permiso" onClick={() => abrir({ tipo: 'editar', empleado })}>✎</button>}
            {empleado.can_remove && <button className="secondary" disabled={busy} aria-label={'Dar de baja a ' + empleado.email}
              title="Dar de baja" onClick={() => abrir({ tipo: 'baja', empleados: [empleado] })}>×</button>}
          </div></td>
        </tr>)}</tbody>
      </table></div>
      {!pagina.total && <p>Aún no hay empleados.</p>}
      <div className="acciones paginacion">
        <button className="secondary" disabled={busy || pagina.page <= 1} onClick={() => void cambiarPagina(pagina.page - 1)}>Anterior</button>
        <span>Página {pagina.page} de {Math.max(1, Math.ceil(pagina.total / 20))}</span>
        <button className="secondary" disabled={busy || pagina.page * 20 >= pagina.total}
          onClick={() => void cambiarPagina(pagina.page + 1)}>Siguiente</button>
      </div>
    </>}
    <dialog ref={dialogo} aria-labelledby="titulo-empleado" onCancel={event => { event.preventDefault(); cerrar(); }}>
      {modal && <form onSubmit={guardar}>
        <h2 id="titulo-empleado">{modal.tipo === 'alta' ? 'Agregar empleado' : modal.tipo === 'editar' ? 'Editar permiso' : 'Confirmar baja'}</h2>
        {errorModal && <p role="alert" className="error">{errorModal}</p>}
        {modal.tipo === 'alta' && <>
          <label>Correo de la cuenta registrada<input name="email" type="email" required /></label>
          {pagina?.superAdmin && <label>Rol<select value={rol} onChange={event => setRol(event.target.value)}>
            <option value="encargado">Encargado</option><option value="administrador">Administrador</option>
          </select></label>}
        </>}
        {modal.tipo === 'editar' && <p>{modal.empleado.email} · {modal.empleado.role}</p>}
        {(modal.tipo === 'editar' || (modal.tipo === 'alta' && rol === 'administrador')) &&
          <label className="casilla"><input name="permiso" type="checkbox"
            defaultChecked={modal.tipo === 'editar' && modal.empleado.can_manage_workers} /> Puede gestionar encargados</label>}
        {modal.tipo === 'baja' && <>
          <p>Se revocará el acceso al negocio y a sus viajes asignados.</p>
          <ul>{modal.empleados.map(empleado => <li key={empleado.user_id}>{empleado.email}</li>)}</ul>
        </>}
        <label>Motivo<input name="reason" minLength={3} maxLength={300} required /></label>
        <div className="acciones"><Volver etiqueta="Cerrar modal" disabled={busy} onClick={cerrar} />
          <button disabled={busy}>{modal.tipo === 'baja' ? 'Confirmar baja' : 'Guardar'}</button></div>
      </form>}
    </dialog>
  </section>;
}
