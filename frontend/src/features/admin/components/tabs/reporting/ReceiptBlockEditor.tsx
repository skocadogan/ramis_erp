"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import {
  Type, Minus, AlignLeft, List, ChevronDown, ChevronUp,
  Trash2, Plus, QrCode, Scissors, ArrowDownUp,
  Calendar, Clock, Image, Building2
} from "lucide-react"
import type { ReceiptBlock, ReceiptBlockType } from "../../../services/adminApi"
import api from "@/lib/api"

interface Props {
  blocks: ReceiptBlock[]
  onChange: (blocks: ReceiptBlock[]) => void
}

const VARIABLES = [
  "{{ branch_name }}", "{{ branch_address }}", "{{ branch_phone }}",
  "{{ table_name }}", "{{ waiter_name }}", "{{ order_number }}", "{{ sale_id }}",
  "{{ total | currency }}", "{{ subtotal | currency }}", "{{ tax | currency }}",
  "{{ total | rate 20 | currency }}", "{{ total | rate 10 | currency }}",
  "{{ discount | currency }}", "{{ payment_method }}", "{{ payment_type }}",
  "{{ created_at }}", "{{ date }}", "{{ time }}",
  "{{ customer_name }}", "{{ station_name }}", "{{ notes }}", "{{ descriptions }}",
  "{{ name | with_options }}",
  "{{ name | with_tax_rates }}",
]

