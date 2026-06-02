export interface Category {
  id: number;
  name: string;
  sort_order: number;
  color: string;
}

export interface Product {
  id: number;
  name: string;
  category_id: number;
  price: number;
  vat_rate: number;
  image_url: string | null;
  active: boolean;
  sort_order: number;
  category_name?: string;
  category_color?: string;
  modifier_group_id?: number | null;
  modifier_included_count?: number | null;
  modifier_extra_price?: number | null;
}

export interface ModifierGroup {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  category_ids: number[];
  category_names: string[];
}

export interface Order {
  id: number;
  order_number: string;
  invoice_number?: string;
  status: "pending" | "preparing" | "ready" | "completed" | "cancelled";
  total: number;
  total_base?: number;
  total_vat?: number;
  payment_method: "cash" | "card" | "manual";
  employee_id: number | null;
  table_number?: string;
  created_at: string;
  completed_at: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  cancelled_by?: number | null;
  // Card payment audit trail — populated when payment_method = "card"
  card_reference?: string | null; // REDSYS factura, used as originalReference for refund/cancel
  card_authorization?: string | null; // Authorization code from datafono
  card_receipt_text?: string | null; // Raw DatosRecibo text — used to re-print the bank receipt
  refund_reference?: string | null; // REDSYS factura returned by refund/cancel op
  refund_at?: string | null;
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  qty: number;
  unit_price: number;
  vat_rate: number;
  notes: string | null;
  kds_ready?: boolean;
  kds_ready_at?: string | null;
  product_name?: string;
}

export interface Business {
  name: string;
  trade_name: string;
  nif: string;
  address: string;
  city: string;
  postal_code: string;
  province: string;
  phone?: string;
  invoice_series: string;
  next_invoice_number: number;
}

export interface Employee {
  id: number;
  name: string;
  pin: string;
  role: "admin" | "employee";
  active: boolean;
}

export interface KdsEvent {
  id: number;
  order_id: number;
  event_type: string;
  timestamp: string;
}

export interface VatBreakdownEntry {
  base: number;
  vat: number;
  total: number;
}

export type VatBreakdown = Record<string, VatBreakdownEntry>;

export interface BusinessSnapshot {
  name: string;
  trade_name: string;
  nif: string;
  address: string;
  city: string;
  postal_code: string;
  province: string;
  phone?: string;
  invoice_series: string;
}

export interface CashClosing {
  id: number;
  z_number: number | null;
  z_label: string | null;
  employee_id: number | null;
  employee_name?: string | null;
  opened_at: string;
  closed_at: string;
  total_cash: number;
  total_card: number;
  total_sales: number;
  total_base: number;
  total_vat: number;
  vat_breakdown: VatBreakdown;
  ticket_count: number;
  card_count: number;
  cash_count: number;
  cancelled_count: number;
  total_refunded: number;
  supplier_payments_total: number;
  supplier_payments_count: number;
  expected_cash_after_supplier_payments: number;
  supplier_payments_snapshot?: {
    id: number;
    supplier_name: string;
    amount: number;
    reason: string | null;
    created_at: string;
  }[];
  first_invoice: string | null;
  last_invoice: string | null;
  notes: string | null;
  business_snapshot: BusinessSnapshot | null;
  synced: boolean;
}

export interface CartItem {
  line_id: string;
  product_id: number;
  name: string;
  price: number;
  qty: number;
  notes: string | null;
}
