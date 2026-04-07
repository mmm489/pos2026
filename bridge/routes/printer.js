const {
  printer: ThermalPrinter,
  types: PrinterTypes,
} = require("node-thermal-printer");

function createPrinter() {
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
    const printer = createPrinter();
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
    return res.json({ success: false, error: err.message });
  }
}

module.exports = { handlePrintTicket };
