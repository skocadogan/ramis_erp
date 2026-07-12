/** Ödeme alınmamış / kapatılmamış sipariş durumları (backend OPEN_ORDER_STATUSES ile uyumlu). */
export const ACTIVE_ORDER_STATUSES = [
  'PENDING',
  'PREPARING',
  'READY',
  'DELIVERED',
] as const

export type ActiveOrderStatus = (typeof ACTIVE_ORDER_STATUSES)[number]

export function isActiveOrderStatus(status: string): status is ActiveOrderStatus {
  return (ACTIVE_ORDER_STATUSES as readonly string[]).includes(status)
}

export const ACTIVE_ORDER_STATUS_QUERY = ACTIVE_ORDER_STATUSES.join(',')
