"use client";

import {
  createContext,
  useContext,
  type ComponentProps,
} from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  type DialogLayout,
  type DialogSize,
  dialogBodyLayoutClass,
  dialogContentLayoutClass,
  dialogContentShell,
  dialogDefaultSize,
  dialogFooterLayoutClass,
  dialogHeaderLayoutClass,
  dialogSizeClass,
} from "@/components/ui/dialog-styles"

const DialogLayoutContext = createContext<DialogLayout>("default")

function useDialogLayout() {
  return useContext(DialogLayoutContext)
}

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/50 duration-100 motion-reduce:duration-0 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  backdropClassName,
  layout = "default",
  size,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  /** Backdrop (overlay) sınıfları — örn. blur'u kapatmak için */
  backdropClassName?: string
  /** default: tek parça içerik (p-6). scroll: header + body + footer düzeni (p-0). */
  layout?: DialogLayout
  /** Genişlik — yalnızca sm:max-w-* token'ı; diğer tüm stiller merkezi. */
  size?: DialogSize
}) {
  const t = useTranslations("common.dialog")
  const resolvedSize = size ?? dialogDefaultSize

  return (
    <DialogLayoutContext.Provider value={layout}>
      <DialogPortal>
        <DialogOverlay className={backdropClassName} />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          data-layout={layout}
          data-size={resolvedSize}
          className={cn(
            dialogContentShell,
            dialogContentLayoutClass[layout],
            dialogSizeClass[resolvedSize],
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={
                <Button
                  variant="ghost"
                  className={cn(
                    "absolute right-2",
                    layout === "scroll" ? "top-4" : "top-2"
                  )}
                  size="icon-sm"
                />
              }
            >
              <XIcon />
              <span className="sr-only">{t("close")}</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogLayoutContext.Provider>
  )
}

function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  const layout = useDialogLayout()
  return (
    <div
      data-slot="dialog-header"
      className={cn(dialogHeaderLayoutClass[layout], className)}
      {...props}
    />
  )
}

/** scroll layout içinde kaydırılabilir gövde — yalnızca layout="scroll" ile kullanın. */
function DialogBody({ className, ...props }: ComponentProps<"div">) {
  const layout = useDialogLayout()
  const bodyClass = dialogBodyLayoutClass[layout]
  if (!bodyClass) {
    return <div data-slot="dialog-body" className={className} {...props} />
  }
  return (
    <div
      data-slot="dialog-body"
      className={cn(bodyClass, className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const layout = useDialogLayout()
  return (
    <div
      data-slot="dialog-footer"
      className={cn(dialogFooterLayoutClass[layout], className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
}


