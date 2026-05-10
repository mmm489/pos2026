# Hi Cream POS - Verifone Service (PowerShell replacement for VerifoneService.exe)
#
# Why PowerShell: the AxTpvpcPinPadWS COM object (Comercia v2.5.0.5) refuses to
# configure the COM port when called from C# (Interop/dynamic/late binding). The
# same object DOES work from PowerShell, so we host the HTTP service from here.
#
# Critical "warm-up" pattern: a single fresh pinpad with EsNavegador=0 returns 1
# from EstConfiguracionPuerto. But if we FIRST create a throwaway pinpad with
# EsNavegador=1 and let EstConfiguracionPuerto fail, then create the real one
# with EsNavegador=0, the second succeeds. We believe the failed first attempt
# initialises some shared TpvpcWinService session that the real one then uses.
#
# Run via Start-VerifoneService.bat (forces 32-bit PowerShell) - the COM class
# is only registered under WOW6432Node.

$ErrorActionPreference = 'Continue'
trap { Write-Log ("UNHANDLED: " + $_.Exception.Message); continue }

# --- Architecture guard ---------------------------------------------------
if ([IntPtr]::Size -ne 4) {
    Write-Output "[Verifone] FATAL: must run in 32-bit PowerShell (the DLL is registered under WOW6432Node)."
    Write-Output "[Verifone] Use C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
    exit 2
}

# --- Config (read from ../.env if env var not set) -----------------------
$EnvFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
            $name = $Matches[1].Trim()
            $value = $Matches[2].Trim()
            if (-not [Environment]::GetEnvironmentVariable($name)) {
                [Environment]::SetEnvironmentVariable($name, $value)
                Set-Item -Path "Env:$name" -Value $value -ErrorAction SilentlyContinue
            }
        }
    }
}

$Comercio   = if ($env:REDSYS_COMERCIO)    { $env:REDSYS_COMERCIO }    else { '352738546' }
$Terminal   = if ($env:REDSYS_TERMINAL)    { $env:REDSYS_TERMINAL }    else { '1' }
$ClaveFirma = if ($env:REDSYS_CLAVE_FIRMA) { $env:REDSYS_CLAVE_FIRMA } else { '' }
$UrlWsdl    = if ($env:REDSYS_URL_WSDL)    { $env:REDSYS_URL_WSDL }    else { 'https://sis.redsys.es/sis/services/SerClsWSEntradaV2?wsdl' }
$PortConfig = if ($env:REDSYS_PORT_CONFIG) { $env:REDSYS_PORT_CONFIG } else { 'COM9' }
$HttpPort   = if ($env:VERIFONE_PORT)      { [int]$env:VERIFONE_PORT } else { 3007 }

if (-not $ClaveFirma) {
    Write-Output "[Verifone] FATAL: REDSYS_CLAVE_FIRMA env var is required."
    exit 3
}

# --- Logging --------------------------------------------------------------
$LogDir  = Join-Path $PSScriptRoot 'logs'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$LogFile = Join-Path $PSScriptRoot 'verifone-service.log'

function Write-Log($msg) {
    $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff') + '] ' + $msg
    # Write-Host so the line doesn't pollute the function's pipeline output
    # (which was making Initialize-Pinpad return logs concatenated with $pinpad).
    Write-Host $line
    try { Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue } catch {}
}

Write-Log "Starting Verifone service (PowerShell)"
Write-Log ("  Comercio:   " + $Comercio)
Write-Log ("  Terminal:   " + $Terminal)
Write-Log ("  PortConfig: " + $PortConfig)
Write-Log ("  HttpPort:   " + $HttpPort)
Write-Log ("  Arch:       32-bit ok")

