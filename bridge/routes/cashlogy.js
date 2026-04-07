const net = require("net");

const CASHLOGY_HOST = process.env.CASHLOGY_HOST || "127.0.0.1";
const CASHLOGY_PORT = parseInt(process.env.CASHLOGY_PORT || "3999");
const TIMEOUT_MS = 120_000;

let initialized = false;

function sendCommand(command) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let data = "";

    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error("Timeout: CashlogyConnector no respondió"));
    }, TIMEOUT_MS);

    client.connect(CASHLOGY_PORT, CASHLOGY_HOST, () => {
      console.log(`[Cashlogy] Conectado a ${CASHLOGY_HOST}:${CASHLOGY_PORT}`);
      client.write(command);
    });

    client.on("data", (chunk) => {
      data += chunk.toString();
      // Check if we have a complete response
      if (data.endsWith("#")) {
        clearTimeout(timeout);
        client.end();
        resolve(data);
      }
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    client.on("close", () => {
      clearTimeout(timeout);
      if (data) resolve(data);
    });
  });
}

async function handleCashlogyCharge(req, res) {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Importe inválido" });
  }

  try {
    // Initialize if first connection
    if (!initialized) {
      console.log("[Cashlogy] Enviando comando de inicialización #I#");
      await sendCommand("#I#");
      initialized = true;
    }

    // Send charge command
    const amountStr = amount.toFixed(2);
    console.log(`[Cashlogy] Enviando cobro: #C#${amountStr}#`);
    const response = await sendCommand(`#C#${amountStr}#`);
    console.log(`[Cashlogy] Respuesta: ${response}`);

    // Parse response
    // Success: #0#change#  — change is the amount returned
    // Error:  #ER:message#
    if (response.startsWith("#0#")) {
      const parts = response.split("#").filter(Boolean);
      const change = parseFloat(parts[1]) || 0;
      return res.json({ success: true, change });
    } else if (response.includes("#ER:")) {
      const errorMsg = response.replace(/#/g, "").replace("ER:", "").trim();
      return res.json({ success: false, error: errorMsg || "Error Cashlogy" });
    } else {
      return res.json({
        success: false,
        error: `Respuesta inesperada: ${response}`,
      });
    }
  } catch (err) {
    console.error("[Cashlogy] Error:", err.message);
    return res.json({ success: false, error: err.message });
  }
}

module.exports = { handleCashlogyCharge };
