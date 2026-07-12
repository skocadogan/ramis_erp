/**
 * Client-side ESC/POS receipt renderer.
 * Mirrors the Python `ReceiptRenderer.render_to_text()` logic.
 * Used for live preview — no API call needed, works for unsaved templates too.
 */

import type { ReceiptBlock } from "../features/admin/services/adminApi"
import { getCurrencySymbol } from "./formatters"

// ── Sample contexts for category-based previews ──────────────────────────────

export const SAMPLE_CONTEXTS: Record<string, Record<string, unknown>> = {
  POS_RECEIPT: {
    branch_name: "RAMIS CAFE",
    branch_address: "Atatürk Cad. No:12",
    branch_phone: "0212 555 1234",
    table_name: "Masa 5",
    waiter_name: "Ahmet",
    order_number: "ORD-12345",
    sale_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    items: [
      {
        name: "Mercimek Çorbası",
        qty: 1,
        price: 165.0,
        total: 165.0,
        unit: "Az",
        tax_rate: 10,
        description: "Çok pişsin",
        modifier_names: ["Ekstra Soslu"],
        modifiers: "Ekstra Soslu",
      },
      { name: "Americano", qty: 2, price: 50.0, total: 100.0, unit: "Adet", tax_rate: 20, description: "Sütsüz" },
      { name: "Cheesecake", qty: 1, price: 85.0, total: 85.0, unit: "Adet", tax_rate: 20, description: "Limonlu" },
    ],
    subtotal: 200.0,
    discount: 15.0,
    tax: 0.0,
    total: 185.0,
    payment_method: "Nakit: 60,00 ₺\nKredi Kartı: 50,00 ₺\nDiğer: 75,00 ₺",
    payment_type: "Nakit: 60,00 ₺\nKredi Kartı: 50,00 ₺\nDiğer: 75,00 ₺",
    payments: [
      { method: "Nakit", amount: 60.0 },
      { method: "Kredi Kartı", amount: 50.0 },
      { method: "Diğer", amount: 75.0 },
    ],
    created_at: "03.05.2026 13:42",
    date: "03.05.2026",
    time: "13:42",
    customer_name: "Sedat KOCADOGAN",
  },
    KITCHEN_TICKET: {
    station_name: "ANA MUTFAK",
    table_name: "Masa 5",
    waiter_name: "Ahmet",
    order_number: "ORD-12345",
    created_at: "03.05.2026 13:42",
    items: [
      {
        name: "Soslu Patlıcan",
        qty: 1,
        modifiers: "Acı Soslu, Karabiberli",
        modifier_names: ["Acı Soslu", "Karabiberli"],
        unit: "Porsiyon",
      },
      { name: "Çoban Salata", qty: 1, unit: "Kase" },
    ],
  },
  WAITER_TICKET: {
    table_name: "Masa 5",
    waiter_name: "Ahmet",
    order_number: "ORD-12345",
    created_at: "03.05.2026 13:42",
    items: [
      {
        name: "Mercimek Çorbası",
        qty: 1,
        price: 165.0,
        total: 165.0,
        unit: "Az",
        tax_rate: 10,
        description: "Çok pişsin",
        modifier_names: ["Ekstra Soslu"],
        modifiers: "Ekstra Soslu",
      },
      { name: "Americano", qty: 2, price: 50.0, total: 100.0, unit: "Adet", tax_rate: 20, description: "Sütsüz" },
      { name: "Cheesecake", qty: 1, price: 85.0, total: 85.0, unit: "Adet", tax_rate: 20, description: "Limonlu" },
    ],
    total: 185.0,
  },
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatCurrency(value: unknown): string {
  const n = parseFloat(String(value))
  const sym = getCurrencySymbol()
  if (isNaN(n)) return `0,00 ${sym}`
  return `${n.toFixed(2).replace(".", ",")} ${sym}`
}

function formatDate(value: unknown): string {
  if (!value) return ""
  return String(value).slice(0, 10)
}

function formatQty(value: unknown): string {
  const n = parseFloat(String(value))
  if (isNaN(n)) return "0"
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",")
}

const PAYMENT_CODE_LABELS: Record<string, string> = {
  CASH: "Nakit",
  CARD: "Kredi Kartı",
  OTHER: "Diger",
}

