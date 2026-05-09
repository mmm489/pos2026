# Desplegament al PC del mostrador (Hi Cream — Salou)

Guia de l'instal·lació inicial i les actualitzacions futures al PC del mostrador.

> ⚠️ **NO TOCAR `C:\BDP\` ni el directori del CashlogyConnector.** Aquesta guia
> només treballa dins `C:\HiCream\` i amb la base de dades `hicream` de
> PostgreSQL. La resta queda intacta.

---

## Requisits que han d'existir al PC

Aquestes coses ja hi són i no s'han d'instal·lar de nou. Si alguna falla, atura't i revisa abans de continuar.

| Requisit | Com es comprova |
|---|---|
| **Node.js** instal·lat | `node --version` (PowerShell) |
| **Git** instal·lat | `git --version` |
| **PostgreSQL** corrent | `Test-NetConnection localhost -Port 5432 -InformationLevel Quiet` ha de tornar `True` |
| **CashlogyConnector** corrent | `Test-NetConnection 127.0.0.1 -Port 3999 -InformationLevel Quiet` ha de tornar `True` |
| **Pinpad P400** endollat al **COM9** i en mode TPV-PC | Mira la pantalla del datàfon o `[System.IO.Ports.SerialPort]::GetPortNames()` |
| **Impressora** del mostrador encesa | Hauria d'imprimir tickets ja avui |

---

## Primera vegada — clonar el repo nou al costat de l'antic

Aquests passos només es fan UN cop, per migrar de la instal·lació antiga
(`C:\HiCream\app` + `C:\HiCream\bridge`) a la nova carpeta unificada
(`C:\HiCream\pos2026`). Si ja ho has fet, salta a "Actualitzacions rutinàries".

### 1. Backup del `.env` actual del bridge (CRÍTIC)

Conté les credencials REDSYS, Cashlogy i Postgres — sense backup no podem tornar enrere si alguna cosa peta.

```powershell
Copy-Item C:\HiCream\bridge\.env C:\HiCream\bridge.env.backup-$(Get-Date -Format "yyyyMMdd")
```

### 2. Aturar bridge i POS

Tanca les finestres CMD obertes: "Hi Cream Bridge", "Hi Cream POS", "Hi Cream Sync". O des de PowerShell:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

⚠️ **Això NO atura el CashlogyConnector** (és un altre executable, no Node).

### 3. Clonar el repo nou

```powershell
cd C:\HiCream
git clone https://github.com/mmm489/pos2026.git
```

### 4. Copiar les credencials al lloc nou

```powershell
Copy-Item C:\HiCream\bridge\.env C:\HiCream\pos2026\bridge\.env
```

Obre `C:\HiCream\pos2026\bridge\.env` amb el Bloc de notes i comprova que diu:

```
REDSYS_PORT_CONFIG=COM9
```

Si diu `COM3` o un altre, canvia-ho a `COM9` i guarda.

### 5. Crear `.env.local` del POS

```powershell
notepad C:\HiCream\pos2026\.env.local
```

Pega això (substitueix `TEVA_PASS_POSTGRES` per la contrasenya real de Postgres):

```
NEON_DATABASE_URL=postgresql://postgres:TEVA_PASS_POSTGRES@localhost:5432/hicream
NEXT_PUBLIC_BRIDGE_URL=http://localhost:3006
```

Guarda i tanca.

### 6. Instal·lar dependències

```powershell
cd C:\HiCream\pos2026
npm install
cd bridge
npm install
cd ..
```

### 7. Aplicar migracions de BD que potser falten

```powershell
$env:PGPASSWORD = "TEVA_PASS_POSTGRES"
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
# Si tens una versió diferent de Postgres, canvia el 17 (9.6, 13, 14, 15, 16...)

