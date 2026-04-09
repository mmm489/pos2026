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

export interface CartItem {
  product_id: number;
  name: string;
  price: number;
  qty: number;
  notes: string | null;
}