function paymentLineLabel(p: Record<string, unknown>): string {
  const disp = p.payment_method_display
  if (disp != null && String(disp).trim() !== "") return String(disp).trim()
  const raw = p.method ?? p.payment_method
  if (raw == null) return ""
  const key = String(raw).trim().toUpperCase()
  if (key in PAYMENT_CODE_LABELS) return PAYMENT_CODE_LABELS[key]!
  return String(raw).trim()
}

function paymentTypeFromPayments(payments: unknown): string | null {
  if (!Array.isArray(payments) || payments.length === 0) return null
  const lines: string[] = []
  for (const item of payments) {
    if (!item || typeof item !== "object") continue
    const p = item as Record<string, unknown>
    const label = paymentLineLabel(p)
    if (!label) continue
    const n = parseFloat(String(p.amount))
    if (!Number.isFinite(n) || n <= 0) continue
    lines.push(`${label}: ${formatCurrency(n)}`)
  }
  return lines.length > 0 ? lines.join("\n") : null
}

function itemModifierText(item: Record<string, unknown>): string {
  const entries = normalizeModifierEntries(item)
  if (entries.length > 0) {
    const labels = entries.map((e) => e.name).filter(Boolean)
    if (labels.length === 0) return ""
    let text = labels.join(", ")
    const paid = entries.reduce((sum, e) => sum + (e.price > 0 ? e.price : 0), 0)
    if (paid > 0) {
      const suffix = Number.isInteger(paid) ? String(paid) : String(paid).replace(".", ",")
      text = `${text} (+${suffix})`
    }
    return text
  }
  const raw = item.modifiers ?? item.modifier_names
  if (raw == null) return ""
  if (typeof raw === "string") return raw.trim()
  if (!Array.isArray(raw)) return String(raw).trim()
  const labels: string[] = []
  for (const entry of raw) {
    if (entry && typeof entry === "object") {
      const o = entry as Record<string, unknown>
      const label = String(o.modifier_name ?? o.name ?? "").trim()
      if (label) labels.push(label)
    } else {
      const label = String(entry).trim()
      if (label) labels.push(label)
    }
  }
  return labels.join(", ")
}

function normalizeModifierEntries(item: Record<string, unknown>): Array<{ name: string; price: number }> {
  const rawEntries = item.modifier_entries
  if (Array.isArray(rawEntries) && rawEntries.length > 0) {
    const out: Array<{ name: string; price: number }> = []
    for (const entry of rawEntries) {
      if (!entry || typeof entry !== "object") continue
      const o = entry as Record<string, unknown>
      const name = String(o.name ?? o.modifier_name ?? "").trim()
      if (!name) continue
      const price = parseFloat(String(o.price ?? 0)) || 0
      out.push({ name, price })
    }
    if (out.length > 0) return out
  }
  const mods = item.modifiers
  if (Array.isArray(mods)) {
    const out: Array<{ name: string; price: number }> = []
    for (const entry of mods) {
      if (!entry || typeof entry !== "object") continue
      const o = entry as Record<string, unknown>
      const name = String(o.modifier_name ?? o.name ?? "").trim()
      if (!name) continue
      const price = parseFloat(String(o.price ?? 0)) || 0
      out.push({ name, price })
    }
    if (out.length > 0) return out
  }
  const names = item.modifier_names
  if (Array.isArray(names)) {
    return names
      .map((n) => String(n).trim())
      .filter(Boolean)
      .map((name) => ({ name, price: 0 }))
  }
  return []
}

function itemUnitModifierSum(item: Record<string, unknown>): number {
  if (item.modifier_total != null) return parseItemDecimal(item, "modifier_total")
  return normalizeModifierEntries(item).reduce((sum, e) => sum + e.price, 0)
}

function itemPaidModifierTotal(item: Record<string, unknown>): number {
  return normalizeModifierEntries(item).reduce((sum, e) => sum + (e.price > 0 ? e.price : 0), 0)
}

const TAX_RATE_FILTER_TOKENS = ["with_tax_rates", "with_tax_rate"] as const

function columnUsesWithTaxRates(col: { field?: string; format?: string }): boolean {
  const field = String(col.field ?? "")
  const fmt = col.format ?? ""
  if (TAX_RATE_FILTER_TOKENS.includes(fmt as (typeof TAX_RATE_FILTER_TOKENS)[number])) return true
  return TAX_RATE_FILTER_TOKENS.some((t) => field.includes(`| ${t}`) || field.includes(`|${t}`))
}

