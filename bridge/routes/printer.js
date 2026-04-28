const fs = require("fs");
const path = require("path");
const {
  printer: ThermalPrinter,
  types: PrinterTypes,
} = require("node-thermal-printer");

// Print error log — operators can diagnose missed tickets
const PRINT_LOG_DIR = path.join(__dirname, "..", "logs");
const PRINT_LOG_FILE = path.join(PRINT_LOG_DIR, "print-errors.log");

function logPrintError(printerType, payload, err) {
  try {
    if (!fs.existsSync(PRINT_LOG_DIR)) fs.mkdirSync(PRINT_LOG_DIR, { recursive: true });
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      printer: printerType,
      error: err.message || String(err),
      orderNumber: payload.orderNumber,
      invoiceNumber: payload.invoiceNumber,
      tableNumber: payload.tableNumber,
      total: payload.total,
      itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
    }) + "\n";
    fs.appendFileSync(PRINT_LOG_FILE, line);
  } catch (logErr) {
    console.error("[Printer] Failed to write error log:", logErr.message);
  }
}

// Receipt printer — Mostrador (EPSON TM-m30 via USB or TCP)
function createReceiptPrinter() {
  const iface = process.env.PRINTER_INTERFACE || "tcp";
  let options = {
    type: PrinterTypes.EPSON,
    characterSet: "CHARCODE_PC858",
    removeSpecialCharacters: false,
    lineCharacter: "-",
    width: 48,
  };

  if (iface === "tcp") {
    options.interface = `tcp://${process.env.PRINTER_HOST || "127.0.0.1"}:${process.env.PRINTER_PORT || "9100"}`;
  } else {
    options.interface = process.env.PRINTER_PATH || "//localhost/printer";
  }

  return new ThermalPrinter(options);
}

// Kitchen printer — Cocina (POS-80C via network)
function createKitchenPrinter() {
  const host = process.env.KITCHEN_PRINTER_HOST || "192.168.1.143";
  const port = process.env.KITCHEN_PRINTER_PORT || "9100";
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    characterSet: "CHARCODE_PC858",
    removeSpecialCharacters: false,
    lineCharacter: "-",
    width: 48,
    interface: `tcp://${host}:${port}`,
  });
}

async function probePrinter(factory) {
  try {
    const printer = factory();
    const connected = await printer.isPrinterConnected();
    return { connected: !!connected };
  } catch (err) {
    return { connected: false, error: err.message || String(err) };
  }
}

async function handlePrinterStatus(_req, res) {
  const [receipt, kitchen] = await Promise.all([
    probePrinter(createReceiptPrinter),
    probePrinter(createKitchenPrinter),
  ]);
  res.json({ receipt, kitchen });
}

function rightAlign(left, right, width = 48) {
  const spaces = width - left.length - right.length;
  return left + " ".repeat(Math.max(1, spaces)) + right;
}

