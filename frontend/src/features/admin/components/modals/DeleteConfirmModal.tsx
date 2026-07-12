"use client"

import { AlertTriangle, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DeleteConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  isHardDelete?: boolean
  isLoading?: boolean
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Sil",
  cancelText = "İptal",
  isHardDelete = false,
  isLoading = false
}: DeleteConfirmModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent size="md" className="overflow-hidden rounded-2xl border-none p-0 shadow-2xl">
        <div className={cn(
          "h-2 w-full",
          isHardDelete ? "bg-red-600" : "bg-amber-500"
        )} />
        
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={cn(
              "p-3 rounded-full shrink-0",
              isHardDelete ? "bg-red-50 text-red-600 dark:bg-red-900/20" : "bg-amber-50 text-amber-600 dark:bg-amber-900/20"
            )}>
              {isHardDelete ? <Trash2 size={24} /> : <AlertTriangle size={24} />}
            </div>
            
            <div className="flex-1 min-w-0">
              <DialogHeader className="text-left space-y-1">
                <DialogTitle className="text-xl font-ui-bold text-foreground">
                  {title}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-sm leading-relaxed dark:text-muted-foreground">
                  {description}
                </DialogDescription>
              </DialogHeader>
              
              {isHardDelete && (
                <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg dark:bg-red-900/10 dark:border-red-900/20">
                  <p className="text-sub font-ui-bold text-red-700 uppercase tracking-wider flex items-center gap-1.5 dark:text-red-400">
                    <AlertTriangle size={12} /> DİKKAT: BU İŞLEM GERİ ALINAMAZ
                  </p>
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter className="mt-8 flex gap-3 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 h-11 rounded-xl font-ui-medium"
            >
              {cancelText}
            </Button>
            <Button
              type="button"
              onClick={(e) => {
                 e.preventDefault();
                 onConfirm();
              }}
              disabled={isLoading}
              className={cn(
                "flex-1 h-11 rounded-xl font-ui-bold shadow-lg shadow-opacity-20 transition-all active:scale-[0.98]",
                isHardDelete 
                  ? "bg-red-600 hover:bg-red-700 text-white shadow-red-500/20" 
                  : "bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/20 dark:bg-blue-600 dark:hover:bg-blue-700"
              )}
            >
              {isLoading ? "İşlem yapılıyor..." : confirmText}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