function layoutUsesWithTaxRates(layout: ReceiptBlock[]): boolean {
  for (const block of layout) {
    if (block.type !== "item_loop") continue
    for (const col of block.columns ?? []) {
      if (columnUsesWithTaxRates(col)) return true
    }
  }
  return false
}

function itemLoopUsesWithTaxRates(block: ReceiptBlock): boolean {
  return (block.columns ?? []).some((col) => columnUsesWithTaxRates(col))
}

function parseItemDecimal(item: Record<string, unknown>, key: string, fallback = 0): number {
  const raw = item[key]
  if (raw == null || raw === "") return fallback
  const n = parseFloat(String(raw).replace(",", "."))
  return Number.isFinite(n) ? n : fallback
}

function itemQty(item: Record<string, unknown>): number {
  const qty = parseItemDecimal(item, "qty", 1)
  return qty > 0 ? qty : 1
}

function itemTaxRate(item: Record<string, unknown>): number {
  return parseItemDecimal(item, "tax_rate", 0)
}

function itemLineNet(item: Record<string, unknown>): number {
  if (item.line_net != null) return parseItemDecimal(item, "line_net")
  if (item.total != null && itemUnitModifierSum(item) <= 0) return parseItemDecimal(item, "total")
  return (parseItemDecimal(item, "price") + itemUnitModifierSum(item)) * itemQty(item)
}

function itemProductLineGross(item: Record<string, unknown>): number {
  const net = parseItemDecimal(item, "price") * itemQty(item)
  const rate = itemTaxRate(item)
  if (rate <= 0) return net
  return Math.round((net / (1 + rate / 100)) * 100) / 100
}

function itemLineGross(item: Record<string, unknown>): number {
  if (item.line_gross != null) return parseItemDecimal(item, "line_gross")
  const net = itemLineNet(item)
  const rate = itemTaxRate(item)
  if (rate <= 0) return net
  return Math.round((net / (1 + rate / 100)) * 100) / 100
}

function itemLineTax(item: Record<string, unknown>): number {
  if (item.line_tax != null) return parseItemDecimal(item, "line_tax")
  return Math.round((itemLineNet(item) - itemLineGross(item)) * 100) / 100
}

function ensureItemTaxFields(items: Record<string, unknown>[]): void {
  for (const item of items) {
    const net = itemLineNet(item)
    const gross = itemLineGross(item)
    const tax = itemLineTax(item)
    item.line_net = net
    item.line_gross = gross
    item.line_tax = tax
  }
}

function sumItemsTax(items: Record<string, unknown>[]): number {
  return items.reduce((acc, item) => acc + itemLineTax(item), 0)
}

function sumItemsGross(items: Record<string, unknown>[]): number {
  return Math.round(items.reduce((acc, item) => acc + itemLineGross(item), 0) * 100) / 100
}

function sumItemsNet(items: Record<string, unknown>[]): number {
  return Math.round(items.reduce((acc, item) => acc + itemLineNet(item), 0) * 100) / 100
}

function formatTaxRateLabel(rate: number): string {
  if (Number.isInteger(rate)) return String(rate)
  return String(rate).replace(".", ",")
}

function formatItemTaxLine(rate: number, taxAmount: number, paperWidth: number): string {
  const left = `  % ${formatTaxRateLabel(rate)}`
  const right = formatCurrency(taxAmount)
  const gap = Math.max(1, paperWidth - left.length - right.length)
  return left + " ".repeat(gap) + right
}

function itemCurrencyColumnValue(
  item: Record<string, unknown>,
  field: string,
  usesTaxRatesMode: boolean,
  productOnlyGross = false
): number | null {
  const fieldL = field.trim().toLowerCase()
  if (fieldL === "price") {
    const qty = itemQty(item)
    let line: number
    if (usesTaxRatesMode && productOnlyGross) line = itemProductLineGross(item)
    else if (usesTaxRatesMode) line = itemLineGross(item)
    else line = itemLineNet(item)
    return Math.round((line / qty) * 100) / 100
  }
  if (fieldL === "total" || fieldL === "line_total") {
    return usesTaxRatesMode ? itemLineGross(item) : itemLineNet(item)
  }
  return null
}

