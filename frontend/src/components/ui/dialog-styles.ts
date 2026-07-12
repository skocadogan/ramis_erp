/** Dialog bileşenlerinin merkezi stil tanımları — tüm layout/size buradan yönetilir. */

export type DialogLayout = "default" | "scroll"

/** Genişlik token'ları — DialogContent'te yalnızca `size` ile seçilir. */
export type DialogSize =
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl"
  | "5xl"
  | "6xl"
  | "7xl"

export const dialogContentShell =
  "fixed top-1/2 left-1/2 z-50 w-full max-w-9/10 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card text-sm shadow-lg ring-1 ring-border/50 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none"

export const dialogContentLayoutClass: Record<DialogLayout, string> = {
  default: "grid gap-4 p-6",
  scroll: "flex max-h-[90vh] min-h-0 flex-col gap-0 overflow-hidden p-0",
}

export const dialogSizeClass: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  "2xl": "sm:max-w-2xl",
  "3xl": "sm:max-w-3xl",
  "4xl": "sm:max-w-4xl",
  "5xl": "sm:max-w-5xl",
  "6xl": "sm:max-w-6xl",
  "7xl": "sm:max-w-7xl",
}

export const dialogHeaderLayoutClass: Record<DialogLayout, string> = {
  default: "flex flex-col gap-2",
  /** pr-12: absolute konumlu kapat (X) butonu ile çakışmayı önler */
  scroll: "shrink-0 border-b border-border py-5 pl-6 pr-12",
}

export const dialogBodyLayoutClass: Record<DialogLayout, string | null> = {
  default: null,
  scroll: "min-h-0 flex-1 overflow-y-auto px-6 py-5",
}

export const dialogFooterLayoutClass: Record<DialogLayout, string> = {
  default:
    "-mx-6 -mb-6 flex flex-row flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-border bg-card p-4",
  scroll:
    "relative z-10 mx-0 mb-0 flex shrink-0 flex-row flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-border bg-card px-6 py-4",
}

/** default layout varsayılan genişlik (size verilmezse) */
export const dialogDefaultSize: DialogSize = "md"