# --- Initialise pinpad with warm-up pattern ------------------------------
function Initialize-Pinpad {
    # Suppress ALL pipeline output. COM property assignments in PowerShell can
    # silently emit values that PowerShell collects as function return values.
    $script:WarmPinpad = $null
    try {
        Write-Log "Warm-up: creating throwaway pinpad with EsNavegador=1"
        $script:WarmPinpad = New-Object -ComObject AxTpvpcPinPadWS.TpvpcPinPad
        [void]($script:WarmPinpad.EsNavegador = 1)
        [void]($script:WarmPinpad.PathLog = $LogDir)
        [void]($script:WarmPinpad.TimeOut = 120)
        [void]($script:WarmPinpad.EstableceDatosComercio($Comercio, $Terminal, $ClaveFirma, $UrlWsdl))
        $rWarm = $script:WarmPinpad.EstConfiguracionPuerto($PortConfig)
        Write-Log ("Warm-up EstConfiguracionPuerto returned " + $rWarm + " (expected non-zero)")
    } catch {
        Write-Log ("Warm-up error (continuing): " + $_.Exception.Message)
    }

    Write-Log "Creating real pinpad with EsNavegador=0"
    $pp = New-Object -ComObject AxTpvpcPinPadWS.TpvpcPinPad
    [void]($pp.EsNavegador = 0)
    $r1 = $pp.EstableceDatosComercio($Comercio, $Terminal, $ClaveFirma, $UrlWsdl)
    Write-Log ("EstableceDatosComercio returned " + $r1)
    if ($r1 -ne 0) {
        Write-Log "FATAL: EstableceDatosComercio failed"
        return ,$null
    }
    $r2 = $pp.EstConfiguracionPuerto($PortConfig)
    Write-Log ("EstConfiguracionPuerto returned " + $r2)
    if ($r2 -ne 0) {
        Write-Log "FATAL: EstConfiguracionPuerto failed - cannot bind to pinpad"
        return ,$null
    }
    try {
        $valida = $pp.ValidaConfPinPad()
        Write-Log ("ValidaConfPinPad: " + $valida)
    } catch {
        Write-Log ("ValidaConfPinPad error: " + $_.Exception.Message)
    }
    return ,$pp
}

$Pinpad = Initialize-Pinpad
$IsConnected = $Pinpad -ne $null
if (-not $IsConnected) {
    Write-Log "Pinpad init failed. Service will still start so /health returns disconnected."
}

# --- HTTP listener --------------------------------------------------------
$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add(("http://localhost:" + $HttpPort + "/"))
$Listener.Prefixes.Add(("http://127.0.0.1:" + $HttpPort + "/"))
try {
    $Listener.Start()
    Write-Log ("HTTP listening at port " + $HttpPort)
} catch {
    Write-Log ("FATAL: cannot listen on port " + $HttpPort + ": " + $_.Exception.Message)
    exit 4
}

# --- Concurrency guard ----------------------------------------------------
$script:Busy = $false
$script:BusyLock = New-Object System.Object

function Try-Acquire {
    [System.Threading.Monitor]::Enter($script:BusyLock)
    try {
        if ($script:Busy) { return $false }
        $script:Busy = $true
        return $true
    } finally {
        [System.Threading.Monitor]::Exit($script:BusyLock)
    }
}

function Release {
    [System.Threading.Monitor]::Enter($script:BusyLock)
    try { $script:Busy = $false } finally { [System.Threading.Monitor]::Exit($script:BusyLock) }
}

# --- Response helpers -----------------------------------------------------
function Write-Json($ctx, $code, $obj) {
    $ctx.Response.StatusCode = $code
    $ctx.Response.ContentType = 'application/json; charset=utf-8'
    $bytes = [System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $obj -Compress -Depth 6))
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.OutputStream.Close()
}

function Read-Body($ctx) {
    $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
    try { return $reader.ReadToEnd() } finally { $reader.Close() }
}