function columnUsesWithOptions(col: { field?: string; format?: string }): boolean {
  const field = String(col.field ?? "")
  const fmt = col.format ?? ""
  return fmt === "with_options" || field.includes("| with_options") || field.includes("|with_options")
}

function itemDisplayName(item: Record<string, unknown>): string {
  for (const key of ["name", "product_name", "product"] as const) {
    let raw: unknown = item[key]
    if (raw == null) continue
    if (typeof raw === "object" && raw !== null) {
      const o = raw as Record<string, unknown>
      raw = o.name ?? o.product_name
    }
    const label = String(raw).trim()
    if (label) return label
  }
  return ""
}

/** Backend _compile_descriptions_from_items ile uyumlu. */
function compileDescriptionsFromItems(items: unknown): string {
  if (!Array.isArray(items)) return ""
  const descs: string[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const noteRaw = row.description ?? row.notes ?? row.note
    if (noteRaw == null || String(noteRaw).trim() === "") continue
    const note = String(noteRaw).trim()
    const label = itemDisplayName(row)
    descs.push(label ? `${label} : ${note}` : note)
  }
  return descs.join(", ")
}

/** Backend _compile_descriptions_from_context ile uyumlu. */
function compileDescriptionsFromContext(context: Record<string, unknown>): string {
  const parts: string[] = []
  const orderNote = String(context.notes ?? context.order_notes ?? "").trim()
  if (orderNote) parts.push(orderNote)
  const itemPart = compileDescriptionsFromItems(context.items)
  if (itemPart) parts.push(itemPart)
  return parts.join(", ")
}

/** Backend ReceiptRenderer._prepare_context ile uyumlu: bölünmüş ödemede payment_type özeti. */
function prepareReceiptContext(
  context: Record<string, unknown>,
  layout?: ReceiptBlock[]
): Record<string, unknown> {
  const ctx = { ...context }

  ctx.descriptions = compileDescriptionsFromContext(ctx)

  const pm = ctx.payment_method
  const pt = ctx.payment_type
  if (pm != null && pm !== "" && (pt == null || pt === "")) ctx.payment_type = pm
  if (pt != null && pt !== "" && (pm == null || pm === "")) ctx.payment_method = pt

  const payments = ctx.payments
  if (Array.isArray(payments) && payments.length > 0) {
    const summ = paymentTypeFromPayments(payments)
    if (summ) {
      if (payments.length > 1) {
        ctx.payment_type = summ
        ctx.payment_method = summ
      } else {
        const pm2 = ctx.payment_method
        const pt2 = ctx.payment_type
        if ((pm2 == null || pm2 === "") && (pt2 == null || pt2 === "")) {
          ctx.payment_type = summ
          ctx.payment_method = summ
        }
      }
    }
  }

  if (layout && layoutUsesWithTaxRates(layout)) {
    ctx._receipt_uses_with_tax_rates = true
    const items = ctx.items
    if (Array.isArray(items)) {
      const rows = items.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      ensureItemTaxFields(rows)
      const grossTotal = sumItemsGross(rows)
      const netTotal = sumItemsNet(rows)
      const taxTotal = Math.round(sumItemsTax(rows) * 100) / 100
      ctx._receipt_items_tax_total = taxTotal
      ctx.subtotal = grossTotal
      const taxVal = ctx.tax
      if (taxVal == null || taxVal === "" || taxVal === 0 || taxVal === "0") {
        ctx.tax = taxTotal
      }
      const discount = parseItemDecimal(ctx as Record<string, unknown>, "discount", 0)
      ctx.total = Math.round((netTotal - discount) * 100) / 100
    }
  }

  return ctx
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function normalizeMargins(
  paperWidth: number,
  marginLeft: number | undefined,
  marginRight: number | undefined
): [number, number] {
  let ml = Math.max(0, Math.floor(Number(marginLeft) || 0))
  let mr = Math.max(0, Math.floor(Number(marginRight) || 0))
  if (ml + mr >= paperWidth) {
    ml = Math.min(ml, paperWidth - 1)
    mr = Math.max(0, paperWidth - ml - 1)
  }
  return [ml, mr]
}

function sizeMultiplier(size: ReceiptBlock["size"]): number {
  if (size === "double") return 2
  if (size === "triple") return 3
  if (size === "quadruple") return 4
  return 1
}

function effectiveInnerWidth(
  block: Pick<ReceiptBlock, "size">,
  paperWidth: number,
  marginLeft: number,
  marginRight: number
): number {
  const mult = sizeMultiplier(block.size)
  const effWidth = Math.floor(paperWidth / mult)
  const effMl = Math.floor(marginLeft / mult)
  const effMr = Math.floor(marginRight / mult)
  return Math.max(1, effWidth - effMl - effMr)
}

function wrapParagraph(text: string, inner: number): string[] {
  if (!text) return [""]
  const lines: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= inner) {
      lines.push(remaining)
      break
    }
    const chunk = remaining.slice(0, inner)
    const breakAt = chunk.lastIndexOf(" ")
    if (breakAt <= 0 || breakAt < Math.floor(inner / 3)) {
      lines.push(chunk)
      remaining = remaining.slice(inner)
    } else {
      lines.push(remaining.slice(0, breakAt))
      remaining = remaining.slice(breakAt).trimStart()
    }
  }
  return lines
}

