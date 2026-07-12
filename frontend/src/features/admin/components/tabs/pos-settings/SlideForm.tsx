"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DialogBody, DialogFooter } from "@/components/ui/dialog"
import { AppImage } from "@/components/AppImage"
import type { PromotionSlide } from "./types"

interface SlideFormProps {
  slide: PromotionSlide | null
  onSubmit: (data: FormData) => void
  onCancel: () => void
  isSaving: boolean
}

export function SlideForm({ slide, onSubmit, onCancel, isSaving }: SlideFormProps) {
  const t = useTranslations("pos")
  const [type, setType] = useState<"IMAGE" | "TEXT">(slide?.type ?? "IMAGE")
  const [title, setTitle] = useState(slide?.title ?? "")
  const [subTitle, setSubTitle] = useState(slide?.sub_title ?? "")
  const [description, setDescription] = useState(slide?.description ?? "")
  const [order, setOrder] = useState(slide?.order ?? 0)
  const [duration, setDuration] = useState(slide?.duration ?? 10)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(slide?.image ?? null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData()
    formData.append("type", type)
    formData.append("title", title)
    formData.append("sub_title", subTitle)
    formData.append("description", description)
    formData.append("order", order.toString())
    formData.append("duration", duration.toString())
    if (imageFile) formData.append("image", imageFile)
    onSubmit(formData)
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogBody className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 col-span-2">
          <Label>{t('admin_settings.slides.typeLabel')}</Label>
          <div className="flex gap-2">
            <Button type="button" variant={type === "IMAGE" ? "default" : "outline"} className="flex-1" onClick={() => setType("IMAGE")}>
              {t('admin_settings.slides.typeImage')}
            </Button>
            <Button type="button" variant={type === "TEXT" ? "default" : "outline"} className="flex-1" onClick={() => setType("TEXT")}>
              {t('admin_settings.slides.typeText')}
            </Button>
          </div>
        </div>
        <div className="space-y-2 col-span-2">
          <Label>{t('admin_settings.slides.titleLabel')}</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} required placeholder={t('admin_settings.slides.titlePlaceholder')} />
        </div>
        <div className="space-y-2 col-span-2">
          <Label>{t('admin_settings.slides.subtitleLabel')}</Label>
          <Input value={subTitle} onChange={e => setSubTitle(e.target.value)} placeholder={t('admin_settings.slides.subtitlePlaceholder')} />
        </div>
        <div className="space-y-2 col-span-2">
          <Label>{t('admin_settings.slides.descLabel')}</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('admin_settings.slides.descPlaceholder')} />
        </div>
        <div className="space-y-2">
          <Label>{t('admin_settings.slides.orderLabel')}</Label>
          <Input type="number" value={order} onChange={e => setOrder(parseInt(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>{t('admin_settings.slides.durationLabel')}</Label>
          <Input type="number" value={duration} onChange={e => setDuration(parseInt(e.target.value))} />
        </div>

        {type === "IMAGE" && (
          <div className="space-y-2 col-span-2">
            <Label>{t('admin_settings.slides.imageLabel')}</Label>
            <div className="mt-2 flex items-center gap-4">
              <div className="relative flex h-24 w-32 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted">
                {preview ? (
                  <AppImage src={preview} alt={t('admin_settings.slides.preview')} fill className="object-cover" sizes="128px" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Input
                  type="file"
                  accept="image/*, image/webp, .webp"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) { setImageFile(file); setPreview(URL.createObjectURL(file)) }
                  }}
                  className="h-9 py-1"
                  required={!slide}
                />
                <p className="text-sub text-muted-foreground">{t('admin_settings.slides.imageHint')}</p>
              </div>
            </div>
          </div>
        )}

        {type === "TEXT" && (
          <div className="space-y-2 col-span-2">
            <Label className="text-xs font-ui-semibold text-muted-foreground">{t('admin_settings.slides.textPreviewTitle')}</Label>
            <div className="h-24 w-full rounded-lg border border-border bg-slate-900 flex flex-col items-center justify-center p-4 text-center text-white overflow-hidden shadow-inner">
              <p className="text-sm font-ui-bold leading-tight line-clamp-1">{title || t('admin_settings.slides.textPreviewDefaultTitle')}</p>
              <p className="text-xs opacity-70 line-clamp-1">{subTitle || t('admin_settings.slides.textPreviewDefaultSubtitle')}</p>
            </div>
            <p className="text-2xs text-muted-foreground mt-1">{t('admin_settings.slides.textHint')}</p>
          </div>
        )}
      </div>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{t('admin_settings.slides.cancel')}</Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? t('admin_settings.slides.saving') : (slide ? t('admin_settings.slides.saveChanges') : t('admin_settings.slides.createSlide'))}
        </Button>
      </DialogFooter>
    </form>
  )
}