async function handlePrintTicket(req, res) {
  const {
    orderNumber,
    invoiceNumber,
    items,
    total,
    totalBase,
    totalVat,
    vatRate,
    paymentMethod,
    date,
    qrData,
    business,
  } = req.body;

  if (!orderNumber || !items) {
    return res
      .status(400)
      .json({ success: false, error: "Faltan datos del ticket" });
  }

  const biz = business || {};
  const vatPct = vatRate || 10;

  // Calculate tax if not provided
  const calcTotal = total || items.reduce((s, i) => s + i.price * i.qty, 0);
  const calcBase = totalBase || Math.round((calcTotal / (1 + vatPct / 100)) * 100) / 100;
  const calcVat = totalVat || Math.round((calcTotal - calcBase) * 100) / 100;

  try {
    const printer = createReceiptPrinter();
    const isConnected = await printer.isPrinterConnected();

    // ========== HEADER ==========
    printer.alignCenter();
    printer.setTextSize(1, 1);
    printer.bold(true);
    printer.println(biz.trade_name || "HI CREAM");
    printer.bold(false);
    printer.setTextNormal();
    printer.println(biz.name || "APOLO HOLDINGS 2020, S.L.U.");
    printer.println(`NIF: ${biz.nif || "B00000000"}`);
    printer.println(biz.address || "");
    printer.println(`${biz.postal_code || ""} ${biz.city || "Salou"} (${biz.province || "Tarragona"})`);
    if (biz.phone) printer.println(`Tel: ${biz.phone}`);
    printer.drawLine();

    // ========== FACTURA SIMPLIFICADA ==========
    printer.alignCenter();
    printer.bold(true);
    printer.println("FACTURA SIMPLIFICADA");
    printer.bold(false);
    if (invoiceNumber) {
      printer.println(`N.: ${invoiceNumber}`);
    }
    printer.println(`Pedido: ${orderNumber}`);
    printer.println(date || new Date().toLocaleString("es-ES"));
    printer.drawLine();

    // ========== ITEMS ==========
    printer.alignLeft();
    // Header
    printer.println(rightAlign("PRODUCTO", "IMPORTE"));
    printer.drawLine();

    for (const item of items) {
      const subtotal = (item.price * item.qty).toFixed(2);
      if (item.qty === 1) {
        printer.println(rightAlign(item.name, `${subtotal} EUR`));
      } else {
        printer.println(item.name);
        printer.println(rightAlign(
          `  ${item.qty} x ${item.price.toFixed(2)}`,
          `${subtotal} EUR`
        ));
      }
    }

    printer.drawLine();

    // ========== DESGLOSE IVA ==========
    printer.alignLeft();
    printer.println(rightAlign("Base imponible:", `${calcBase.toFixed(2)} EUR`));
    printer.println(rightAlign(`IVA ${vatPct}%:`, `${calcVat.toFixed(2)} EUR`));
    printer.drawLine();

    // ========== TOTAL ==========
    printer.alignRight();
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(`TOTAL: ${calcTotal.toFixed(2)} EUR`);
    printer.bold(false);
    printer.setTextNormal();

    // ========== PAGO ==========
    printer.alignCenter();
    printer.newLine();
    printer.println(`Pago: ${paymentMethod}`);

    // ========== QR ==========
    if (qrData) {
      printer.newLine();
      printer.printQR(qrData, { cellSize: 6, correction: "M", model: 2 });
    }

    // ========== FOOTER ==========
    printer.newLine();
    printer.alignCenter();
    printer.println("Gracias por su visita");
    printer.println("IVA incluido en precios");
    printer.newLine();
    printer.cut();

    if (isConnected) {
      await printer.execute();
      console.log(`[Printer] Ticket impreso: ${invoiceNumber || orderNumber}`);
    } else {
      console.log(`[Printer] Ticket generado (sin impresora): ${invoiceNumber || orderNumber}`);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("[Printer] Error:", err.message);
    logPrintError("receipt", req.body, err);
    return res.json({ success: false, error: err.message });
  }
}

async function handlePrintKitchenTicket(req, res) {
  const { orderNumber, tableNumber, items, date } = req.body;

  if (!orderNumber || !items) {
    return res
      .status(400)
      .json({ success: false, error: "Faltan datos del ticket de cocina" });
  }

  try {
    const printer = createKitchenPrinter();
    const isConnected = await printer.isPrinterConnected();

    // ========== HEADER ==========
    printer.alignCenter();
    printer.setTextSize(2, 2);
    printer.bold(true);
    printer.println(`COMANDA ${orderNumber}`);
    printer.bold(false);
    printer.setTextNormal();

    if (tableNumber) {
      printer.newLine();
      printer.setTextSize(1, 1);
      printer.bold(true);
      printer.println(`TAULA ${tableNumber}`);
      printer.bold(false);
      printer.setTextNormal();
    }

    printer.println(date || new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }));
    printer.drawLine();

    // ========== ITEMS ==========
    printer.alignLeft();
    printer.setTextSize(1, 1);
    for (const item of items) {
      if (item.qty === 1) {
        printer.println(item.name);
      } else {
        printer.bold(true);
        printer.print(`${item.qty}x `);
        printer.bold(false);
        printer.println(item.name);
      }
      if (item.notes) {
        printer.println(`   ** ${item.notes}`);
      }
    }
    printer.setTextNormal();

    printer.drawLine();
    printer.newLine();
    printer.cut();

    if (isConnected) {
      await printer.execute();
      console.log(`[Kitchen] Ticket impreso: ${orderNumber}`);
    } else {
      console.log(`[Kitchen] Ticket generado (sin impresora): ${orderNumber}`);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("[Kitchen] Error:", err.message);
    logPrintError("kitchen", req.body, err);
    return res.json({ success: false, error: err.message });
  }
}

/**
 * Print the bank receipt returned by the datáfono (DatosRecibo from REDSYS).
 * The Verifone P400 ENGAGE has no built-in printer, so we render the receipt
 * text on the same Epson TM-m30. Two copies are typically printed: merchant
 * (with signature line) and customer.
 */