function layoutTextLine(
  content: string,
  block: Pick<ReceiptBlock, "align" | "size">,
  paperWidth: number,
  marginLeft: number,
  marginRight: number
): string {
  let str = content
  if (block.size === "double") str = str.toUpperCase()
  const inner = effectiveInnerWidth(block, paperWidth, marginLeft, marginRight)
  const truncated = str.length > inner ? str.slice(0, inner) : str
  let mid: string
  if (block.align === "center") {
    if (truncated.length >= inner) mid = truncated.slice(0, inner)
    else {
      const totalPad = inner - truncated.length
      const leftPad = Math.floor(totalPad / 2)
      const rightPad = totalPad - leftPad
      mid = " ".repeat(leftPad) + truncated + " ".repeat(rightPad)
    }
  } else if (block.align === "right") {
    mid = truncated.padStart(inner)
  } else {
    mid = truncated.padEnd(inner)
  }
  return " ".repeat(marginLeft) + mid + " ".repeat(marginRight)
}

function formatTextBlock(content: string, block: ReceiptBlock, paperWidth: number): string {
  const [ml, mr] = normalizeMargins(paperWidth, block.margin_left, block.margin_right)
  return layoutTextLine(content, block, paperWidth, ml, mr)
}

// ── Variable resolver ─────────────────────────────────────────────────────────

function resolveVar(content: string, ctx: Record<string, unknown>): string {
  return content.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, expr: string) => {
    const parts = expr.split("|").map((s: string) => s.trim())
    const key = parts[0]
    const filters = parts.slice(1)

    // Nested keys: "order.total" → ctx["order"]["total"]
    let value: unknown = ctx
    for (const k of key.split(".")) {
      value = (value as Record<string, unknown>)?.[k] ?? ""
    }

    // Automatic variables: date, time (if not in ctx)
    if (key === "date" && !ctx.date) {
      const d = new Date()
      value = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
    } else if (key === "time" && !ctx.time) {
      const d = new Date()
      value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }

    // Special case for tax + rate: use total as base
    if (key === "tax" && filters.some(f => f.startsWith("rate"))) {
      value = ctx.total ?? value
    }

    if (key === "tax" && !filters.some((f) => f.startsWith("rate"))) {
      if (typeof ctx === "object" && ctx !== null && ctx._receipt_uses_with_tax_rates) {
        value = ctx._receipt_items_tax_total ?? ctx.tax ?? value
      }
    }

    for (const f of filters) {
      if (f.startsWith("rate")) {
        const rateParts = f.split(/\s+/)
        const rateVal = parseFloat(rateParts[1]) || 0
        if (key === "tax") {
          value = (parseFloat(String(value)) || 0) * (rateVal / (100 + rateVal))
        } else {
          value = (parseFloat(String(value)) || 0) * (rateVal / 100)
        }
      } else if (f === "currency") value = formatCurrency(value)
      else if (f === "date_tr") value = formatDate(value)
      else if (f === "qty") value = formatQty(value)
      else if (f === "with_options") {
        const name =
          typeof ctx === "object" && ctx !== null && "name" in ctx
            ? itemDisplayName(ctx as Record<string, unknown>)
            : String(value ?? "")
        const modText =
          typeof ctx === "object" && ctx !== null
            ? itemModifierText(ctx as Record<string, unknown>)
            : ""
        value = modText ? `${name}\n* ${modText}` : name
      } else if (f === "with_tax_rates" || f === "with_tax_rate") {
        value =
          typeof ctx === "object" && ctx !== null && "name" in ctx
            ? itemDisplayName(ctx as Record<string, unknown>)
            : String(value ?? "")
      }
    }

    return String(value ?? "")
  })
}

