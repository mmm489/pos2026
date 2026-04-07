const net = require("net");

const INGENICO_HOST = process.env.INGENICO_HOST || "127.0.0.1";
const INGENICO_PORT = parseInt(process.env.INGENICO_PORT || "5577");
const TIMEOUT_MS = 120_000;

let registered = false;

// TODO: The exact ZVT byte sequences depend on the specific Ingenico model.
// These are placeholder implementations following the ZVT protocol structure.
// Adjust bytes after testing with the actual terminal.

function buildZVTRegistration() {
  // ZVT Registration (06 00) — placeholder
  // Byte structure: [command class] [command] [length] [data...]
  return Buffer.from([0x06, 0x00, 0x00]);
}

function buildZVTAuthorization(amountCents) {
  // ZVT Authorization (06 01)
  // Amount is BCD-encoded in 6 bytes
  // TODO: Implement proper BCD encoding for the amount
  const amountStr = String(amountCents).padStart(12, "0");
  const amountBuf = Buffer.alloc(6);
  for (let i = 0; i < 6; i++) {
    amountBuf[i] = parseInt(amountStr.substring(i * 2, i * 2 + 2), 16);
  }

  // [06 01] [length] [04 (amount tag)] [amount 6 bytes]
  const data = Buffer.concat([Buffer.from([0x04]), amountBuf]);
  return Buffer.concat([Buffer.from([0x06, 0x01, data.length]), data]);
}

function sendZVTCommand(command) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const chunks = [];

    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error("Timeout: datáfono Ingenico no respondió"));
    }, TIMEOUT_MS);

    client.connect(INGENICO_PORT, INGENICO_HOST, () => {
      console.log(`[Ingenico] Conectado a ${INGENICO_HOST}:${INGENICO_PORT}`);
      client.write(command);
    });

    client.on("data", (chunk) => {
      chunks.push(chunk);
      const response = Buffer.concat(chunks);

      // TODO: Implement proper ZVT response parsing
      // Look for Completion (06 0F) or Abort (06 1E)
      if (response.length >= 3) {
        const cmdClass = response[0];
        const cmdCode = response[1];

        if (cmdClass === 0x06 && (cmdCode === 0x0f || cmdCode === 0x1e)) {
          clearTimeout(timeout);
          client.end();
          resolve({ raw: response, cmdClass, cmdCode });
        }
      }
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    client.on("close", () => {
      clearTimeout(timeout);
      if (chunks.length > 0) {
        const response = Buffer.concat(chunks);
        resolve({ raw: response, cmdClass: response[0], cmdCode: response[1] });
      }
    });
  });
}

async function handleIngenicoCharge(req, res) {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Importe inválido" });
  }

  try {
    // Register if first connection
    if (!registered) {
      console.log("[Ingenico] Enviando Registration (06 00)");
      await sendZVTCommand(buildZVTRegistration());
      registered = true;
    }

    // Send authorization
    const amountCents = Math.round(amount * 100);
    console.log(`[Ingenico] Enviando Authorization (06 01) — ${amount}€`);
    const response = await sendZVTCommand(buildZVTAuthorization(amountCents));

    // TODO: Parse actual ZVT completion response for transaction details
    if (response.cmdCode === 0x0f) {
      // Completion — payment approved
      const transactionId = `TXN-${Date.now()}`;
      console.log(`[Ingenico] Pago aprobado: ${transactionId}`);
      return res.json({ success: true, transactionId });
    } else {
      // Abort or unknown
      console.log(`[Ingenico] Pago rechazado: cmd=${response.cmdCode}`);
      return res.json({ success: false, error: "Pago rechazado por el datáfono" });
    }
  } catch (err) {
    console.error("[Ingenico] Error:", err.message);
    return res.json({ success: false, error: err.message });
  }
}

module.exports = { handleIngenicoCharge };
