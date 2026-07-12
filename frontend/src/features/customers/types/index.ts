export type CustomerType = 'INDIVIDUAL' | 'CORPORATE';

export interface Customer {
  id: string;
  customer_type: CustomerType;
  name: string;
  address: string;
  phone: string;
  email: string;
  web_address: string;
  tax_office: string;
  tax_no: string;
  tc_no: string;
  mersis_no: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerSalesTotals {
  gross_total: number;
  discount_total: number;
  net_total: number;
}

export interface CustomerSale {
  id: string;
  order?: string;
  order_id?: string;
  paid_at?: string;
  created_at?: string;
  branch_name?: string;
  branch?: { name: string };
  payment_method_display?: string;
  total_amount: number | string;
}

interface CustomerOrderDetailItem {
  quantity: number;
  product_name: string;
  total_price: number | string;
}

export interface CustomerOrderDetail {
  id: string;
  order_number?: string;
  table_name?: string;
  payment_method_display?: string;
  payment_method?: string;
  net_total?: number | string;
  total_price?: number | string;
  items?: CustomerOrderDetailItem[];
}

export interface CustomerSalesDetailResponse {
  count: number;
  results: CustomerSale[];
  totals: CustomerSalesTotals;
  next?: string | null;
  previous?: string | null;
}
