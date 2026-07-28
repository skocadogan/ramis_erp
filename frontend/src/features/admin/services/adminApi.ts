import {
  PaginatedResponse,
  Branch,
  Role,
  PermissionCategory,
  User,
  UserProfile,
  UserDetail,
  UserCreatePayload,
  UserUpdatePayload,
  ChangePasswordPayload,
  BranchUser,
  AssignUsersPayload,
} from "@/types/user.types"
import api, { skipInterceptorToast } from "@/lib/api"
import {
  printersApi,
  type ReceiptBlock,
} from "@/features/printing/services/printersApi"

export type {
  Printer,
  PrinterForm,
  ReceiptBlock,
  ReceiptBlockType,
  ReceiptTemplate,
} from "@/features/printing/services/printersApi"

// --- Reporting Types ---
export interface ReportTemplate {
  id: string
  name: string
  slug: string
  category: string
  category_display: string
  html_body: string
  css_styles: string
  is_active: boolean
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface ReportTemplateForm {
  name: string
  slug: string
  category: string
  html_body: string
  css_styles: string
  is_active: boolean
  is_default: boolean
}

// --- ESC/POS Receipt Types (Printer/ReceiptTemplate → printing/printersApi) ---
type ReceiptCategory = "POS_RECEIPT" | "KITCHEN_TICKET" | "WAITER_TICKET"

export interface ReceiptTemplateForm {
  name: string
  slug: string
  category: ReceiptCategory
  paper_width: number
  layout_json: ReceiptBlock[]
  is_default: boolean
  is_active: boolean
}

export interface KitchenStation {
  id: string
  branch: string
  branch_name: string
  name: string
  code: string
  color: string
  description: string
  is_active: boolean
  categories_count: number
  pending_orders_count: number
  warehouse?: string
  warehouse_name?: string
  created_at: string
  updated_at: string
}

export interface KitchenStationForm {
  branch: string
  name: string
  code: string
  color: string
  description: string
  is_active: boolean
  warehouse?: string
}

export type SurveyQuestionType = "RATING" | "YES_NO" | "OPTION" | "SHORT_TEXT"
export type SurveyQuestionRole =
  | "NONE"
  | "NPS"
  | "FOOD"
  | "SERVICE"
  | "SPEED"
  | "CLEANLINESS"
export type SurveyAttentionStatus = "OPEN" | "REVIEWED" | "RESOLVED"

export interface SurveyQuestionOptionForm {
  id?: string
  label: string
  sort_order: number
  is_active?: boolean
}

export interface SurveyQuestionForm {
  id?: string
  text: string
  answer_type: SurveyQuestionType
  question_role: SurveyQuestionRole
  sort_order: number
  is_required: boolean
  placeholder: string
  rating_min_value: number
  rating_max_value: number
  is_active?: boolean
  options: SurveyQuestionOptionForm[]
}

export interface SurveyForm {
  title: string
  description: string
  sort_order: number
  is_active: boolean
  is_customer_display_active: boolean
  is_smart_table_active: boolean
  branches: string[]
  questions: SurveyQuestionForm[]
}

export interface Survey extends SurveyForm {
  id: string
  branch_names: string[]
  question_count: number
  response_count: number
  created_at: string
  updated_at: string
}

interface SurveyAnswerRecord {
  id: string
  question: string
  question_text: string
  question_role: SurveyQuestionRole
  selected_option?: string | null
  selected_option_label?: string
  rating_value?: number | null
  boolean_value?: boolean | null
  text_value?: string
  answer_value?: string | number | boolean | null
}

export interface SurveyResponseRecord {
  id: string
  survey: string
  survey_title: string
  branch: string
  branch_name: string
  table?: string | null
  table_name?: string | null
  order?: string | null
  sale?: string | null
  customer?: string | null
  customer_name?: string | null
  staff_user?: string | null
  staff_name?: string | null
  source: string
  needs_attention: boolean
  attention_status: SurveyAttentionStatus
  attention_note: string
  nps_score?: number | null
  food_rating?: number | null
  service_rating?: number | null
  speed_rating?: number | null
  cleanliness_rating?: number | null
  answers_preview: string
  answers: SurveyAnswerRecord[]
  created_at: string
}

export const adminApi = {
  getUsers: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<User>>("/admin/users/", { params }).then(r => r.data),

  getUser: (id: string) =>
    api.get<UserDetail>(`/admin/users/${id}/`).then(r => r.data),

  createUser: (payload: UserCreatePayload) =>
    api.post<UserDetail>("/admin/users/", payload).then(r => r.data),

  updateUser: (id: string, payload: UserUpdatePayload) =>
    api.patch<UserDetail>(`/admin/users/${id}/`, payload).then(r => r.data),

  deleteUser: (id: string) =>
    api.delete(`/admin/users/${id}/`),

  setUserRoles: (id: string, roleIds: number[]) =>
    api.post<UserDetail>(`/admin/users/${id}/set_roles/`, { role_ids: roleIds }).then(r => r.data),

  resetPassword: (id: string, password: string) =>
    api.post(`/admin/users/${id}/reset_password/`, { password }),

  getBranches: (params?: Record<string, unknown>) =>
    api.get<Branch[] | PaginatedResponse<Branch>>("/branches/", { params }).then(r =>
      "results" in r.data ? r.data.results : r.data
    ),

  deleteBranch: (id: string, force = false) =>
    api.delete(`/branches/${id}/`, { params: force ? { force: 1 } : {}, ...skipInterceptorToast }),

  restoreBranch: (id: string) =>
    api.post(`/branches/${id}/restore/`, undefined, { ...skipInterceptorToast }),

  getBranchUsers: (branchId: string) =>
    api.get<BranchUser[]>(`/branches/${branchId}/users/`).then(r => r.data),

  assignUsersToBranch: (branchId: string, payload: AssignUsersPayload) =>
    api.post<Branch>(`/branches/${branchId}/assign_users/`, payload).then(r => r.data),

  removeUserFromBranch: (branchId: string, userId: string) =>
    api.delete(`/branches/${branchId}/users/${userId}/`),

  getRoles: () =>
    api.get<Role[] | PaginatedResponse<Role>>("/admin/roles/").then(r =>
      "results" in r.data ? r.data.results : r.data
    ),

  createRole: (data: Partial<Role>) =>
    api.post<Role>("/admin/roles/", data).then(r => r.data),

  updateRole: (id: number, data: Partial<Role>) =>
    api.patch<Role>(`/admin/roles/${id}/`, data).then(r => r.data),

  deleteRole: (id: number) =>
    api.delete(`/admin/roles/${id}/`),

  setRolePermissions: (id: number, permissionIds: number[]) =>
    api.post(`/admin/roles/${id}/set_permissions/`, { permission_ids: permissionIds }),

  getPermissionCategories: () =>
    api.get<PermissionCategory[] | PaginatedResponse<PermissionCategory>>("/admin/permission-categories/").then(r =>
      "results" in r.data ? r.data.results : r.data
    ),

  getSales: (params?: Record<string, unknown>) =>
    api.get("/sales/", { params }).then(r => r.data),

  getSalesSummary: () =>
    api.get("/sales/summary/").then(r => r.data),

  exportSalesPdf: (params: Record<string, unknown>) =>
    api.get("sales/export/pdf/", { params, responseType: 'blob' }).then(r => r.data),

  exportSalesExcel: (params: Record<string, unknown>) =>
    api.get("sales/export/excel/", { params, responseType: 'blob' }).then(r => r.data),

  getStations: (params?: { branch_id?: string; assigned_only?: boolean }) =>
    api.get<KitchenStation[] | { results?: KitchenStation[] }>("/stations/", { params }).then((r) => {
      const d = r.data
      return Array.isArray(d) ? d : (Array.isArray(d?.results) ? d.results : [])
    }),

  getStation: (id: string) =>
    api.get<KitchenStation>(`/stations/${id}/`).then((r) => r.data),

  createStation: (data: KitchenStationForm) =>
    api.post<KitchenStation>("/stations/", data).then(r => r.data),

  updateStation: (id: string, data: Partial<KitchenStationForm>) =>
    api.patch<KitchenStation>(`/stations/${id}/`, data).then(r => r.data),

  deleteStation: (id: string) =>
    api.delete(`/stations/${id}/`),

  getWarehouses: (branchId?: string) =>
    api
      .get<unknown[] | { results?: unknown[] }>("/warehouse/warehouses/", {
        params: branchId ? { branch_id: branchId, page_size: 200 } : { page_size: 200 },
      })
      .then((r) => {
        const d = r.data
        return Array.isArray(d) ? d : (Array.isArray(d?.results) ? d.results : [])
      }),

  getWaiterAssignments: (branchId: string, userId: string) =>
    api.get<{ zone_ids: string[]; table_ids: string[] }>(`/branches/${branchId}/waiter-assignments/${userId}/`).then(r => r.data),

  updateWaiterAssignments: (branchId: string, userId: string, payload: { zone_ids: string[]; table_ids: string[] }) =>
    api.put(`/branches/${branchId}/waiter-assignments/${userId}/`, payload, { ...skipInterceptorToast }).then(r => r.data),

  getCookAssignments: (branchId: string, userId: string) =>
    api.get<{ station_ids: string[] }>(`/branches/${branchId}/cook-assignments/${userId}/`).then(r => r.data),

  updateCookAssignments: (branchId: string, userId: string, payload: { station_ids: string[] }) =>
    api.put(`/branches/${branchId}/cook-assignments/${userId}/`, payload, { ...skipInterceptorToast }).then(r => r.data),

  getManagerAssignments: (userId: string) =>
    api.get<{ branch_ids: string[] }>(`/branches/manager-assignments/${userId}/`).then(r => r.data),

  updateManagerAssignments: (userId: string, payload: { branch_ids: string[] }) =>
    api.put(`/branches/manager-assignments/${userId}/`, payload, { ...skipInterceptorToast }).then(r => r.data),

  // --- Printing API (delegates to printersApi) ---
  getPrinters: printersApi.getPrinters,
  createPrinter: printersApi.createPrinter,
  updatePrinter: printersApi.updatePrinter,
  deletePrinter: printersApi.deletePrinter,
  testPrint: printersApi.testPrint,
  syncPrinterStatus: printersApi.syncPrinterStatus,

  // --- Reporting API ---
  getReportTemplates: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<ReportTemplate>>("reporting/templates/", { params }).then(r => r.data),

  getReportTemplate: (slug: string) =>
    api.get<ReportTemplate>(`reporting/templates/${slug}/`).then(r => r.data),

  createReportTemplate: (data: ReportTemplateForm) =>
    api.post<ReportTemplate>("reporting/templates/", data).then(r => r.data),

  updateReportTemplate: (slug: string, data: Partial<ReportTemplateForm>) =>
    api.patch<ReportTemplate>(`reporting/templates/${slug}/`, data).then(r => r.data),

  deleteReportTemplate: (slug: string) =>
    api.delete(`reporting/templates/${slug}/`),

  previewReport: (slug: string, context: Record<string, unknown>) =>
    api.post<{ html: string }>(`reporting/templates/${slug}/preview/`, { context }).then(r => r.data),

  exportReportPdf: (slug: string, context: Record<string, unknown>) =>
    api.post(`reporting/templates/${slug}/export_pdf/`, { context }, { responseType: 'blob' }).then(r => r.data),
  printReportThermal: (slug: string, printerId: string, context: Record<string, unknown>) =>
    api.post<{ status: string; message: string }>(`reporting/templates/${slug}/print_thermal/`, { printer_id: printerId, context }).then(r => r.data),

  // --- Module Reports API ---
  getModuleReports: () =>
    api.get<unknown[] | PaginatedResponse<unknown>>("reporting/module-reports/").then((r) =>
      Array.isArray(r.data) ? r.data : (r.data.results ?? [])
    ),

  generateModuleReport: (slug: string, params: Record<string, unknown> = {}, format: string = 'pdf') =>
    api.post(`reporting/module-reports/${slug}/generate/`, { params, format }, { 
      responseType: (format === 'pdf' || format === 'excel') ? 'blob' : 'json' 
    }).then(r => r.data),

  // --- ESC/POS Receipt API ---
  getReceiptTemplates: printersApi.getReceiptTemplates,

  getReceiptTemplate: (slug: string) =>
    api.get<ReceiptTemplate>(`reporting/receipts/${slug}/`).then(r => r.data),

  createReceiptTemplate: (data: ReceiptTemplateForm) =>
    api.post<ReceiptTemplate>("reporting/receipts/", data).then(r => r.data),

  updateReceiptTemplate: (slug: string, data: Partial<ReceiptTemplateForm>) =>
    api.patch<ReceiptTemplate>(`reporting/receipts/${slug}/`, data).then(r => r.data),

  deleteReceiptTemplate: (slug: string) =>
    api.delete(`reporting/receipts/${slug}/`),

  previewReceiptText: (slug: string, context?: Record<string, unknown>) =>
    api.post<{ text: string; paper_width: number; lines: number }>(
      `reporting/receipts/${slug}/preview_text/`,
      context ? { context } : {}
    ).then(r => r.data),

  printReceiptThermal: printersApi.printReceiptThermal,

  setReceiptDefault: (slug: string) =>
    api.post<{ status: string; message: string }>(
      `reporting/receipts/${slug}/set_default/`
    ).then(r => r.data),

  duplicateReceiptTemplate: async (slug: string) => {
    const original = await adminApi.getReceiptTemplate(slug);
    const copy: ReceiptTemplateForm = {
      name: `${original.name} - Kopya`,
      slug: `${original.slug}-kopya-${Math.floor(Math.random() * 1000)}`,
      category: original.category,
      paper_width: original.paper_width,
      layout_json: original.layout_json,
      is_default: false,
      is_active: original.is_active,
    };
    return adminApi.createReceiptTemplate(copy);
  },

  exportAuditLogsCsv: (params?: { search?: string }) =>
    api
      .get<Blob>("/audit/logs/export/", {
        params,
        responseType: "blob",
        ...skipInterceptorToast,
      })
      .then((r) => r.data),

  getSurveys: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Survey>>("/guest-feedback/surveys/", { params }).then((r) => r.data),

  createSurvey: (data: SurveyForm) =>
    api.post<Survey>("/guest-feedback/surveys/", data).then((r) => r.data),

  updateSurvey: (id: string, data: SurveyForm) =>
    api.put<Survey>(`/guest-feedback/surveys/${id}/`, data).then((r) => r.data),

  deleteSurvey: (id: string) =>
    api.delete(`/guest-feedback/surveys/${id}/`),

  getSurveyResponses: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<SurveyResponseRecord>>("/guest-feedback/responses/", { params }).then((r) => r.data),

  updateSurveyResponseAttention: (
    id: string,
    data: { attention_status: SurveyAttentionStatus; attention_note?: string }
  ) =>
    api.patch<SurveyResponseRecord>(`/guest-feedback/responses/${id}/attention/`, data).then((r) => r.data),
}

export const authApi = {
  getProfile: () =>
    api.get<UserProfile>("/auth/me/").then(r => r.data),

  updateProfile: (data: Partial<UserProfile>) =>
    api.patch<UserProfile>("/auth/me/", data).then(r => r.data),

  changePassword: (payload: ChangePasswordPayload) =>
    api.post("/auth/change-password/", payload),
}