function blockSummary(
  b: ReceiptBlock,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  switch (b.type) {
    case "text":
      return b.content?.slice(0, 40) ?? ""
    case "divider":
      return (b.char ?? "-").repeat(12)
    case "key_value":
      return t("reporting.blockEditor.summary.keyValue", {
        left: b.left ?? "",
        right: b.right ?? "",
      })
    case "item_loop":
      return t("reporting.blockEditor.summary.itemLoop", {
        variable: b.variable ?? "items",
        cols: b.columns?.length ?? 0,
      })
    case "feed":
      return t("reporting.blockEditor.summary.feedLines", { n: b.lines ?? 1 })
    case "cut":
      return t("reporting.blockEditor.summary.paperCut")
    case "qr":
      return b.data ?? ""
    case "date":
      return t("reporting.blockEditor.summary.printDate")
    case "time":
      return t("reporting.blockEditor.summary.printTime")
    case "branch_logo":
      return t("reporting.blockEditor.summary.branchLogo")
    case "branch_info":
      return t("reporting.blockEditor.summary.branchInfo", { n: b.fields?.length ?? 9 })
    default:
      return ""
  }
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-sub text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function Input({ value, onChange, mono = false, placeholder = "" }: {
  value: string; onChange: (v: string) => void; mono?: boolean; placeholder?: string
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`flex-1 h-7 px-2 text-xs rounded
        bg-slate-100 border border-slate-300 text-slate-900
        focus:outline-none focus:border-indigo-500
        dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200
        ${mono ? "font-mono" : ""}`}
    />
  )
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="flex-1 h-7 px-2 text-xs rounded
        bg-slate-100 border border-slate-300 text-slate-900
        focus:outline-none focus:border-indigo-500
        dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Checkbox({ checked, onChange, label }: {
  checked: boolean; onChange: (v: boolean) => void; label: string
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none
      text-foreground">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="w-3.5 h-3.5 accent-indigo-500" />
      {label}
    </label>
  )
}

function alignOpts(t: (key: string) => string) {
  return [
    { value: "left", label: t("reporting.blockEditor.align.left") },
    { value: "center", label: t("reporting.blockEditor.align.center") },
    { value: "right", label: t("reporting.blockEditor.align.right") },
  ]
}

const BRANCH_FIELDS = [
  { key: "name", labelKey: "branchFields.name" },
  { key: "phone", labelKey: "branchFields.phone" },
  { key: "email", labelKey: "branchFields.email" },
  { key: "website", labelKey: "branchFields.website" },
  { key: "address", labelKey: "branchFields.address" },
  { key: "tax_office", labelKey: "branchFields.taxOffice" },
  { key: "tax_number", labelKey: "branchFields.taxNumber" },
  { key: "registry_no", labelKey: "branchFields.registryNo" },
  { key: "mersis_no", labelKey: "branchFields.mersisNo" },
] as const

function BranchInfoEditor({ block, onUpdate, t, branches }: {
  block: ReceiptBlock
  onUpdate: (b: ReceiptBlock) => void
  t: (key: string, values?: Record<string, string | number>) => string
  branches: { id: string; name: string }[]
}) {
  const up = (patch: Partial<ReceiptBlock>) => onUpdate({ ...block, ...patch })
  const selectedFields = block.fields ?? BRANCH_FIELDS.map(f => f.key)

  const toggleField = (key: string) => {
    const next = selectedFields.includes(key)
      ? selectedFields.filter(f => f !== key)
      : [...selectedFields, key]
    up({ fields: next.length === BRANCH_FIELDS.length ? undefined : next })
  }

  const moveField = (key: string, dir: -1 | 1) => {
    const idx = selectedFields.indexOf(key)
    if (idx < 0) return
    const next = [...selectedFields]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    up({ fields: next })
  }

  return (
    <div className="space-y-1.5">
      <FieldRow label={t("reporting.blockEditor.fields.branch")}>
        <Select
          value={block.branch_id ?? ""}
          onChange={v => up({ branch_id: v || undefined })}
          options={[
            { value: "", label: t("reporting.blockEditor.fields.autoBranch") },
            ...branches.map(b => ({ value: b.id, label: b.name })),
          ]}
        />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.align")}>
        <Select value={block.align ?? "left"} onChange={v => up({ align: v as ReceiptBlock["align"] })} options={alignOpts(t)} />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.size")}>
        <Select value={block.size ?? "normal"} onChange={v => up({ size: v as ReceiptBlock["size"] })}
          options={[{ value: "normal", label: "1×" }, { value: "double", label: "2×" }]} />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.boldWrite")}>
        <input type="checkbox" checked={block.bold ?? false} onChange={e => up({ bold: e.target.checked })} />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.hideIfEmpty")}>
        <input type="checkbox" checked={block.hide_if_empty ?? false} onChange={e => up({ hide_if_empty: e.target.checked })} />
      </FieldRow>

      <div className="border-t border-border pt-2 mt-2">
        <span className="text-2xs font-ui-semibold text-muted-foreground uppercase tracking-wider">
          {t("reporting.blockEditor.fields.visibleFields")}
        </span>
        <div className="space-y-0.5 mt-1 max-h-48 overflow-y-auto">
          {BRANCH_FIELDS.map((f) => {
            const checked = selectedFields.includes(f.key)
            const idx = selectedFields.indexOf(f.key)
            return (
              <div key={f.key} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleField(f.key)}
                  className="w-3 h-3 accent-indigo-500 shrink-0"
                />
                <span className={`flex-1 ${checked ? "" : "text-muted-foreground line-through"}`}>
                  {t(`reporting.blockEditor.${f.labelKey}`)}
                </span>
                {checked && (
                  <div className="flex gap-0.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx <= 0}
                      onClick={() => moveField(f.key, -1)}
                      className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                    >
                      <ChevronUp size={11} />
                    </button>
                    <button
                      type="button"
                      disabled={idx >= selectedFields.length - 1}
                      onClick={() => moveField(f.key, 1)}
                      className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                    >
                      <ChevronDown size={11} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BlockEditor({ block, onUpdate, branches }: { block: ReceiptBlock; onUpdate: (b: ReceiptBlock) => void; branches: { id: string; name: string }[] }) {
  const t = useTranslations("admin")
  const up = (patch: Partial<ReceiptBlock>) => onUpdate({ ...block, ...patch })

  const alignOpts = () => [
    { value: "left", label: t("reporting.blockEditor.align.left") },
    { value: "center", label: t("reporting.blockEditor.align.center") },
    { value: "right", label: t("reporting.blockEditor.align.right") },
  ]

  const sizeOpts = () => [
    { value: "normal", label: t("reporting.blockEditor.sizeOpts.normal") },
    { value: "double", label: t("reporting.blockEditor.sizeOpts.double") },
    { value: "triple", label: t("reporting.blockEditor.sizeOpts.triple") },
    { value: "quadruple", label: t("reporting.blockEditor.sizeOpts.quadruple") },
  ]

  const colAlignOpts = () => [
    { value: "left", label: t("reporting.blockEditor.align.left") },
    { value: "right", label: t("reporting.blockEditor.align.right") },
    { value: "center", label: t("reporting.blockEditor.align.center") },
  ]

  const colFormatOpts = () => [
    { value: "", label: t("reporting.blockEditor.format.none") },
    { value: "currency", label: t("reporting.blockEditor.format.currency") },
    { value: "qty", label: t("reporting.blockEditor.format.qty") },
    { value: "with_options", label: t("reporting.blockEditor.format.withOptions") },
    { value: "with_tax_rates", label: t("reporting.blockEditor.format.withTaxRates") },
  ]

  const dividerCharOpts = () => [
    { value: "-", label: t("reporting.blockEditor.dividerChars.single") },
    { value: "=", label: t("reporting.blockEditor.dividerChars.double") },
    { value: "*", label: t("reporting.blockEditor.dividerChars.star") },
    { value: " ", label: t("reporting.blockEditor.dividerChars.space") },
  ]

  if (block.type === "text") return (
    <div className="space-y-1.5">
      <FieldRow label={t("reporting.blockEditor.fields.content")}>
        <Input value={block.content ?? ""} onChange={v => up({ content: v })} mono placeholder="{{ branch_name }}" />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.align")}>
        <Select value={block.align ?? "left"} onChange={v => up({ align: v as ReceiptBlock["align"] })}
          options={alignOpts()} />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.size")}>
        <Select value={block.size ?? "normal"} onChange={v => up({ size: v as ReceiptBlock["size"] })}
          options={sizeOpts()} />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.marginLeft")}>
        <Input
          value={String(block.margin_left ?? 0)}
          onChange={v => {
            const n = parseInt(v.replace(/\D/g, ""), 10)
            up({ margin_left: Number.isFinite(n) ? Math.max(0, n) : 0 })
          }}
          placeholder="0"
        />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.marginRight")}>
        <Input
          value={String(block.margin_right ?? 0)}
          onChange={v => {
            const n = parseInt(v.replace(/\D/g, ""), 10)
            up({ margin_right: Number.isFinite(n) ? Math.max(0, n) : 0 })
          }}
          placeholder="0"
        />
      </FieldRow>
      <FieldRow label="">
        <div className="flex gap-4">
          <Checkbox checked={block.bold ?? false} onChange={v => up({ bold: v })} label={t("reporting.blockEditor.fields.boldCheckbox")} />
          <Checkbox checked={block.hide_if_empty ?? false} onChange={v => up({ hide_if_empty: v })} label={t("reporting.blockEditor.fields.hideIfEmpty")} />
        </div>
      </FieldRow>
    </div>
  )

  if (block.type === "divider") return (
    <FieldRow label={t("reporting.blockEditor.fields.char")}>
      <Select value={block.char ?? "-"} onChange={v => up({ char: v })}
        options={dividerCharOpts()} />
    </FieldRow>
  )

  if (block.type === "key_value") return (
    <div className="space-y-1.5">
      <FieldRow label={t("reporting.blockEditor.fields.leftLabel")}>
        <Input value={block.left ?? ""} onChange={v => up({ left: v })} placeholder={t("reporting.blockEditor.defaultKeyValueLeft")} />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.rightValue")}>
        <Input value={block.right ?? ""} onChange={v => up({ right: v })} mono placeholder="{{ table_name }}" />
      </FieldRow>
      <FieldRow label="">
        <div className="flex gap-4">
          <Checkbox checked={block.bold ?? false} onChange={v => up({ bold: v })} label={t("reporting.blockEditor.fields.boldCheckbox")} />
          <Checkbox checked={block.hide_if_empty ?? false} onChange={v => up({ hide_if_empty: v })} label={t("reporting.blockEditor.fields.hideIfEmpty")} />
        </div>
      </FieldRow>
    </div>
  )

  if (block.type === "item_loop") return (
    <div className="space-y-1.5">
      <FieldRow label={t("reporting.blockEditor.fields.variable")}>
        <Input value={block.variable ?? "items"} onChange={v => up({ variable: v })} mono />
      </FieldRow>
      <div className="mt-1">
        <p className="text-2xs text-muted-foreground mb-1">{t("reporting.blockEditor.columns")}</p>
        <p className="text-2xs text-muted-foreground/80 mb-1.5 leading-relaxed">
          {t("reporting.blockEditor.withOptionsColumnHint")}
        </p>
        <p className="text-2xs text-muted-foreground/80 mb-1.5 leading-relaxed">
          {t("reporting.blockEditor.withTaxRatesColumnHint")}
        </p>
        <div className="space-y-1">
          {(block.columns ?? []).map((col, i) => (
            <div key={i} className="flex items-center gap-1 text-xs">
              <Input value={col.field} onChange={v => {
                const cols = [...(block.columns ?? [])]
                cols[i] = { ...cols[i], field: v }
                up({ columns: cols })
              }} mono placeholder={t("reporting.blockEditor.itemPlaceholder")} />
              <input type="number" value={col.width} min={1} max={80}
                onChange={e => {
                  const cols = [...(block.columns ?? [])]
                  cols[i] = { ...cols[i], width: parseInt(e.target.value) || 10 }
                  up({ columns: cols })
                }}
                className="w-12 h-7 px-1 text-center rounded
                  bg-slate-100 border border-slate-300 text-slate-900
                  focus:outline-none focus:border-indigo-500
                  dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
              />
              <Select value={col.align} onChange={v => {
                const cols = [...(block.columns ?? [])]
                cols[i] = { ...cols[i], align: v as typeof col.align }
                up({ columns: cols })
              }} options={colAlignOpts()} />

              <Select
                value={col.format ?? ""}
                onChange={(v) => {
                  const cols = [...(block.columns ?? [])]
                  cols[i] = { ...cols[i], format: v || undefined }
                  up({ columns: cols })
                }}
                options={colFormatOpts()}
              />

              <div className="flex flex-col gap-1 w-16">
                <input value={col.prefix ?? ""} onChange={e => {
                  const cols = [...(block.columns ?? [])]
                  cols[i] = { ...cols[i], prefix: e.target.value }
                  up({ columns: cols })
                }} placeholder={t("reporting.blockEditor.prefix")} className="h-7 px-1 text-2xs rounded bg-slate-100 border border-slate-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200" />
                <input value={col.suffix ?? ""} onChange={e => {
                  const cols = [...(block.columns ?? [])]
                  cols[i] = { ...cols[i], suffix: e.target.value }
                  up({ columns: cols })
                }} placeholder={t("reporting.blockEditor.suffix")} className="h-7 px-1 text-2xs rounded bg-slate-100 border border-slate-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200" />
              </div>

              <div className="flex flex-col gap-0">
                <button type="button" onClick={() => {
                  if (i === 0) return
                  const cols = [...(block.columns ?? [])];
                  [cols[i], cols[i - 1]] = [cols[i - 1], cols[i]]
                  up({ columns: cols })
                }} disabled={i === 0} className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded disabled:opacity-20">
                  <ChevronUp size={12} />
                </button>
                <button type="button" onClick={() => {
                  if (i === (block.columns?.length ?? 0) - 1) return
                  const cols = [...(block.columns ?? [])];
                  [cols[i], cols[i + 1]] = [cols[i + 1], cols[i]]
                  up({ columns: cols })
                }} disabled={i === (block.columns?.length ?? 0) - 1} className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded disabled:opacity-20">
                  <ChevronDown size={12} />
                </button>
              </div>

              <button type="button" onClick={() => {
                const cols = [...(block.columns ?? [])].filter((_, j) => j !== i)
                up({ columns: cols })
              }} className="p-1 text-rose-400 hover:text-rose-300"><Trash2 size={12} /></button>
            </div>
          ))}
          <button type="button" onClick={() => {
            const cols = [...(block.columns ?? []), { field: "name", width: 15, align: "left" as const }]
            up({ columns: cols })
          }} className="text-sub text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mt-1">
            <Plus size={11} /> {t("reporting.blockEditor.columnAdd")}
          </button>
        </div>
      </div>
    </div>
  )

  if (block.type === "feed") return (
    <FieldRow label={t("reporting.blockEditor.fields.lineCount")}>
      <input type="number" value={block.lines ?? 1} min={1} max={10}
        onChange={e => up({ lines: parseInt(e.target.value) || 1 })}
        className="w-20 h-7 px-2 text-xs rounded
          bg-slate-100 border border-slate-300 text-slate-900
          focus:outline-none focus:border-indigo-500
          dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
      />
    </FieldRow>
  )

  if (block.type === "cut") return (
    <p className="text-xs text-muted-foreground italic">{t("reporting.blockEditor.cutHelp")}</p>
  )

  if (block.type === "qr") return (
    <FieldRow label={t("reporting.blockEditor.fields.qrData")}>
      <Input value={block.data ?? ""} onChange={v => up({ data: v })} mono placeholder="{{ order_number }}" />
    </FieldRow>
  )

  if (block.type === "date" || block.type === "time") return (
    <div className="space-y-1.5">
      <FieldRow label={t("reporting.blockEditor.fields.align")}>
        <Select value={block.align ?? "left"} onChange={v => up({ align: v as ReceiptBlock["align"] })} options={alignOpts()} />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.size")}>
        <Select value={block.size ?? "normal"} onChange={v => up({ size: v as ReceiptBlock["size"] })}
          options={sizeOpts()} />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.boldWrite")}>
        <input type="checkbox" checked={block.bold ?? false} onChange={e => up({ bold: e.target.checked })} />
      </FieldRow>
    </div>
  )

  if (block.type === "branch_logo") return (
    <div className="space-y-1.5">
      <FieldRow label={t("reporting.blockEditor.fields.branch")}>
        <Select
          value={block.branch_id ?? ""}
          onChange={v => up({ branch_id: v || undefined })}
          options={[
            { value: "", label: t("reporting.blockEditor.fields.autoBranch") },
            ...branches.map(b => ({ value: b.id, label: b.name })),
          ]}
        />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.align")}>
        <Select value={block.align ?? "center"} onChange={v => up({ align: v as ReceiptBlock["align"] })} options={alignOpts()} />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.logoWidthPx")}>
        <input
          type="number"
          min={64}
          max={1024}
          step={8}
          value={block.width_px ?? 384}
          onChange={e => up({ width_px: Number(e.target.value) || 384 })}
          className="w-20 px-2 py-1 text-xs border border-border rounded bg-slate-50 dark:bg-slate-800 dark:border-slate-700"
        />
      </FieldRow>
      <FieldRow label={t("reporting.blockEditor.fields.hideIfEmpty")}>
        <input type="checkbox" checked={block.hide_if_empty ?? true} onChange={e => up({ hide_if_empty: e.target.checked })} />
      </FieldRow>
    </div>
  )

  if (block.type === "branch_info") return <BranchInfoEditor block={block} onUpdate={onUpdate} t={t} branches={branches} />

  return null
}

export function ReceiptBlockEditor({ blocks, onChange }: Props) {
  const t = useTranslations("admin")
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showVars, setShowVars] = useState(false)

  // Şube listesi (branch_logo bloğu için)
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-list"],
    queryFn: () => api.get("/branches/").then(r => (r.data.results || r.data) as { id: string; name: string }[]),
    staleTime: 300_000,
  })

  const palette = useMemo(() => {
    const dk = t("reporting.blockEditor.defaultKeyValueLeft")
    return [
      {
        type: "text" as const, label: t("reporting.blockEditor.blockTypes.text"), icon: <Type size={14} />,
        default: {
          type: "text" as const,
          content: "{{ branch_name }}",
          align: "center" as const,
          bold: false,
          size: "normal" as const,
          margin_left: 0,
          margin_right: 0,
        },
      },
      {
        type: "divider" as const, label: t("reporting.blockEditor.blockTypes.divider"), icon: <Minus size={14} />,
        default: { type: "divider" as const, char: "-" },
      },
      {
        type: "key_value" as const, label: t("reporting.blockEditor.blockTypes.key_value"), icon: <AlignLeft size={14} />,
        default: { type: "key_value" as const, left: dk, right: "{{ table_name }}", bold: false },
      },
      {
        type: "item_loop" as const, label: t("reporting.blockEditor.blockTypes.item_loop"), icon: <List size={14} />,
        default: {
          type: "item_loop" as const, variable: "items",
          columns: [
            { field: "name", width: 20, align: "left" as const },
            { field: "qty", width: 5, align: "right" as const },
            { field: "price", width: 10, align: "right" as const, format: "currency" as const },
          ],
        },
      },
      {
        type: "feed" as const, label: t("reporting.blockEditor.blockTypes.feed"), icon: <ArrowDownUp size={14} />,
        default: { type: "feed" as const, lines: 1 },
      },
      {
        type: "cut" as const, label: t("reporting.blockEditor.blockTypes.cut"), icon: <Scissors size={14} />,
        default: { type: "cut" as const },
      },
      {
        type: "qr" as const, label: t("reporting.blockEditor.blockTypes.qr"), icon: <QrCode size={14} />,
        default: { type: "qr" as const, data: "{{ order_number }}" },
      },
      {
        type: "date" as const, label: t("reporting.blockEditor.blockTypes.date"), icon: <Calendar size={14} />,
        default: { type: "date" as const, align: "left" as const, bold: false },
      },
      {
        type: "time" as const, label: t("reporting.blockEditor.blockTypes.time"), icon: <Clock size={14} />,
        default: { type: "time" as const, align: "left" as const, bold: false },
      },
      {
        // eslint-disable-next-line jsx-a11y/alt-text
        type: "branch_logo" as const, label: t("reporting.blockEditor.blockTypes.branchLogo"), icon: <Image size={14} />,
        default: { type: "branch_logo" as const, align: "center" as const, width_px: 384, hide_if_empty: true },
      },
      {
        type: "branch_info" as const, label: t("reporting.blockEditor.blockTypes.branchInfo"), icon: <Building2 size={14} />,
        default: {
          type: "branch_info" as const, align: "left" as const, size: "normal" as const, bold: false,
          fields: ["name", "phone", "address", "tax_office", "tax_number"],
          hide_if_empty: false,
        },
      },
    ]
  }, [t])

  const addBlock = (tpl: ReceiptBlock) => {
    onChange([...blocks, { ...tpl }])
    setExpanded(blocks.length)
  }

  const updateBlock = (i: number, b: ReceiptBlock) => {
    const next = [...blocks]; next[i] = b; onChange(next)
  }

  const removeBlock = (i: number) => {
    onChange(blocks.filter((_, j) => j !== i))
    if (expanded === i) setExpanded(null)
  }

  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= blocks.length) return
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]]
    onChange(next)
    setExpanded(j)
  }

  const typeLabel = (type: ReceiptBlockType) => {
    switch (type) {
      case "text": return t("reporting.blockEditor.blockTypes.text")
      case "divider": return t("reporting.blockEditor.blockTypes.divider")
      case "key_value": return t("reporting.blockEditor.blockTypes.key_value")
      case "item_loop": return t("reporting.blockEditor.blockTypes.item_loop")
      case "feed": return t("reporting.blockEditor.blockTypes.feed")
      case "cut": return t("reporting.blockEditor.blockTypes.cut")
      case "qr": return t("reporting.blockEditor.blockTypes.qr")
      case "date": return t("reporting.blockEditor.blockTypes.date")
      case "time": return t("reporting.blockEditor.blockTypes.time")
      case "branch_logo": return t("reporting.blockEditor.blockTypes.branchLogo")
      case "branch_info": return t("reporting.blockEditor.blockTypes.branchInfo")
      default: return type
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Palet */}
      <div className="px-3 py-2 border-b
        border-border bg-white
        dark:border-slate-700 dark:bg-slate-800/60">
        <p className="text-2xs uppercase tracking-wider mb-2
          text-muted-foreground dark:text-muted-foreground">{t("reporting.blockEditor.addBlockTitle")}</p>
        <div className="flex flex-wrap gap-1.5">
          {palette.map(p => (
            <button key={p.type} type="button" onClick={() => addBlock(p.default)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-ui-medium
                bg-slate-100 hover:bg-indigo-600 text-slate-600 hover:text-white
                border border-slate-300 hover:border-indigo-500 transition-all
                dark:bg-slate-700 dark:hover:bg-indigo-600 dark:text-slate-300
                dark:border-slate-600 dark:hover:border-indigo-500">
              {p.icon}{p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Değişkenler toggle */}
      <div className="px-3 py-1.5 border-b border-border">
        <button type="button" onClick={() => setShowVars(v => !v)}
          className="text-sub flex items-center gap-1
            text-indigo-500 hover:text-indigo-600
            dark:text-indigo-400 dark:hover:text-indigo-300">
          {showVars ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {t("reporting.blockEditor.variablesToggle")}
        </button>
        {showVars && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {VARIABLES.map(v => (
              <code key={v} className="text-2xs px-1.5 py-0.5 rounded font-mono
                bg-slate-100 text-emerald-700
                dark:bg-slate-700 dark:text-emerald-400">
                {v}
              </code>
            ))}
          </div>
        )}
      </div>

      {/* Blok listesi */}
      <div className="flex-1 overflow-y-auto">
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 h-32 text-slate-600 text-sm">
            <List size={28} />
            <p>{t("reporting.blockEditor.emptyBlocks")}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700/60">
            {blocks.map((block, i) => (
              <div key={i} className="group">
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none
                    hover:bg-slate-100 dark:hover:bg-slate-800/50"
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  <span className="w-5 h-5 flex items-center justify-center rounded text-2xs font-ui-bold
                    bg-slate-200 text-muted-foreground
                    dark:bg-slate-700 dark:text-muted-foreground">{i + 1}</span>
                  <span className="text-sub font-ui-semibold w-20 shrink-0
                    text-indigo-600 dark:text-indigo-400">
                    {typeLabel(block.type)}
                  </span>
                  <span className="flex-1 text-sub truncate font-mono
                    text-muted-foreground dark:text-muted-foreground">
                    {blockSummary(block, t)}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={e => { e.stopPropagation(); moveBlock(i, -1) }}
                      disabled={i === 0}
                      className="p-1 rounded text-muted-foreground hover:text-slate-700
                        hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-300
                        disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronUp size={12} />
                    </button>
                    <button type="button" onClick={e => { e.stopPropagation(); moveBlock(i, 1) }}
                      disabled={i === blocks.length - 1}
                      className="p-1 rounded text-muted-foreground hover:text-slate-700
                        hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-300
                        disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronDown size={12} />
                    </button>
                    <button type="button" onClick={e => { e.stopPropagation(); removeBlock(i) }}
                      className="p-1 rounded text-muted-foreground hover:text-rose-600
                        hover:bg-rose-50 dark:hover:bg-rose-900/40 dark:hover:text-rose-400">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="text-muted-foreground dark:text-slate-600">
                    {expanded === i ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </div>
                </div>

                {expanded === i && (
                  <div className="px-4 pb-3 pt-1.5 border-t
                    bg-slate-50 border-border
                    dark:bg-slate-800/40 dark:border-slate-700/50">
                    <BlockEditor block={block} onUpdate={b => updateBlock(i, b)} branches={branches} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
