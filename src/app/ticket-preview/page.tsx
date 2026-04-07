"use client";

import { useState } from "react";

const SAMPLE_TICKET = {
  business: {
    name: "APOLO HOLDINGS 2020, S.L.U.",
    trade_name: "Hi Cream",
    nif: "B00000000",
    address: "Calle Ejemplo 1",
    city: "Salou",
    postal_code: "43840",
    province: "Tarragona",
    phone: "977 000 000",
  },
  invoiceNumber: "S-2026/000001",
  orderNumber: "#001",
  date: new Date().toLocaleString("es-ES"),
  items: [
    { name: "Tarrina Grande (3 bolas)", qty: 2, price: 5.50 },
    { name: "Batido Premium", qty: 1, price: 5.50 },
    { name: "Topping Extra", qty: 2, price: 1.00 },
  ],
  paymentMethod: "Efectivo",
  vatRate: 10,
};

function calcTotals(items: { price: number; qty: number }[], vatRate: number) {
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const base = Math.round((total / (1 + vatRate / 100)) * 100) / 100;
  const vat = Math.round((total - base) * 100) / 100;
  return { total, base, vat };
}

export default function TicketPreviewPage() {
  const [ticket] = useState(SAMPLE_TICKET);
  const { total, base, vat } = calcTotals(ticket.items, ticket.vatRate);

  return (
    <div className="min-h-screen bg-gray-200 flex items-center justify-center py-8">
      <div className="flex gap-8 items-start">
        {/* TICKET */}
        <div
          className="bg-white shadow-xl mx-auto"
          style={{
            width: "320px",
            fontFamily: "'Courier New', monospace",
            fontSize: "13px",
            padding: "20px 16px",
            lineHeight: "1.5",
          }}
        >
          {/* Header */}
          <div className="text-center">
            <p className="text-xl font-black">{ticket.business.trade_name}</p>
            <p className="text-xs">{ticket.business.name}</p>
            <p className="text-xs">NIF: {ticket.business.nif}</p>
            <p className="text-xs">{ticket.business.address}</p>
            <p className="text-xs">
              {ticket.business.postal_code} {ticket.business.city} ({ticket.business.province})
            </p>
            <p className="text-xs">Tel: {ticket.business.phone}</p>
          </div>

          <Separator />

          {/* Invoice info */}
          <div className="text-center">
            <p className="font-bold">FACTURA SIMPLIFICADA</p>
            <p>N.: {ticket.invoiceNumber}</p>
            <p>Pedido: {ticket.orderNumber}</p>
            <p>{ticket.date}</p>
          </div>

          <Separator />

          {/* Column header */}
          <div className="flex justify-between">
            <span>PRODUCTO</span>
            <span>IMPORTE</span>
          </div>

          <Separator />

          {/* Items */}
          {ticket.items.map((item, i) => (
            <div key={i}>
              {item.qty === 1 ? (
                <div className="flex justify-between">
                  <span>{item.name}</span>
                  <span>{(item.price * item.qty).toFixed(2)} EUR</span>
                </div>
              ) : (
                <>
                  <p>{item.name}</p>
                  <div className="flex justify-between">
                    <span>&nbsp;&nbsp;{item.qty} x {item.price.toFixed(2)}</span>
                    <span>{(item.price * item.qty).toFixed(2)} EUR</span>
                  </div>
                </>
              )}
            </div>
          ))}

          <Separator />

          {/* Tax breakdown */}
          <div className="flex justify-between">
            <span>Base imponible:</span>
            <span>{base.toFixed(2)} EUR</span>
          </div>
          <div className="flex justify-between">
            <span>IVA {ticket.vatRate}%:</span>
            <span>{vat.toFixed(2)} EUR</span>
          </div>

          <Separator />

          {/* Total */}
          <div className="flex justify-between font-bold text-lg">
            <span>TOTAL:</span>
            <span>{total.toFixed(2)} EUR</span>
          </div>

          {/* Payment */}
          <div className="text-center mt-3">
            <p>Pago: {ticket.paymentMethod}</p>
          </div>

          {/* QR placeholder */}
          <div className="flex justify-center my-4">
            <div className="w-24 h-24 border-2 border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400">
              QR Verifactu
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-xs">
            <p>Gracias por su visita</p>
            <p>IVA incluido en precios</p>
          </div>
        </div>

        {/* LEGEND */}
        <div className="bg-white rounded-xl shadow-lg p-6 w-80 text-sm">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Detalle del ticket</h2>

          <div className="space-y-3">
            <Section title="Datos fiscales obligatorios">
              <li>Razon social de la empresa</li>
              <li>NIF de la empresa</li>
              <li>Direccion fiscal</li>
              <li>Numero de factura simplificada</li>
              <li>Fecha y hora</li>
            </Section>

            <Section title="Desglose IVA">
              <li>Helados, batidos, granizados: <b>10% IVA</b> (tipo reducido - alimentacion)</li>
              <li>Precios en carta = PVP con IVA incluido</li>
              <li>Base imponible = Total / 1.10</li>
              <li>Cuota IVA = Total - Base</li>
            </Section>

            <Section title="Numeracion">
              <li>Serie + Año + Correlativo</li>
              <li>Ej: S-2026/000001</li>
              <li>No puede haber saltos</li>
            </Section>

            <Section title="QR (futuro Verifactu)">
              <li>Se añadira cuando sea obligatorio</li>
              <li>Contendra URL de verificacion AEAT</li>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Separator() {
  return <p className="text-center my-1">{"- ".repeat(16)}</p>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-gray-700">{title}</p>
      <ul className="list-disc list-inside text-gray-600 text-xs space-y-0.5 ml-1">
        {children}
      </ul>
    </div>
  );
}
