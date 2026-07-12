export type PrepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

/**
 * operational / full: API'ye açık 0 veya 1.
 * branch_default: parametre yok; backend ``PrepBranchSettings`` şube varsayılanı.
 */
export type PrepTaskListMode = "operational" | "full" | "branch_default";

interface PrepTaskAssignment {
  id: string;
  user: string | null;
  user_name: string | null;
  display_name: string;
}

export interface PrepTask {
  id: string;
  branch: string;
  station: string | null;
  station_name: string | null;
  title: string;
  description: string | null;
  target_quantity: number;
  completed_quantity: number;
  unit: string | null;
  status: PrepStatus;
  priority: number;
  deadline: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
  is_recurring: boolean;
  /** Şablondan üretildiyse şablon kimliği (salt okunur) */
  source_template?: string | null;
  /** Çoklu atama kayıtları (backend'den salt okunur) */
  assignments?: PrepTaskAssignment[];
  /** Oluşturma/güncelleme için: atanacak sistem kullanıcı ID'leri (write-only) */
  assigned_user_ids?: string[];
  /** Oluşturma/güncelleme için: sisteme kayıtlı olmayan kişi isimleri (write-only) */
  assignee_names?: string[];
  created_at: string;
  updated_at: string;
}

export interface PrepTemplate {
  id: string;
  branch: string;
  station: string | null;
  station_name: string | null;
  title: string;
  description: string | null;
  target_quantity: number;
  unit: string | null;
  every_monday: boolean;
  every_tuesday: boolean;
  every_wednesday: boolean;
  every_thursday: boolean;
  every_friday: boolean;
  every_saturday: boolean;
  every_sunday: boolean;
  activation_time: string;
  is_enabled: boolean;
  branch_name?: string;
  /** null → herkese atanmış; dolu → belirli kullanıcıya */
  assigned_to: string | null;
  assigned_to_name?: string | null;
  /** Sisteme kayıtlı olmayan kişiler için manuel isim girişi */
  display_name?: string;
}

export interface PrepSmartRule {
  id: string;
  branch: string;
  title: string;
  base_product: string;
  base_product_name: string;
  target_item: string;
  ratio: number;
  unit: string | null;
  is_active: boolean;
}

export interface SmartSuggestion {
  id: string;
  title: string;
  base_product_name: string;
  target_item: string;
  suggested_quantity: number;
  unit: string | null;
  ratio: number;
  avg_sales: number;
}

/** Şube başına hazırlık modülü ayarı (API: ``/prep/branch-settings/by-branch/``). */
export interface PrepBranchSettings {
  id?: string;
  branch: string;
  management_hide_old_completed: boolean;
  created_at?: string;
  updated_at?: string;
}
