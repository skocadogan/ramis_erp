"use client"

import React from 'react'
import { cn } from '@/lib/utils'

interface ModalOverlayProps {
  onClose: () => void
  children: React.ReactNode
  className?: string
  backdropBlur?: boolean
  /** Tailwind z-index sınıfı. Varsayılan: 'z-50' */
  zIndex?: string
}

/**
 * Tekrar eden modal backdrop pattern'ini sarmalayan bileşen.
 * Overlay'e tıklandığında `onClose` çağrılır; içeriğe tıklama yayılmaz.
 *
 * @example
 *   <ModalOverlay onClose={handleClose}>
 *     <div className="rounded-xl p-6">...</div>
 *   </ModalOverlay>
 */
export function ModalOverlay({
  onClose,
  children,
  className,
  backdropBlur = false,
  zIndex = 'z-50',
}: ModalOverlayProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 flex items-center justify-center bg-black/50 p-4',
        zIndex,
        backdropBlur &&
          'supports-backdrop-filter:backdrop-blur-sm motion-reduce:backdrop-blur-none',
        className
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {children}
    </div>
  )
}


