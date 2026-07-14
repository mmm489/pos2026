# Posventa segura de tarjeta

## Antes de desplegar

1. Confirmar que no hay un cobro de tarjeta en curso.
2. Guardar el commit actual y una copia de `.env.local` y `bridge/.env`.
3. Hacer backup de PostgreSQL local.
4. Aplicar `scripts/migrate-v30.sql` una sola vez.
5. Instalar dependencias, compilar y abrir el POS con el lanzador habitual.

La migracion es aditiva. No modifica importes ni facturas historicas.

## Prueba controlada

1. Entrar como administrador.
2. Cobrar una venta pequena con Comercia.
3. Abrir `Comandes` y usar `Comprobar pago`.
4. Reimprimir ticket y justificantes de cliente/comercio.
5. Devolver una parte de la venta indicando un motivo.
6. Comprobar la factura rectificativa `R-...` y sus justificantes.
7. Verificar que el dashboard y el siguiente cierre restan la devolucion.

## Reglas de seguridad

- Una venta con factura nunca se anula ni se sobrescribe: se rectifica.
- `/cancelTransaction` se usa solo mientras el pago sigue abierto.
- Una devolucion incierta queda en `pending_verification` y no se repite.
- `Comprobar pago` consulta el UUID original de Comercia y no cobra nada.
- Solo los empleados con permiso pueden consultar, reimprimir o devolver.

## Rollback

Si falla una funcion critica, cerrar POS y bridge, volver al commit anterior,
restaurar los archivos de entorno y recompilar. No borrar las tablas de v30:
son aditivas y conservarlas evita perder auditoria si ya hubo una operacion.
