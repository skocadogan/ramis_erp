"use client"

import { useTranslations } from "next-intl"
import { Plus, Edit2, Trash2, Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AppImage } from "@/components/AppImage"
import { SlideForm } from "./SlideForm"
import type { PromotionSlide } from "./types"

interface SlideTableProps {
  slides: PromotionSlide[]
  isDialogOpen: boolean
  editingSlide: PromotionSlide | null
  isSaving: boolean
  slideScopeLabel: (slide: PromotionSlide) => string
  onDialogOpenChange: (open: boolean) => void
  onEditSlide: (slide: PromotionSlide) => void
  onDeleteSlide: (id: string | number) => void
  onToggleSlide: (slide: PromotionSlide) => void
  onSaveSlide: (formData: FormData) => void
}

export function SlideTable({
  slides, isDialogOpen, editingSlide, isSaving,
  slideScopeLabel,
  onDialogOpenChange, onEditSlide, onDeleteSlide, onToggleSlide, onSaveSlide,
}: SlideTableProps) {
  const t = useTranslations("pos")
  return (
    <Card className="p-0 gap-0 border-border shadow-sm bg-card border-border overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 border-b border-border bg-muted/40 border-border">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {t('admin_settings.slides.title')}
          </CardTitle>
          <CardDescription className="text-xs">{t('admin_settings.slides.description')}</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={onDialogOpenChange}>
          <DialogTrigger
            render={
              <Button size="sm" className="h-8">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('admin_settings.slides.addNew')}
              </Button>
            }
          />
          <DialogContent layout="scroll" size="md">
            <DialogHeader>
              <DialogTitle>{editingSlide ? t('admin_settings.slides.editTitle') : t('admin_settings.slides.addTitle')}</DialogTitle>
            </DialogHeader>
            <SlideForm
              key={editingSlide?.id ?? "new"}
              slide={editingSlide}
              onSubmit={onSaveSlide}
              onCancel={() => onDialogOpenChange(false)}
              isSaving={isSaving}
            />
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-4">
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[80px]">{t('admin_settings.slides.tableType')}</TableHead>
                <TableHead className="w-[80px]">{t('admin_settings.slides.tableImage')}</TableHead>
                <TableHead>{t('admin_settings.slides.tableContent')}</TableHead>
                <TableHead className="text-center min-w-[100px]">{t('admin_settings.slides.tableScope')}</TableHead>
                <TableHead className="text-center">{t('admin_settings.slides.tableOrder')}</TableHead>
                <TableHead className="text-center">{t('admin_settings.slides.tableStatus')}</TableHead>
                <TableHead className="text-right">{t('admin_settings.slides.tableActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slides.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground italic">
                    {t('admin_settings.slides.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                slides.map((slide) => (
                  <TableRow key={slide.id} className="hover:/50 transition-colors">
                    <TableCell>
                      <Badge variant={slide.type === "IMAGE" ? "default" : "secondary"} className="text-2xs uppercase font-bold">
                        {slide.type === "IMAGE" ? t('admin_settings.slides.typeImageLabel') : t('admin_settings.slides.typeTextLabel')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="relative h-8 w-8 rounded-md overflow-hidden border border-border flex items-center justify-center border-border bg-muted">
                        {slide.image ? (
                          <AppImage src={slide.image} alt="" fill className="object-cover" sizes="32px" />
                        ) : (
                          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground line-clamp-1">{slide.title}</p>
                        {slide.sub_title && <p className="text-2xs text-muted-foreground line-clamp-1">{slide.sub_title}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-2xs font-medium max-w-[140px] truncate" title={slideScopeLabel(slide)}>
                        {slideScopeLabel(slide)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-mono text-2xs">{slide.order}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={slide.is_active} onCheckedChange={() => onToggleSlide(slide)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => onEditSlide(slide)}>
                          <Edit2 className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => onDeleteSlide(slide.id)}>
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
