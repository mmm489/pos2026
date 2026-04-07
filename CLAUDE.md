# CLAUDE.md — Hi Cream POS + KDS

## Proyecto
POS táctil + KDS (Kitchen Display System) para Hi Cream, heladería en Salou.
Empresa: APOLO HOLDINGS 2020, S.L.U.

## Stack
- Frontend: Next.js 14 (App Router) + React + Tailwind
- Backend: Next.js API Routes + WebSocket (via Pusher o socket.io)
- Base de datos: Neon (PostgreSQL) — misma instancia que el dashboard Apolo
- Deploy: Vercel
- Bridge local: Node.js standalone en Windows (localhost:3001)

## Arquitectura
Tres capas:
1. **Nube (Vercel/Neon)**: POS frontend, KDS frontend, API, dashboard Apolo
2. **Bridge local (PC Windows mostrador)**: proceso Node.js que expone HTTP en localhost:3001 con 3 endpoints:
   - POST /cashlogy/charge → abre socket TCP al CashlogyConnector (puerto configurable, por defecto 3999)
   - POST /ingenico/charge → envía comando ZVT al datáfono Ingenico por TCP/IP
   - POST /printer/ticket → envía datos ESC/POS a impresora térmica 80mm
3. **Hardware**: Cashlogy (efectivo, TCP/IP), Ingenico (tarjeta, ZVT TCP/IP), impresora térmica (ESC/POS USB)

## Base de datos — tablas POS (schema: pos)
- pos.products (id, name, category_id, price, image_url, active, sort_order)
- pos.orders (id, order_number, status, total, payment_method, employee_id, created_at, completed_at)
- pos.order_items (id, order_id, product_id, qty, unit_price, notes)
- pos.categories (id, name, sort_order, color)
- pos.employees (id, name, pin, role, active)
- pos.kds_events (id, order_id, event_type, timestamp)

## Flujo de pedido
1. Empleado selecciona productos en POS → carrito
2. Pulsa Cobrar → elige Efectivo o Tarjeta
3. Efectivo → POS llama al bridge /cashlogy/charge con {amount} → bridge envía #C#amount# a CashlogyConnector → espera respuesta → devuelve OK/cambio
4. Tarjeta → POS llama al bridge /ingenico/charge con {amount} → bridge envía comando ZVT Authorization (06 01) → espera respuesta → devuelve OK/KO
5. Pago OK → API guarda order en Neon → emite evento WebSocket "new_order"
6. Bridge imprime ticket (POST /printer/ticket con datos del pedido + QR facturación)
7. KDS recibe evento → muestra pedido con timer
8. Preparador marca "listo" → API actualiza status → KDS elimina pedido

## KDS
- Muestra pedidos en cola como cards
- Timer por pedido: verde <2min, amarillo 2-4min, rojo >4min
- Sonido/alerta cuando entra pedido nuevo
- Click en card para marcar como "en preparación" o "listo"

## Convenciones
- Idioma del código: inglés
- Idioma de la UI: español
- Componentes: functional components con hooks
- Estilos: Tailwind, sin CSS modules
- API: REST para CRUD, WebSocket solo para eventos en tiempo real
- No usar ORMs pesados: usar @neondatabase/serverless directamente con SQL
- Variables de entorno: NEON_DATABASE_URL, PUSHER_*, BRIDGE_URL (default http://localhost:3001)
