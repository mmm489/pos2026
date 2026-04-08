using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using AXTPVPCPINPADWSLib;

/// <summary>
/// HTTP wrapper for REDSYS AxTpvpcPinPadWS ActiveX.
/// Exposes card payment via REST on port 3007.
/// </summary>
class VerifoneService
{
    static TpvpcPinPadClass pinpad;
    static JavaScriptSerializer json = new JavaScriptSerializer();
    static bool transactionInProgress = false;
    static string currentStatus = "idle";

    static string comercio;
    static string terminal;
    static string claveFirma;
    static string urlWsdl;
    static string portConfig;

    static void Main(string[] args)
    {
        comercio = Environment.GetEnvironmentVariable("REDSYS_COMERCIO") ?? "";
        terminal = Environment.GetEnvironmentVariable("REDSYS_TERMINAL") ?? "001";
        claveFirma = Environment.GetEnvironmentVariable("REDSYS_CLAVE_FIRMA") ?? "";
        urlWsdl = Environment.GetEnvironmentVariable("REDSYS_URL_WSDL") ?? "";
        portConfig = Environment.GetEnvironmentVariable("REDSYS_PORT_CONFIG") ?? "COM9";

        if (string.IsNullOrEmpty(comercio) || string.IsNullOrEmpty(claveFirma))
        {
            Console.WriteLine("[Verifone] ERROR: Falta REDSYS_COMERCIO o REDSYS_CLAVE_FIRMA");
            Console.WriteLine("  REDSYS_COMERCIO     - Numero de comercio (FUC)");
            Console.WriteLine("  REDSYS_TERMINAL     - Numero de terminal (default: 001)");
            Console.WriteLine("  REDSYS_CLAVE_FIRMA  - Clau de firma");
            Console.WriteLine("  REDSYS_URL_WSDL     - URL del WSDL de REDSYS");
            Console.WriteLine("  REDSYS_PORT_CONFIG  - Config del port (default: COM9)");
            Environment.Exit(1);
        }

        Console.WriteLine("[Verifone] Inicialitzant PinPad ActiveX...");
        try
        {
            pinpad = new TpvpcPinPadClass();
            pinpad.PathLog = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
            pinpad.TimeOut = 120;

            int setupResult = pinpad.EstableceDatosComercio(comercio, terminal, claveFirma, urlWsdl);
            if (setupResult != 0)
            {
                Console.WriteLine("[Verifone] Error configurant dades de comerci: " + setupResult);
                Environment.Exit(1);
            }
            Console.WriteLine("[Verifone] Dades de comerci OK");

            int portResult = pinpad.EstConfiguracionPuerto(portConfig);
            if (portResult != 0)
            {
                Console.WriteLine("[Verifone] Error configurant port: " + portResult);
                Environment.Exit(1);
            }
            Console.WriteLine("[Verifone] Port configurat: " + portConfig);

            string validation = pinpad.ValidaConfPinPad();
            Console.WriteLine("[Verifone] Validacio: " + validation);
        }
        catch (Exception ex)
        {
            Console.WriteLine("[Verifone] Error inicialitzant: " + ex.Message);
            Environment.Exit(1);
        }

        int port = 3007;
        string portEnv = Environment.GetEnvironmentVariable("VERIFONE_PORT");
        if (!string.IsNullOrEmpty(portEnv)) int.TryParse(portEnv, out port);

        Directory.CreateDirectory(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs"));

        var listener = new HttpListener();
        listener.Prefixes.Add(string.Format("http://localhost:{0}/", port));
        listener.Prefixes.Add(string.Format("http://127.0.0.1:{0}/", port));
        listener.Start();
        Console.WriteLine("[Verifone] HTTP escoltant al port " + port);

        while (true)
        {
            var ctx = listener.GetContext();
            ThreadPool.QueueUserWorkItem(HandleRequest, ctx);
        }
    }

    static void HandleRequest(object state)
    {
        var ctx = (HttpListenerContext)state;
        var req = ctx.Request;
        var res = ctx.Response;
        string path = req.Url.AbsolutePath;
        string method = req.HttpMethod;

        res.Headers.Add("Access-Control-Allow-Origin", "*");
        res.Headers.Add("Access-Control-Allow-Headers", "Content-Type");
        res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

        if (method == "OPTIONS") { Respond(res, 200, "{}"); return; }

        Console.WriteLine(string.Format("[{0}] {1} {2}", DateTime.Now.ToString("HH:mm:ss"), method, path));

        try
        {
            if (path == "/health" && method == "GET")
            {
                string info = "";
                try { info = pinpad.InfoPinPad ?? ""; } catch { }
                Respond(res, 200, json.Serialize(new { status = "ok", timestamp = DateTime.Now.ToString("o"), pinpadInfo = info }));
            }
            else if (path == "/charge" && method == "POST")
            {
                HandleCharge(req, res);
            }
            else if (path == "/charge/status" && method == "GET")
            {
                Respond(res, 200, json.Serialize(new { active = transactionInProgress, status = currentStatus }));
            }
            else
            {
                Respond(res, 404, json.Serialize(new { error = "Not found" }));
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("[Verifone] Error: " + ex.Message);
            Respond(res, 500, json.Serialize(new { error = ex.Message }));
        }
    }

    static void HandleCharge(HttpListenerRequest req, HttpListenerResponse res)
    {
        if (transactionInProgress)
        {
            Respond(res, 409, json.Serialize(new { success = false, error = "Ja hi ha una transaccio en curs" }));
            return;
        }

        string body;
        using (var reader = new StreamReader(req.InputStream, Encoding.UTF8))
            body = reader.ReadToEnd();

        var data = json.Deserialize<System.Collections.Generic.Dictionary<string, object>>(body);
        if (data == null || !data.ContainsKey("amount"))
        {
            Respond(res, 400, json.Serialize(new { success = false, error = "Falta amount" }));
            return;
        }

        decimal amount = Convert.ToDecimal(data["amount"]);
        int amountCents = (int)Math.Round(amount * 100);
        string importeRedsys = amountCents.ToString("D12");
        string factura = DateTime.Now.ToString("yyyyMMddHHmmss");

        Console.WriteLine(string.Format("[Verifone] Cobrant: {0:F2} EUR (REDSYS: {1})", amount, importeRedsys));

        transactionInProgress = true;
        currentStatus = "waiting_card";

        try
        {
            // Start payment — TipoOperacion "0" = venta, Moneda "978" = EUR
            string callResult = pinpad.TrataPeticionOperacion(importeRedsys, "978", factura, "0", "");
            Console.WriteLine("[Verifone] TrataPeticionOperacion: " + callResult);

            // Poll FinTransaccion property until done or timeout
            DateTime deadline = DateTime.Now.AddSeconds(120);
            while (DateTime.Now < deadline)
            {
                Thread.Sleep(500);

                int fin = 0;
                try { fin = pinpad.FinTransaccion; } catch { }

                if (fin != 0)
                {
                    string resultado = "";
                    string codigoResp = "";
                    string recibo = "";
                    try { resultado = pinpad.Resultado ?? ""; } catch { }
                    try { codigoResp = pinpad.CodigoRespuesta ?? ""; } catch { }
                    try { recibo = pinpad.DatosRecibo ?? ""; } catch { }

                    bool approved = !string.IsNullOrEmpty(codigoResp) &&
                        (codigoResp.StartsWith("000") || codigoResp == "0000" || codigoResp == "00");

                    Console.WriteLine(string.Format("[Verifone] Resultat: {0}, Codi: {1}, Aprovat: {2}", resultado, codigoResp, approved));
                    currentStatus = approved ? "done" : "error";

                    Respond(res, 200, json.Serialize(new {
                        success = approved,
                        result = resultado,
                        responseCode = codigoResp,
                        receipt = recibo,
                        error = approved ? (string)null : (resultado != "" ? resultado : "Pagament denegat")
                    }));
                    return;
                }

                // Update status based on LecturaOK
                try
                {
                    if (pinpad.LecturaOK != 0)
                        currentStatus = "processing";
                }
                catch { }
            }

            // Timeout
            currentStatus = "error";
            Respond(res, 200, json.Serialize(new { success = false, error = "Timeout: el datafon no ha respost" }));
        }
        catch (Exception ex)
        {
            Console.WriteLine("[Verifone] Error: " + ex.Message);
            string lastErr = "";
            try { lastErr = pinpad.RecuperaUltimoError(); } catch { }
            currentStatus = "error";
            Respond(res, 200, json.Serialize(new {
                success = false,
                error = string.IsNullOrEmpty(lastErr) ? ex.Message : lastErr
            }));
        }
        finally
        {
            transactionInProgress = false;
            currentStatus = "idle";
        }
    }

    static void Respond(HttpListenerResponse res, int status, string body)
    {
        res.StatusCode = status;
        res.ContentType = "application/json";
        byte[] bytes = Encoding.UTF8.GetBytes(body);
        res.ContentLength64 = bytes.Length;
        res.OutputStream.Write(bytes, 0, bytes.Length);
        res.Close();
    }
}
