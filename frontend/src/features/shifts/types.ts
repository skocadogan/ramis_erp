export type ShiftStatus = "OPEN" | "CLOSED";

export interface ShiftDto {
  id: string;
  branch: string;
  status: ShiftStatus;
  opened_at: string;
  closed_at: string | null;
  opening_cash: string;
  expected_cash: string;
  actual_cash: string | null;
  difference: string | null;
  expected_card: string;
  actual_card: string | null;
  difference_card: string | null;
  expected_other: string;
  actual_other: string | null;
  difference_other: string | null;
  notes: string;
  opened_by: string;
  opened_by_name: string | null;
  opened_at_terminal: string | null;
  opened_at_terminal_name: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  created_at: string;
}

export interface ShiftZReportDto {
  shift: Record<string, unknown>;
  totals: { gross_sales: number; sale_count: number; discounts: number };
  payment_breakdown: {
    CASH: number;
    CARD: number;
    OTHER: number;
    CREDIT: number;
  };
  expenses: { id: string; description: string; amount: string }[];
  expenses_total: number;
  cash_movements: {
    id: string;
    amount: string;
    movement_type: string;
    description: string;
  }[];
  cash_movements_net: number;
}

export interface ShiftCashReportDto {
  shift: {
    id: string;
    branch_id: string;
    branch_name: string;
    status: ShiftStatus;
    opened_at: string;
    closed_at: string | null;
    opening_cash: string;
    actual_cash: string | null;
    opened_by_name: string | null;
  };
  totals: {
    gross_sales: number;
    sale_count: number;
    total_discount: number;
    total_cancelled: number;
  };
  payment_breakdown: {
    CASH: number;
    CARD: number;
    OTHER: number;
  };
  terminals: {
    terminal_name: string;
    sales_count: number;
    total_amount: number;
    discount_amount: number;
    payments: {
      CASH: number;
      CARD: number;
      OTHER: number;
      CREDIT?: number;
    };
    sales_list: {
      id: string;
      order_number: string;
      total_amount: number;
      discount_amount: number;
      payment_method: string;
      paid_at: string;
      created_by: string;
    }[];
  }[];
}
