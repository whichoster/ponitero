# ponitero

- Usa el nombre oficial `ponitero` y redacta la interfaz, los mensajes y la documentación en español latinoamericano.
- Antes de modificar reglas operativas, aplica la guía [ponitero-operacion](.agents/skills/ponitero-operacion/SKILL.md) y consulta las secciones pertinentes de la [definición funcional](docs/analisis-funcional.md).
- Mantén las reglas, los permisos por negocio y los cálculos en NestJS y PostgreSQL. Next.js consume la API y presenta los resultados. Para cambios de Next.js, sigue también [web/AGENTS.md](web/AGENTS.md).
- Usa Node.js 22 o posterior y npm desde la raíz. Ejecuta `npm run build` para comprobar cambios de código. Prueba permisos y reglas modificadas con Supabase local y las cuentas de demostración.
- Registra cambios de esquema con migraciones nuevas y conserva el historial de las operaciones. Actualiza el [estado de implementación](docs/estado-implementacion.md) cuando cambie una capacidad o se verifique un flujo pendiente.