async function handlePrintCardReceipt(req, res) {
  const { receipt, copy, orderNumber } = req.body || {};
  if (!receipt || typeof receipt !== "string") {
    return res.status(400).json({ success: false, error: "Falta receipt" });
  }
  const copyLabel = copy === "merchant" ? "COPIA COMERC" : "COPIA CLIENT";

  try {
    const printer = createReceiptPrinter();
    const isConnected = await printer.isPrinterConnected();

    printer.alignCenter();
    printer.bold(true);
    printer.println(copyLabel);
    printer.bold(false);
    printer.drawLine();

    // Render the raw receipt text (datáfono already formatted it, including
    // a signature line ONLY when REDSYS deems it necessary — e.g. mag stripe
    // or fallback. PIN/contactless transactions don't need signature, so we
    // don't add one ourselves; trust the receipt text as-is.
    printer.alignLeft();
    for (const line of receipt.split(/\r?\n/)) {
      printer.println(line);
    }

    printer.newLine();
    printer.alignCenter();
    printer.println(`-- ${copyLabel} --`);
    printer.newLine();
    printer.cut();

    if (isConnected) {
      await printer.execute();
      console.log(`[Printer] Rebut bancari (${copyLabel}) imprès${orderNumber ? ` per ${orderNumber}` : ""}`);
    } else {
      console.log(`[Printer] Rebut bancari generat sense impressora (${copyLabel})`);
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("[Printer card-receipt] Error:", err.message);
    logPrintError("card-receipt", { orderNumber, total: 0, items: [] }, err);
    return res.json({ success: false, error: err.message });
  }
}

async function handlePrintZReport(req, res) {
  const c = req.body || {};
  if (!c.z_label || c.total_sales === undefined) {
    return res.status(400).json({ success: false, error: "Falta z_label o total_sales" });
  }

  const biz = c.business_snapshot || {};

  try {
    const printer = createReceiptPrinter();
    const isConnected = await printer.isPrinterConnected();

    // ========== HEADER ==========
    printer.alignCenter();
    printer.setTextSize(1, 1);
    printer.bold(true);
    printer.println(biz.trade_name || "HI CREAM");
    printer.bold(false);
    printer.setTextNormal();
    printer.println(biz.name || "APOLO HOLDINGS 2020, S.L.U.");
    printer.println(`NIF: ${biz.nif || ""}`);
    if (biz.address) printer.println(biz.address);
    if (biz.postal_code || biz.city) {
      printer.println(`${biz.postal_code || ""} ${biz.city || ""} ${biz.province ? `(${biz.province})` : ""}`.trim());
    }
    printer.drawLine();

    // ========== TANCAMENT Z ==========
    printer.alignCenter();
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println("TANCAMENT Z");
    printer.println(c.z_label);
    printer.bold(false);
    printer.setTextNormal();
    printer.println(new Date(c.closed_at).toLocaleString("es-ES"));
    printer.drawLine();

    // ========== INVOICE RANGE ==========
    if (c.first_invoice || c.last_invoice) {
      printer.alignLeft();
      printer.println("Factures emeses:");
      printer.println(`  Des de: ${c.first_invoice || "-"}`);
      printer.println(`  Fins a: ${c.last_invoice || "-"}`);
      printer.drawLine();
    }

    // ========== TOTALS PER MÈTODE ==========
    printer.alignLeft();
    printer.bold(true);
    printer.println("VENDES PER METODE");
    printer.bold(false);
    printer.println(rightAlign(`Efectiu (${c.cash_count || 0}):`, `${Number(c.total_cash || 0).toFixed(2)} EUR`));
    printer.println(rightAlign(`Targeta (${c.card_count || 0}):`, `${Number(c.total_card || 0).toFixed(2)} EUR`));
    printer.drawLine();

    // ========== IVA BREAKDOWN ==========
    if (c.vat_breakdown && Object.keys(c.vat_breakdown).length > 0) {
      printer.bold(true);
      printer.println("DESGLOSSAMENT IVA");
      printer.bold(false);
      for (const [rate, e] of Object.entries(c.vat_breakdown)) {
        printer.println(`IVA ${rate}%`);
        printer.println(rightAlign("  Base:", `${Number(e.base).toFixed(2)} EUR`));
        printer.println(rightAlign("  Quota:", `${Number(e.vat).toFixed(2)} EUR`));
        printer.println(rightAlign("  Subtotal:", `${Number(e.total).toFixed(2)} EUR`));
      }
      printer.drawLine();
    }

    // ========== TOTALS ==========
    printer.println(rightAlign("Base imposable:", `${Number(c.total_base || 0).toFixed(2)} EUR`));
    printer.println(rightAlign("Total IVA:", `${Number(c.total_vat || 0).toFixed(2)} EUR`));
    printer.alignRight();
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(`TOTAL: ${Number(c.total_sales).toFixed(2)} EUR`);
    printer.bold(false);
    printer.setTextNormal();
    printer.drawLine();

    // ========== ANUL·LACIONS ==========
    if (c.cancelled_count > 0) {
      printer.alignLeft();
      printer.println(rightAlign("Anul.lacions:", String(c.cancelled_count)));
      printer.println(rightAlign("Import retornat:", `${Number(c.total_refunded || 0).toFixed(2)} EUR`));
      printer.drawLine();
    }

    // ========== TICKETS ==========
    printer.alignLeft();
    printer.println(rightAlign("Tickets totals:", String(c.ticket_count)));
    if (c.notes) {
      printer.drawLine();
      printer.println("Notes:");
      printer.println(c.notes);
    }

    // ========== FOOTER ==========
    printer.newLine();
    printer.alignCenter();
    printer.bold(true);
    printer.println("--- TANCAMENT Z ---");
    printer.bold(false);
    printer.println("Document immutable a efectes fiscals");
    printer.newLine();
    printer.cut();

    if (isConnected) {
      await printer.execute();
      console.log(`[Printer] Z imprès: ${c.z_label}`);
    } else {
      console.log(`[Printer] Z generat (sense impressora): ${c.z_label}`);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("[Printer Z] Error:", err.message);
    logPrintError("z-report", { orderNumber: c.z_label, total: c.total_sales, items: [] }, err);
    return res.json({ success: false, error: err.message });
  }
}

module.exports = {
  handlePrintTicket,
  handlePrintKitchenTicket,
  handlePrintCardReceipt,
  handlePrintZReport,
  handlePrinterStatus,
};