cd C:\HiCream\pos2026
& $psql -U postgres -d hicream -f scripts\migrate-v5.sql
& $psql -U postgres -d hicream -f scripts\migrate-v6.sql
# Si surten "already exists" o "ya existe", no és error — vol dir que ja estaven aplicades
```

### 8. Compilar el POS per a producció

```powershell
cd C:\HiCream\pos2026
npm run build
```

Triga 1-2 minuts. Ha d'acabar amb "Compiled successfully".

### 9. Substituir `start-local.bat`

El `.bat` antic apunta a `C:\HiCream\app` i `C:\HiCream\bridge`. Necessitem que apunti a `pos2026`.

```powershell
Copy-Item C:\HiCream\start-local.bat C:\HiCream\start-local.bat.old
```

Edita `C:\HiCream\start-local.bat` amb el Bloc de notes i canvia:
- `cd /d C:\HiCream\bridge` → `cd /d C:\HiCream\pos2026\bridge`
- `cd /d C:\HiCream\app` → `cd /d C:\HiCream\pos2026`
- `npm start` (al bloc del POS) → `npm start` (igual, però ara és pos2026)

Guarda.

### 10. Arrencar tot

Doble-clic a `C:\HiCream\start-local.bat`. Han d'aparèixer 3 finestres CMD:
- "Hi Cream Bridge" → ha de dir "Bridge running on port 3006"
- "Hi Cream Sync" → ha de fer ping cada 5 min a Neon
- "Hi Cream POS" → ha de dir "Ready in Xs"

### 11. Verificar al navegador

Obre Chrome a http://localhost:3000/pos. Comprova:

- ✅ La pantalla de PIN té sota el numpad **4 indicadors verds** (Datàfon, Cashlogy, Impressora, Cuina)
- ✅ Pots iniciar sessió amb el PIN d'un empleat
- ✅ Pots fer una **venda real petita** amb targeta i amb efectiu
- ✅ A http://localhost:3000/admin/orders → expandint una comanda → surt el botó "**Re-imprimir ticket**"

---

## Actualitzacions rutinàries (quan tornem a fer canvis)

A partir de la primera instal·lació, les actualitzacions es fan així:

```powershell
cd C:\HiCream\pos2026
.\scripts\deploy-update.ps1
```

Això fa: `git pull`, `npm install` si cal, `npm run build`, i et recorda de reiniciar.

Si prefereixes manualment:

```powershell
cd C:\HiCream\pos2026
git status                 # comprova que no hi ha canvis locals
git pull origin master
npm install
cd bridge ; npm install ; cd ..
npm run build
# Després: tanca finestres CMD i torna a executar start-local.bat
```

---

## Si alguna cosa peta — tornar enrere

### Restaurar el `.env` del bridge

```powershell
Copy-Item C:\HiCream\bridge.env.backup-AAAAMMDD C:\HiCream\pos2026\bridge\.env -Force
```

### Tornar a la versió anterior del codi

```powershell
cd C:\HiCream\pos2026
git log --oneline -10                           # mira el hash al qual vols tornar
git reset --hard <HASH>                         # ex: git reset --hard f0befd4
npm install
npm run build
```

### Tornar a la instal·lació antiga (`C:\HiCream\app` + `C:\HiCream\bridge`)

Restaura `C:\HiCream\start-local.bat.old`:

```powershell
Copy-Item C:\HiCream\start-local.bat.old C:\HiCream\start-local.bat -Force
```

I executa el `.bat`. Tornes a tenir el sistema antic en marxa.

---

## Errors comuns

| Símptoma | Causa probable | Solució |
|---|---|---|
| Indicador "Datàfon" vermell a la pantalla PIN | Bridge no arriba al pinpad | Comprova `REDSYS_PORT_CONFIG=COM9` a `bridge/.env`; el datàfon endollat; el COM9 lliure |
| Indicador "Cashlogy" vermell | CashlogyConnector aturat | Reinicia CashlogyConnector des del seu propi accés directe |
| Indicador "Impressora" vermell | Impressora apagada o paper acabat | Encén-la / canvia paper |
| `npm run build` falla amb errors de TypeScript | Versió de Node antiga | Assegura't que `node --version` és ≥ 18 |
| `git pull` diu "your local changes would be overwritten" | Algú ha tocat fitxers a mà | NO insisteixis amb `--force`. Fes `git stash`, `git pull`, després mira `git stash list` |
| Tickets no s'imprimeixen | Configuració d'impressora canviada | Comprova `bridge/.env` → `PRINTER_INTERFACE` i `PRINTER_PATH` no s'han alterat |

---

## Telèfons útils

- **Atención Técnica Comercia**: 902 100 504 / 91 388 30 00 (per problemes amb el datàfon)
- **Cashlogy soporte**: el que tinguis del manual del Cashlogy
- **Pots tornar a contactar Claude**: des d'aquest portàtil amb GitHub Copilot / Claude Code
