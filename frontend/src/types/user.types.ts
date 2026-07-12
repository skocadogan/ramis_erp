export interface AuthUser {
  id: string;
  username: string;
  /** Profilde doluysa üst bardaki görünen ad için kullanılır */
  first_name?: string;
  last_name?: string;
  branch_id?: string;
  /** Birincil şube adı (/auth/me/ branch_name) */
  branch_name?: string;
  /** RBAC ile atanan şubeler; çok şubeli kullanıcı seçici için */
  available_branches?: { id: string; name: string }[];
  is_superuser?: boolean;
  permissions?: string[];
}

export interface User {
  id: string
  username: string
  email: string
  first_name: string
  last_name: string
  branch: string | null
  branch_name: string | null
  is_active: boolean
  is_superuser: boolean
  is_staff: boolean
  role_names: string[]
  date_joined: string
  last_login: string | null
}

export interface UserDetail extends User {
  roles: Role[]
  all_permissions: string[]
}

export interface UserCreatePayload {
  username: string
  email: string
  password: string
  first_name?: string
  last_name?: string
  branch_id?: string | null
  role_ids?: number[]
}

export interface UserUpdatePayload {
  email?: string
  first_name?: string
  last_name?: string
  branch_id?: string | null
  is_active?: boolean
  role_ids?: number[]
}

export interface UserProfile {
  id: string
  username: string
  email: string
  first_name: string
  last_name: string
  branch: string | null
  branch_name: string | null
  is_active: boolean
  is_superuser: boolean
  is_staff: boolean
  role_names: string[]
  date_joined: string
  last_login: string | null
}

export interface ChangePasswordPayload {
  current_password: string
  new_password: string
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Branch {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  tax_office: string | null
  tax_number: string | null
  registry_no: string | null
  mersis_no: string | null
  logo: string | null
  users_count: number
  users_list: string[]
  current_month_target?: number
  created_at?: string
  updated_at?: string
}

export interface BranchUser {
  id: string
  username: string
  email: string
  first_name: string
  last_name: string
  is_active: boolean
  role_names: string[]
}

export interface AssignUsersPayload {
  user_ids: string[]
}

export interface Role {
  id: number
  name: string
  description: string | null
  parent_role: number | null
  permissions: number[]
  permission_codes: string[]
  is_active: boolean
}

export interface PermissionCategory {
  id: number
  name: string
  code: string
  description: string | null
  permissions: Permission[]
}

interface Permission {
  id: number
  name: string
  code: string
  description: string | null
  category: number
  category_name: string
}
