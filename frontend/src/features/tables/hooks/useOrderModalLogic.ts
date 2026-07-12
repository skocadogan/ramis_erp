"use client"

import { useEffect } from 'react'
import api from '@/lib/api'
import { usePosStore } from '@/store/usePosStore'
import { shouldSyncPosCustomerDisplay } from '@/features/pos/lib/posCustomerDisplaySync'
import { unwrapList } from '@/lib/api-utils'
import type { OrderDetail, PaymentMethod } from '../components/TableOrderModal/types'

import { isActiveOrderStatus } from '@/features/orders/constants/activeOrderStatuses'

interface UseOrderModalLogicProps {
  tableId?: string
  /** Tek paket siparişi (sanal masa): doğrudan sipariş kaydından yenile */
  orderId?: string
  paymentMethod: PaymentMethod
  isPaying: boolean
  setOrders: (orders: OrderDetail[]) => void
  onPaymentComplete?: () => void
  onClose: () => void
}

/**
 * TableOrderModal ve TakeawayOrderModal arasında paylaşılan ortak mantık.
 *
 * Kapsadığı sorumluluklar:
 * - `refreshOrders`: aktif siparişleri API'den yeniler, store'u günceller
 * - Ödeme yöntemi değişikliklerini müşteri ekranıyla senkronize eder
 * - Ödeme işlemi durumunu müşteri ekranıyla senkronize eder
 * - `setActiveDisplayOrder` ve `setDisplayMetadata` store selektörlerini açığa çıkarır
 */
export function useOrderModalLogic({
  tableId,
  orderId,
  paymentMethod,
  isPaying,
  setOrders,
  onPaymentComplete,
  onClose,
}: UseOrderModalLogicProps) {
  const setActiveDisplayOrder = usePosStore(s => s.setActiveDisplayOrder)
  const setDisplayMetadata = usePosStore(s => s.setDisplayMetadata)

  const refreshOrders = async () => {
    try {
      if (orderId) {
        const res = await api.get<OrderDetail>(`/orders/main/${orderId}/`)
        const o = res.data
        if (isActiveOrderStatus(o.status)) {
          setOrders([o])
          if (shouldSyncPosCustomerDisplay()) {
            setActiveDisplayOrder([o])
          }
        } else {
          setOrders([])
          if (shouldSyncPosCustomerDisplay()) {
            setActiveDisplayOrder([])
          }
          onPaymentComplete?.()
          onClose()
        }
        return
      }

      if (!tableId) return
      const res = await api.get<{ results?: OrderDetail[] }>('/orders/main/', {
        params: { table_id: tableId, ordering: 'created_at' },
      })
      const all = unwrapList<OrderDetail>(res)
      const active = all.filter(o => isActiveOrderStatus(o.status))
      setOrders(active)
      if (shouldSyncPosCustomerDisplay()) {
        setActiveDisplayOrder(active)
      }
      if (active.length === 0) {
        onPaymentComplete?.()
        onClose()
      }
    } catch (e) {
      console.error('refreshOrders error:', e)
    }
  }

  useEffect(() => {
    if (!shouldSyncPosCustomerDisplay()) return
    setDisplayMetadata({ paymentMethod })
  }, [paymentMethod, setDisplayMetadata])

  useEffect(() => {
    if (!shouldSyncPosCustomerDisplay()) return
    setDisplayMetadata({ isProcessing: isPaying })
  }, [isPaying, setDisplayMetadata])

  return { refreshOrders, setActiveDisplayOrder, setDisplayMetadata }
}
