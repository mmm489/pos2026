# CLAUDE.md — Hi Cream POS + KDS

## ⚠️ REGLA CRÍTICA — NO TOCAR BDP NI CASHLOGY CONNECTOR
**PROHIBIDO modificar, mover, renombrar o eliminar cualquier archivo fuera de C:\HiCream\.**
El PC del mostrador tiene BDP y CashlogyConnector instalados y funcionando.
- NO tocar nada en C:\BDP\ ni en la carpeta de CashlogyConnector
- NO tocar ninguna DLL del sistema ni de CaixaBank/Comercia
- NO modificar configuraciones de red, puertos o servicios existentes
- NO desinstalar ni reinstalar drivers USB
- El bridge de Hi Cream es un programa SEPARADO que vive en C:\HiCream\bridge\
- Solo LEER archivos de BDP/Cashlogy para obtener configuración (puertos, DLLs), nunca escribir

## Proyecto
POS táctil + KDS (Kitchen Display System) para Hi Cream, heladería en Salou.
Empresa: APOLO HOLDINGS 2020, S.L.U.

## Stack
- Frontend: Next.js 14 (App Router) + React + Tailwind
- Backend: Next.js API Routes
- Base de datos: PostgreSQL 9.6 local (puerto 5432, database "hicream", schema "pos")
- DB driver: pg (NO @neondatabase/serverless — ese necesita HTTPS)
- Bridge local: Node.js standalone en Windows (localhost:3006)
- Sync: local PostgreSQL → Neon cada 5 min (para dashboard remoto)

## Hardware en el mostrador
- **Cashlogy** (modelo nuevo) — efectivo, conectada via CashlogyConnector por TCP (puerto 3999)
- **Verifone P400** — tarjeta, CaixaBank, conectado por USB, gestionado por DLL
- **Impresora térmica 80mm** — tickets ESC/POS
- **3 PCs Windows**: 1 mostrador (POS + bridge), 2 cocina (KDS vía navegador Chrome)

## Arquitectura
```
PC Mostrador (C:\HiCream\)
├── app\          → Next.js (POS + KDS + API) puerto 3005
├── bridge\       → Express (hardware) puerto 3006
└── PostgreSQL    → puerto 5432

PCs Cocina → Chrome → http://IP_MOSTRADOR:3005/kds
```

## Base de datos — schema: pos
- pos.categories (id, name, sort_order, color)
- pos.products (id, name, category_id, price, vat_rate, image_url, active, sort_order)
- pos.orders (id, order_number, invoice_number, status, total, total_base, total_vat, payment_method, employee_id, table_number, created_at, completed_at, synced)
- pos.order_items (id, order_id, product_id, qty, unit_price, vat_rate, notes)
- pos.employees (id, name, pin, role, active)
- pos.kds_events (id, order_id, event_type, timestamp)
- pos.cash_closings (id, employee_id, opened_at, closed_at, total_cash, total_card, total_sales, ticket_count, notes, synced)
- pos.business (id, name, trade_name, nif, address, city, postal_code, province, phone, invoice_series, next_invoice_number)

## Flujo de pedido
1. Empleado introduce PIN → accede al POS
2. Selecciona productos → carrito
3. Pulsa Cobrar → opcionalmente añade número de mesa
4. Elige Efectivo o Tarjeta
5. Efectivo → bridge → CashlogyConnector → Cashlogy
6. Tarjeta → bridge → DLL CaixaBank → Verifone P400
7. Pago OK → API guarda order en PostgreSQL
8. Bridge imprime ticket con desglose IVA 10%
9. KDS recibe pedido (BroadcastChannel local o Pusher)
10. Cocina marca items individuales como preparados
11. Todo listo → marca pedido como "Llest"

## Convenciones
- Idioma del código: inglés
- Idioma de la UI: catalán
- IVA: 10% (alimentación), precios PVP con IVA incluido
- Componentes: functional components con hooks
- Estilos: Tailwind, sin CSS modules
- API: REST con SQL directo via pg (tagged template literals)
- Variables de entorno en .env.local: NEON_DATABASE_URL, NEXT_PUBLIC_BRIDGE_URL

## URLs
- POS: http://localhost:3005/pos
- KDS: http://localhost:3005/kds (o http://IP:3005/kds desde cocina)
- Admin comandes: http://localhost:3005/admin/orders
- Admin productes: http://localhost:3005/admin/products
- Ticket preview: http://localhost:3005/ticket-preview
- Bridge health: http://localhost:3006/health
