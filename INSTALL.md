# Instalación Hi Cream POS — Paso a paso

## 1. Instalar PostgreSQL

1. Descarga desde: https://www.postgresql.org/download/windows/
2. Ejecuta el instalador
3. Durante la instalación:
   - **Password**: pon una contraseña y APÚNTALA (ej: `HiCream2026`)
   - **Puerto**: deja `5432` (el que viene por defecto)
   - **Locale**: Spanish, Spain o Default
   - Desmarca "Stack Builder" al final (no lo necesitas)
4. Dale a "Next" hasta que termine

## 2. Crear la base de datos

Abre **SQL Shell (psql)** desde el menú de inicio de Windows.

Te pedirá datos, dale Enter a todo excepto la contraseña:

```
Server [localhost]: ← Enter
Database [postgres]: ← Enter
Port [5432]: ← Enter
Username [postgres]: ← Enter
Password: ← escribe tu contraseña
```

Ya estás dentro. Ahora escribe:

```sql
CREATE DATABASE hicream;
\q
```

## 3. Crear las tablas

Abre PowerShell y ejecuta:

```
cd C:\HiCream\app
psql -U postgres -d hicream -f scripts/migrate.sql
```

Te pedirá la contraseña. Escríbela y dale Enter.

## 4. Cargar los productos

```
psql -U postgres -d hicream -f scripts/seed-products.sql
```

## 5. Configurar la app

Crea el archivo `C:\HiCream\app\.env.local` con este contenido
(cambia TU_PASSWORD por la contraseña de PostgreSQL):

```
NEON_DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/hicream
NEXT_PUBLIC_BRIDGE_URL=http://localhost:3001
```

## 6. Arrancar

Doble click en `C:\HiCream\start-local.bat`

---

## Verificar que PostgreSQL funciona

Si no estás seguro de que PostgreSQL está bien instalado:

1. Abre PowerShell
2. Escribe: `psql -U postgres -d hicream -c "SELECT count(*) FROM pos.products;"`
3. Debería mostrar el número de productos (ej: 200)

## Si la contraseña no funciona

1. Abre `C:\Program Files\PostgreSQL\17\data\pg_hba.conf` con Bloc de notas (como administrador)
2. Busca las líneas que dicen `scram-sha-256` o `md5`
3. Cámbialas por `trust`
4. Reinicia PostgreSQL: abre Servicios (services.msc) → postgresql → Reiniciar
5. Ahora puedes entrar sin contraseña y cambiarla:
   ```
   psql -U postgres
   ALTER USER postgres PASSWORD 'NuevaContraseña';
   \q
   ```
6. Vuelve a poner `scram-sha-256` en pg_hba.conf y reinicia el servicio