function shouldSkipBlock(block: ReceiptBlock, ctx: Record<string, unknown>): boolean {
  if (!block.hide_if_empty) return false

  const combined = `${block.content ?? ""} ${block.left ?? ""} ${block.right ?? ""} ${block.data ?? ""}`
  const matches = Array.from(combined.matchAll(/\{\{\s*(.+?)\s*\}\}/g))
  
  if (matches.length === 0) return false

  for (const match of matches) {
    const expr = match[1].trim()
    const key = expr.split("|")[0].trim()
    
    let value: unknown = ctx
    for (const k of key.split(".")) {
      if (value !== null && typeof value === "object" && k in value) {
        value = (value as Record<string, unknown>)[k]
      } else {
        value = undefined
        break
      }
    }

    // Check if value is "something"
    if (value !== undefined && value !== null && value !== "" && value !== 0 && value !== "0" && value !== 0.0) {
      return false
    }
  }
  
  return true
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderReceiptToText(
  layout: ReceiptBlock[],
  context: Record<string, unknown>,
  paperWidth: number
): string {
  const ctx = prepareReceiptContext(context, layout)
  const lines: string[] = []

  for (const block of layout) {
    if (shouldSkipBlock(block, ctx)) continue

    switch (block.type) {
      case "text": {
        const content = resolveVar(block.content ?? "", ctx)
        const mlmr = normalizeMargins(paperWidth, block.margin_left, block.margin_right)
        const inner = effectiveInnerWidth(block, paperWidth, mlmr[0], mlmr[1])
        const paragraphs = content.split("\n")
        for (const p of paragraphs) {
          for (const wrapped of wrapParagraph(p, inner)) {
            lines.push(layoutTextLine(wrapped, block, paperWidth, mlmr[0], mlmr[1]))
          }
        }
        break
      }

      case "divider":
        lines.push((block.char ?? "-").repeat(paperWidth))
        break

      case "key_value": {
        const left = resolveVar(block.left ?? "", ctx)
        const right = resolveVar(block.right ?? "", ctx)
        const rightLines = right.split("\n")
        if (rightLines.length === 0) rightLines.push("")

        const gap = Math.max(1, paperWidth - left.length - rightLines[0].length)
        lines.push(left + " ".repeat(gap) + rightLines[0])

        for (let i = 1; i < rightLines.length; i++) {
          lines.push(rightLines[i].padStart(paperWidth))
        }
        break
      }

      case "item_loop": {
        const items = (ctx[block.variable ?? "items"] ?? []) as Record<string, unknown>[]
        const columns = block.columns ?? [
          { field: "name",  width: paperWidth - 18, align: "left" },
          { field: "qty",   width: 5,  align: "right" },
          { field: "price", width: 12, align: "right", format: "currency" },
        ]
        const usesTaxRatesMode = itemLoopUsesWithTaxRates(block)
        for (const item of items) {
          if (usesTaxRatesMode) ensureItemTaxFields([item])
          const productOnlyGross =
            usesTaxRatesMode && itemPaidModifierTotal(item) > 0
          let row = ""
          let appendOptionsLine = false
          let appendTaxLine = false
          for (const col of columns) {
            const usesWithOptions = columnUsesWithOptions(col)
            const usesWithTaxRates = columnUsesWithTaxRates(col)
            let value: unknown
            let amountOverride: number | null = null
            const field = String(col.field ?? "")
            if (usesWithOptions || usesWithTaxRates) {
              value = itemDisplayName(item)
              if (usesWithOptions) appendOptionsLine = true
              if (usesWithTaxRates) appendTaxLine = true
            } else if (field.includes("{{")) {
              value = resolveVar(field, item)
            } else {
              amountOverride = itemCurrencyColumnValue(
                item,
                field,
                usesTaxRatesMode,
                productOnlyGross
              )
              value = amountOverride ?? item?.[col.field] ?? ""
            }
            if (col.format === "currency") {
              if (amountOverride == null) {
                amountOverride = itemCurrencyColumnValue(
                  item,
                  field,
                  usesTaxRatesMode,
                  productOnlyGross
                )
              }
              value = formatCurrency(amountOverride ?? value)
            } else if (col.format === "qty") value = formatQty(value)
            else if (!usesWithOptions) value = String(value)

            // Prefix & Suffix
            value = (col.prefix ?? "") + String(value) + (col.suffix ?? "")

            const w = col.width ?? 10
            const str = String(value)
            if (col.align === "right") row += str.padStart(w)
            else if (col.align === "center") row += str.padStart(Math.floor((w + str.length) / 2)).padEnd(w)
            else row += str.padEnd(w)
          }
          lines.push(row.trimEnd())
          if (appendOptionsLine) {
            const modText = itemModifierText(item)
            if (modText) lines.push(`* ${modText}`)
          }
          if (appendTaxLine) {
            const rate = itemTaxRate(item)
            const taxAmt = itemLineTax(item)
            if (rate > 0 && taxAmt > 0) {
              lines.push(formatItemTaxLine(rate, taxAmt, paperWidth))
            }
          }
        }
        break
      }

      case "feed":
        for (let i = 0; i < (block.lines ?? 1); i++) lines.push("")
        break

      case "cut":
        lines.push("-".repeat(paperWidth))
        lines.push("")
        break

      case "qr":
        lines.push(`[QR: ${resolveVar(block.data ?? "", ctx)}]`)
        break

      case "date": {
        const content = String(ctx.date ?? formatDate(new Date()))
        lines.push(formatTextBlock(content, block, paperWidth))
        break
      }

      case "time": {
        const content = String(ctx.time ?? formatTime(new Date()))
        lines.push(formatTextBlock(content, block, paperWidth))
        break
      }

      case "branch_logo": {
        const logoUrl = ctx.branch_logo_url as string | undefined
        const branchLabel = ctx.branch_name as string | undefined
        if (logoUrl) {
          lines.push(branchLabel ? `[${branchLabel} Logosu]` : `[Şube Logosu]`)
        } else {
          const width = block.width_px ?? 384
          lines.push(`[Şube Logosu — ${width}px]`)
        }
        break
      }

      case "branch_info": {
        const fields = (block.fields ?? ["name", "phone", "email", "website", "address", "tax_office", "tax_number", "registry_no", "mersis_no"]) as string[]
        const FIELD_LABELS: Record<string, string> = {
          name: "Şube", phone: "Tel", email: "E-posta", website: "Web",
          address: "Adres", tax_office: "Vergi Dairesi", tax_number: "Vergi No",
          registry_no: "Sicil No", mersis_no: "Mersis No",
        }
        const VALUE_ONLY = new Set(["name", "phone", "address"])
        const WRAP_FIELDS = new Set(["address"])
        const data: Record<string, string> = {
          name: String(ctx.branch_name ?? ""),
          phone: String(ctx.branch_phone ?? ""),
          email: String(ctx.branch_email ?? ""),
          website: String(ctx.branch_website ?? ""),
          address: String(ctx.branch_address ?? ""),
          tax_office: String(ctx.branch_tax_office ?? ""),
          tax_number: String(ctx.branch_tax_number ?? ""),
          registry_no: String(ctx.branch_registry_no ?? ""),
          mersis_no: String(ctx.branch_mersis_no ?? ""),
        }
        for (const f of fields) {
          const value = (data[f] ?? "").trim()
          if (block.hide_if_empty && !value) continue
          if (!value) continue
          const text = VALUE_ONLY.has(f) ? value : `${FIELD_LABELS[f] ?? f}: ${value}`
          if (WRAP_FIELDS.has(f)) {
            const inner = effectiveInnerWidth(block, paperWidth, 0, 0)
            for (const wrapped of wrapParagraph(text, inner)) {
              lines.push(layoutTextLine(wrapped, block, paperWidth, 0, 0))
            }
          } else {
            lines.push(formatTextBlock(text, block, paperWidth))
          }
        }
        break
      }
    }
  }

  return lines.join("\n")
}