# --- Pinpad operation -----------------------------------------------------
function Run-Operation($amount, $orderId, $originalRef, $tipoOperacion, $opName) {
    if (-not (Try-Acquire)) {
        return @{ http = 409; body = @{ success = $false; error = 'Ja hi ha una transaccio en curs' } }
    }
    try {
        if (-not $script:IsConnected -or $script:Pinpad -eq $null) {
            return @{ http = 503; body = @{ success = $false; error = 'Pinpad no inicialitzat' } }
        }

        $amountCents = [int][Math]::Round([decimal]$amount * 100)
        $importeRedsys = $amountCents.ToString('D12')

        $factura = if ($orderId) { $orderId } else { (Get-Date -Format 'yyyyMMddHHmmss').Substring(0, 12) }
        if ($factura.Length -gt 12) { $factura = $factura.Substring(0, 12) }

        Write-Log ($opName + ": " + $amount + " EUR (factura=" + $factura + ", orig=" + $originalRef + ")")

        # TrataPeticionOperacion(importe, moneda, factura, tipoOperacion, datosAdicionales)
        $callRes = $script:Pinpad.TrataPeticionOperacion($importeRedsys, '978', $factura, $tipoOperacion, $originalRef)
        Write-Log ("TrataPeticionOperacion returned: " + $callRes)

        # Poll FinTransaccion until done or timeout
        $deadline = (Get-Date).AddSeconds(120)
        while ((Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 500
            try {
                $fin = $script:Pinpad.FinTransaccion
                if ($fin) { break }
            } catch {}
        }

        $resultado    = ''
        $codigoResp   = ''
        $recibo       = ''
        $codAuth      = ''
        $reference    = $factura
        try { $resultado  = [string]$script:Pinpad.Resultado } catch {}
        try { $codigoResp = [string]$script:Pinpad.CodigoRespuesta } catch {}
        try { $recibo     = [string]$script:Pinpad.DatosRecibo } catch {}
        try { $codAuth    = [string]$script:Pinpad.CodigoAutorizacion } catch {}

        $approved = $codigoResp -ne '' -and ($codigoResp.StartsWith('000') -or $codigoResp -eq '0000' -or $codigoResp -eq '00')

        Write-Log ("Resultat: " + $resultado + ", Codi: " + $codigoResp + ", Aprovat: " + $approved)

        return @{ http = 200; body = @{
            success           = $approved
            operation         = $opName
            reference         = $reference
            authorizationCode = $codAuth
            receipt           = $recibo
            result            = $resultado
            responseCode      = $codigoResp
            error             = $(if (-not $approved) { "Codi resposta: $codigoResp" } else { $null })
        } }
    } catch {
        Write-Log ("Operation exception: " + $_.Exception.Message)
        return @{ http = 500; body = @{ success = $false; error = $_.Exception.Message } }
    } finally {
        Release
    }
}

# --- Main request loop ----------------------------------------------------
Write-Log "Ready - accepting requests"

while ($Listener.IsListening) {
    $ctx = $null
    try {
        $ctx = $Listener.GetContext()
    } catch {
        Write-Log ("GetContext error: " + $_.Exception.Message)
        Start-Sleep -Milliseconds 100
        continue
    }
    if ($ctx -eq $null) { continue }

    $path = '/'
    $method = 'GET'
    try {
        $req = $ctx.Request
        $path = $req.Url.AbsolutePath.ToLower()
        $method = $req.HttpMethod.ToUpper()
        Write-Log ($method + ' ' + $path)
    } catch {
        Write-Log ("Request parse error: " + $_.Exception.Message)
    }

    try {
        switch -Regex ($method + ' ' + $path) {
            '^GET /health$' {
                Write-Json $ctx 200 @{ status = 'ok'; timestamp = (Get-Date).ToUniversalTime().ToString('o') }
                break
            }
            '^GET /status$' {
                Write-Json $ctx 200 @{
                    connected = $script:IsConnected
                    busy = $script:Busy
                }
                break
            }
            '^POST /charge$' {
                $body = Read-Body $ctx
                $data = $body | ConvertFrom-Json
                $r = Run-Operation $data.amount $data.orderId '' '0' 'sale'
                Write-Json $ctx $r.http $r.body
                break
            }
            '^POST /refund$' {
                $body = Read-Body $ctx
                $data = $body | ConvertFrom-Json
                $r = Run-Operation $data.amount $data.orderId $data.originalReference '3' 'refund'
                Write-Json $ctx $r.http $r.body
                break
            }
            '^POST /cancel$' {
                $body = Read-Body $ctx
                $data = $body | ConvertFrom-Json
                $r = Run-Operation $data.amount $data.orderId $data.originalReference '9' 'cancel'
                Write-Json $ctx $r.http $r.body
                break
            }
            '^POST /query$' {
                $body = Read-Body $ctx
                $data = $body | ConvertFrom-Json
                $r = Run-Operation 0 $data.originalReference $data.originalReference '8' 'query'
                Write-Json $ctx $r.http $r.body
                break
            }
            '^POST /shutdown$' {
                Write-Json $ctx 200 @{ status = 'shutting down' }
                Write-Log "Shutdown requested via HTTP"
                $Listener.Stop()
                break
            }
            default {
                Write-Json $ctx 404 @{ error = 'Not found'; method = $method; path = $path }
            }
        }
    } catch {
        Write-Log ("Handler error: " + $_.Exception.Message)
        try { Write-Json $ctx 500 @{ error = $_.Exception.Message } } catch {}
    }
}

Write-Log "Listener stopped. Exiting."
