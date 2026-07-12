export type CreditPolicy = 'BLOCK' | 'WARN_ALLOW' | 'OPEN_TAB';

export interface CreditAccount {
  id: string;
  user: string | null;
  user_username: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  branch: string | null;
  branch_name: string | null;
  is_global: boolean;
  credit_policy: CreditPolicy;
  credit_policy_display: string;
  total_credited: string;
  total_spent: string;
  balance: string;
  created_at: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  transaction_type: 'TOPUP' | 'CHARGE';
  transaction_type_display: string;
  amount: string;
  branch: string | null;
  branch_name: string | null;
  sale_id: string | null;
  order_number: string | null;
  notes: string;
  created_by_username: string | null;
  created_at: string;
}

export interface CreditAccountWritePayload {
  user?: string | null;
  first_name: string;
  last_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  branch?: string | null;
  is_global?: boolean;
  credit_policy?: CreditPolicy;
}
