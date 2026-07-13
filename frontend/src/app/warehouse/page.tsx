"use client"

import React, { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { AppShell } from "@/components/shell/AppShell"
import { BranchSelect } from "@/features/branches/components/BranchSelect"

import { useWarehouseSummary, useDeficiencyReports } from "@/features/warehouse/hooks/useWarehouse"
import { useWarehouseNotifications } from "@/features/warehouse/hooks/useWarehouseNotifications"
import { WarehouseStats } from "@/features/warehouse/components/WarehouseStats"
import { ExpiryRiskWidget } from "@/features/warehouse/components/ExpiryRiskWidget"
import { WarehousesTab } from "@/features/warehouse/components/WarehousesTab"
import { PurchaseRecommendationsTab } from "@/features/warehouse/components/PurchaseRecommendationsTab"
import { PriceIncreasesTab } from "@/features/warehouse/components/PriceIncreasesTab"
import { PurchaseOrdersTab } from "@/features/warehouse/components/PurchaseOrdersTab"
import { GoodsReceivingTab } from "@/features/warehouse/components/GoodsReceivingTab"
import { TransfersTab } from "@/features/warehouse/components/TransfersTab"
import { StockCountingTab } from "@/features/warehouse/components/StockCountingTab"
import { DeficiencyReportsTab } from "@/features/warehouse/components/DeficiencyReportsTab"
import { KitchenClosingTab } from "@/features/warehouse/components/KitchenClosingTab"
import { ExpiringLotsTab } from "@/features/warehouse/components/ExpiringLotsTab"
import { WasteReportsTab } from "@/features/warehouse/components/WasteReportsTab"
import { ReturnCancelReportsTab } from "@/features/warehouse/components/ReturnCancelReportsTab"
import { WarehouseNotificationDrawer } from "@/features/warehouse/components/WarehouseNotificationDrawer"
import {
  WarehouseModuleNavHorizontal,
  WarehouseModuleNavVertical,
  type WarehouseExtendedTab,
} from "@/features/warehouse/components/WarehouseModuleNav"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { useTranslations } from "next-intl"

function WarehousePageContent() {
  const tw = useTranslations("warehouse")
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab") as WarehouseExtendedTab | null

  const [activeTab, setActiveTab] = useState<WarehouseExtendedTab>("summary")
  const [poOverdueFilter, setPoOverdueFilter] = useState(false)

  // URL'den gelen sekme parametresini dinle
  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam)
    }
    const filterParam = searchParams.get("filter")
    setPoOverdueFilter(filterParam === "overdue")
  }, [tabParam, searchParams])

  const [branchId, setBranchId] = useState<string>("ALL")
  const scopedBranchId = branchId !== "ALL" ? branchId : undefined
  useWarehouseNotifications(scopedBranchId)
  const { data: summary, isLoading: summaryLoading } = useWarehouseSummary(
    scopedBranchId
  )
  const { data: pendingDeficiencies = [] } = useDeficiencyReports({ status: "PENDING", branch_id: scopedBranchId })
  const pendingCount = pendingDeficiencies.length

  const navProps = {
    activeTab,
    onSelect: setActiveTab,
    pendingCount,
  }

  const renderTab = () => {
    switch (activeTab) {
      case "summary":
        return (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
            <WarehouseStats
              summary={summary}
              isLoading={summaryLoading}
              onOverdueClick={() => {
                setPoOverdueFilter(true)
                setActiveTab("purchase_orders")
              }}
            />
            <ExpiryRiskWidget />
          </div>
        )
      case "warehouses": return <WarehousesTab branchId={scopedBranchId} />
      case "purchase_recommendations":
        return (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PurchaseRecommendationsTab branchId={scopedBranchId} />
          </div>
        )
      case "price_increases":
        return (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PriceIncreasesTab branchId={scopedBranchId} />
          </div>
        )
      case "purchase_orders":
        return (
          <PurchaseOrdersTab
            branchId={scopedBranchId}
            initialOverdueFilter={poOverdueFilter}
            onClearOverdueFilter={() => setPoOverdueFilter(false)}
          />
        )
      case "goods_receiving":
        return (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <GoodsReceivingTab branchId={scopedBranchId} />
          </div>
        )
      case "transfers":
        return (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <TransfersTab branchId={scopedBranchId} />
          </div>
        )
      case "stock_counting": return <StockCountingTab branchId={scopedBranchId} />
      case "deficiency_reports":
        return (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DeficiencyReportsTab branchId={scopedBranchId} />
          </div>
        )
      case "kitchen_closing": return <KitchenClosingTab branchId={scopedBranchId} />
      case "expiring_lots":
        return (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ExpiringLotsTab branchId={scopedBranchId} />
          </div>
        )
      case "waste_reports":
        return (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WasteReportsTab branchId={scopedBranchId} />
          </div>
        )
      case "return_cancel_reports":
        return (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ReturnCancelReportsTab branchId={scopedBranchId} />
          </div>
        )
      default: return null
    }
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col bg-background overflow-hidden">
        {/* Üst: &lt; lg yatay sekmeler + şube; lg+ yalnızca şube (dikey nav solda) */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2 border-border bg-card sm:px-4">
          <div className="min-w-0 flex-1 lg:hidden">
            <WarehouseModuleNavHorizontal {...navProps} />
          </div>
          <div className="ms-auto flex shrink-0 items-center gap-3 sm:gap-4">
            <div className="hidden sm:block text-2xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">
              {tw("filterLabel")}
            </div>
            <BranchSelect
              value={branchId}
              onChange={setBranchId}
              includeAll={true}
              className="w-48 h-9"
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <WarehouseModuleNavVertical {...navProps} />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
            <div className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border shadow-sm border-border bg-card/50",
              activeTab === "summary" && "border-none bg-transparent shadow-none dark:bg-transparent"
            )}>
              {activeTab !== "summary" && (
                <div
                  className={cn(
                    "min-h-0 flex-1 p-4",
                    activeTab === "purchase_recommendations"
                      || activeTab === "price_increases"
                      || activeTab === "waste_reports"
                      || activeTab === "goods_receiving"
                      || activeTab === "transfers"
                      || activeTab === "deficiency_reports"
                      ? "flex flex-col overflow-hidden"
                      : "overflow-auto",
                  )}
                >
                  {renderTab()}
                </div>
              )}
              {activeTab === "summary" && renderTab()}
            </div>
          </div>
        </div>
        <WarehouseNotificationDrawer />
      </div>
    </AppShell>
  )
}

export default function WarehousePage() {
  return (
    <AuthGuard module="warehouse" mode="manage">
      <WarehousePageContent />
    </AuthGuard>
  )
}
