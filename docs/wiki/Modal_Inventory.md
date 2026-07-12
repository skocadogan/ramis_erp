# Modal Envanteri

> Oluşturulma: 2026-06-29  
> Amaç: Frontend'deki tüm modal/dialog bileşenlerinin mevcut durumunu ve migrate planını belgeler.  
> Kapsam: AlertDialog bileşenleri bu envantere dahil değildir (dokunulmayacak).

---

## Efsane

| Sembol | Anlam |
|--------|-------|
| ✅ | Tamamlandı / Standart Dialog kullanıyor |
| 🔄 | Migrasyon bekliyor |
| ⚠️ | Bug var |
| 🔵 | Geniş/özel boyut |

---

## Pattern Özeti

| Pattern | Sayı | Durum |
|---------|------|-------|
| `Dialog` (Base UI) — standart | ~35 | Güncellendi (dialog.tsx redesign ile) |
| `WarehouseModalScaffold` | 24 | 🔄 Migrate edilecek (Öncelik 6) |
| Elle `fixed inset-0` div | ~28 | 🔄 Migrate edilecek (Öncelik 1–5) |
| `ModalControls.Modal` | 3 | ⚠️ Bug — Öncelik 1 |
| `ModalOverlay` | 3 | 🔄 Migrate edilecek (Öncelik 7) |

---

## A — Zaten Dialog Kullananlar (Güncelleme Gerekli)

### Credit Modülleri

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/credit/components/CreditPaymentModal.tsx` | `CreditPaymentModal` | `sm:max-w-md` | ✅ DialogHeader+Footer var |
| `features/credit/components/CreditAccountFormModal.tsx` | `CreditAccountFormModal` | `sm:max-w-lg max-h-[90vh]` | ✅ |
| `features/credit/components/CreditAccountDetailModal.tsx` | `CreditAccountDetailModal` | `sm:max-w-2xl max-h-[90vh]` | İç içe 2 Dialog var |

### Production Planning Modülleri

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/production-planning/components/CopyPlanModal.tsx` | `CopyPlanModal` | `max-w-md` | |
| `features/production-planning/components/ForecastModal.tsx` | `ForecastModal` | `max-w-2xl max-h-[90vh] flex flex-col` | |
| `features/production-planning/components/SingleAvailabilityModal.tsx` | `SingleAvailabilityModal` | `max-w-md` | |
| `features/production-planning/components/PlanFormModal.tsx` | `PlanFormModal` | `sm:max-w-[1100px] max-h-[90vh] flex flex-col p-0` | Elle footer |
| `features/production-planning/components/AvailabilityFormModal.tsx` | `AvailabilityFormModal` | `sm:max-w-[1100px] max-h-[90vh]` | |
| `features/production-planning/components/MrpDetailModal.tsx` | `MrpDetailModal` | `sm:max-w-[1100px] max-h-[90vh] overflow-hidden` | |
| `features/production-planning/components/ApproximateCostModal.tsx` | `ApproximateCostModal` | `sm:max-w-[1100px] max-h-[90vh]` | |
| `features/production-planning/components/ProductionStatusModal.tsx` | `ProductionStatusModal` | `sm:max-w-[850px] h-[90vh]` | `showCloseButton={false}`, elle h3 başlık |
| `features/production-planning/components/CreatePrepTasksModal.tsx` | `CreatePrepTasksModal` | `sm:max-w-3xl max-h-[90vh]` | |

### Admin Modülleri (zaten Dialog)

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/admin/components/modals/DeleteConfirmModal.tsx` | `DeleteConfirmModal` | `sm:max-w-[440px] p-0` | |
| `features/admin/components/modals/CancellationReasonModal.tsx` | `CancellationReasonModal` | `sm:max-w-[425px]` | |
| `features/admin/components/tabs/reporting/ReceiptDesignerGuide.tsx` | `ReceiptDesignerGuide` | `md:max-w-5xl w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0` | `showCloseButton={false}`, kendine özgü X butonu |

### User Modülleri

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/users/components/UserFormModal.tsx` | `UserFormModal` | `sm:max-w-5xl max-h-[90vh]` | |
| `features/users/components/UserDetailModal.tsx` | `UserDetailModal` | `sm:max-w-7xl max-h-[90vh]` | |

### Inventory Modülleri (zaten Dialog)

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/inventory/components/SupplierDetailModal.tsx` | `SupplierDetailModal` | `w-[min(96vw,1280px)] sm:max-w-7xl max-h-[90vh]` | `showCloseButton` explicit, özel backdrop |
| `features/inventory/components/StockItemStockDetailModal.tsx` | `StockItemStockDetailModal` | büyük | `showCloseButton` explicit |
| `features/inventory/components/CostHistoryModal.tsx` | `CostHistoryModal` | orta | `showCloseButton` explicit |
| `features/inventory/components/FEFOLotDetailsModal.tsx` | `FEFOLotDetailsModal` | `w-[min(96vw,1152px)] sm:max-w-6xl max-h-[90vh]` | |

### Warehouse Modülleri (zaten Dialog)

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/warehouse/components/StockCountingDetailModal.tsx` | `StockCountingDetailModal` | `w-[min(100vw-1rem,52rem)] max-h-[95vh]` | `showCloseButton={false}` |
| `features/warehouse/components/ExpiryActionDialog.tsx` | `ExpiryActionDialog` | `sm:max-w-lg` | |
| `features/warehouse/components/inventory-modal/WarehouseInventoryModalDialogs.tsx` | `WarehouseInventoryModalDialogs` | `sm:max-w-md z-[151]` | `showCloseButton` explicit, yüksek z-index |

### POS Modülleri (zaten Dialog)

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/pos/components/ConnectedUsersModal.tsx` | `ConnectedUsersModal` | `max-w-md sm:max-w-lg p-0` | |
| `features/pos/components/PosSettingsDialog.tsx` | `PosSettingsDialog` | `sm:max-w-[700px] p-0` | |
| `features/pos/components/PosTerminalSwitchDialog.tsx` | `PosTerminalSwitchDialog` | `sm:max-w-md` | İç AlertDialog var |
| `features/pos/offline/SyncProgressDialog.tsx` | `SyncProgressDialog` | `max-w-md` | `showCloseButton={false}`, kapatılamaz (tasarım gereği) |
| `features/pos/offline/ReconciliationDialog.tsx` | `ReconciliationDialog` | `max-h-[85vh] sm:max-w-xl` | |

### Diğer (zaten Dialog)

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/kds/components/KdsRecipeDetailModal.tsx` | `KdsRecipeDetailModal` | `sm:max-w-[90vw] md:max-w-[1200px] h-[90vh]` | 🔵 |
| `features/prep/components/TemplateFormModal.tsx` | `TemplateFormModal` | `sm:max-w-[450px]` | |
| `features/prep/components/SmartRuleFormModal.tsx` | `SmartRuleFormModal` | `sm:max-w-[450px]` | |
| `features/search/components/GlobalSearchDialog.tsx` | `GlobalSearchDialog` | `max-w-lg` | `showCloseButton={false}`, özel arama layout |
| `features/shifts/components/CashReportDialog.tsx` | `CashReportDialog` | `h-[95vh] sm:max-w-7xl` | 🔵 |
| `features/shifts/components/ZReportDialog.tsx` | `ZReportDialog` | `max-h-[95vh] sm:max-w-7xl` | 🔵 |
| `features/sales/components/SalesModals.tsx` | `EditSaleModal` | `sm:max-w-md` | |
| `features/tables/components/TableOrderModal/SaleReceiptPrintDialog.tsx` | `SaleReceiptPrintDialog` | `sm:max-w-md` | |

---

## B — Öncelik 1: `ModalControls.Modal` (Bug — ESC/Backdrop Çalışmıyor)

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/admin/components/modals/BranchFormModal.tsx` | `BranchFormModal` | `max-w-4xl` | ⚠️ `void onClose` bug |
| `features/admin/components/tabs/KitchenStationsTab.tsx` | satır içi | `max-w-lg` | ⚠️ satır içi form modal |
| `features/admin/components/tabs/PrintersTab.tsx` | satır içi | `max-w-xl` | ⚠️ satır içi form modal |

**Hedef:** `Dialog + DialogContent + DialogHeader + DialogCloseButton + DialogFooter`

---

## C — Öncelik 2: Admin Modalleri (Elle `fixed inset-0`)

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/admin/components/modals/BranchEditModal.tsx` | `BranchEditModal` | `max-w-6xl max-h-[95vh]` | `useDirtyFormWarning` var → `disablePointerDismissal` |
| `features/admin/components/modals/BranchDetailModal.tsx` | `BranchDetailModal` | `max-w-2xl max-h-[90vh]` | İç AlertDialog var |
| `features/admin/components/modals/RoleModal.tsx` | `RoleModal` | `max-w-4xl` | Karmaşık izin listesi |
| `features/branches/components/BranchUserModal.tsx` | `BranchUserModal` | `max-w-lg max-h-[90vh]` | |
| `features/users/components/ProfileModal.tsx` | `ProfileModal` | `max-w-lg max-h-[90vh]` | |
| `features/users/components/ChangePasswordModal.tsx` | `ChangePasswordModal` | `max-w-md` | |

---

## D — Öncelik 3: Menü / Tarif Modalleri (Elle `fixed inset-0`)

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/menu/components/BulkPriceModal.tsx` | `BulkPriceModal` | `max-w-3xl h-[80vh]` | Çok elemanlı header |
| `features/menu/components/RecommendedProductsModal.tsx` | `RecommendedProductsModal` | `max-w-3xl h-[80vh]` | `layout="scroll"`; [[Menu_Product_Recommendations]] |
| `features/menu/components/ProductFormModal.tsx` | `ProductFormModal` | `max-w-[90rem] max-h-[92vh]` | 🔵 Çok karmaşık form |
| `features/menu/components/CategoryFormModal.tsx` | `CategoryFormModal` | `max-w-lg` | |
| `features/menu/components/DiscountModal.tsx` | `DiscountModal` | `max-w-3xl h-[80vh]` | |
| `features/menu/components/ModifierGroupFormModal.tsx` | `ModifierGroupFormModal` | `max-w-md` | |
| `features/recipes/components/RecipeFormModal.tsx` | `RecipeFormModal` | `max-w-7xl max-h-[95vh]` | 🔵 |
| `features/recipes/components/RecipeCategoryFormModal.tsx` | `RecipeCategoryFormModal` | orta | |
| `features/recipes/components/RecipeCategoryManagementModal.tsx` | `RecipeCategoryManagementModal` | `max-w-xl max-h-[85vh]` | |

---

## E — Öncelik 4: Tables / Rezervasyon Modalleri (Elle `fixed inset-0`)

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/tables/components/TableFormModal.tsx` | `TableFormModal` | `max-w-lg max-h-[90vh]` | |
| `features/tables/components/TableReserveModal.tsx` | `TableReserveModal` | `z-[120]` | Yüksek z-index gerekli |
| `features/tables/components/TableQRCodeModal.tsx` | `TableQRCodeModal` | `max-w-sm` | |
| `features/tables/components/ZoneFormModal.tsx` | `ZoneFormModal` | `max-w-md z-[110]` | Yüksek z-index |
| `features/tables/components/ZoneManageModal.tsx` | `ZoneManageModal` | `max-w-lg max-h-[85vh]` | İç silme onayı var |
| `features/reservations/components/ReservationEditModal.tsx` | `ReservationEditModal` | `max-w-md` | |

---

## F — Öncelik 5: Müşteri Modalleri

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/customers/components/CustomerModal.tsx` | `CustomerModal` | `max-w-xl max-h-[85vh]` | Elle div |
| `features/customers/components/CustomerSelectModal.tsx` | `CustomerSelectModal` | `max-w-lg max-h-[80vh]` | Elle div |
| `features/customers/components/CustomerDetailModal.tsx` | `CustomerDetailModal` | `max-w-5xl h-[85vh]` | Hibrit (ana elle, iç Dialog) |

---

## G — Öncelik 6: `WarehouseModalScaffold` (24 Dosya)

| Dosya | Bileşen | `panelClassName` |
|-------|---------|-----------------|
| `features/inventory/components/UnitFormModal.tsx` | `UnitFormModal` | `w-[min(96vw,32rem)] max-h-[90vh]` |
| `features/inventory/components/CategoryFormModal.tsx` | `CategoryFormModal` | `w-[min(96vw,32rem)] max-h-[90vh]` |
| `features/inventory/components/ItemFormModal.tsx` | `ItemFormModal` | `max-w-4xl max-h-[90vh]` |
| `features/inventory/components/MovementFormModal.tsx` | `MovementFormModal` | `w-[min(96vw,56rem)] max-h-[90vh]` |
| `features/inventory/components/SupplierFormModal.tsx` | `SupplierFormModal` | `w-[min(96vw,72rem)] max-h-[90vh] flex flex-col` |
| `features/inventory/components/BulkMinimumImportModal.tsx` | `BulkMinimumImportModal` | `max-w-2xl max-h-[85vh]` |
| `features/inventory/components/SupplierPerformanceModal.tsx` | `SupplierPerformanceModal` | `max-w-xl max-h-[85vh]` |
| `features/inventory/components/bulk-stock-entry/BulkStockEntryModal.tsx` | `BulkStockEntryModal` | `h-[min(92vh,100dvh)] w-[min(98vw,1520px)]` |
| `features/allergens/components/AllergenFormModal.tsx` | `AllergenFormModal` | `w-[min(96vw,32rem)] max-h-[90vh]` |
| `features/allergens/components/AllergenReferenceModal.tsx` | `AllergenReferenceModal` | `w-[min(96vw,48rem)] max-h-[85vh]` |
| `features/warehouse/components/StockCountingFormModal.tsx` | `StockCountingFormModal` | `max-w-md` |
| `features/warehouse/components/WarehouseFormModal.tsx` | `WarehouseFormModal` | `max-w-lg max-h-[90vh]` |
| `features/warehouse/components/PurchaseOrderFormModal.tsx` | `PurchaseOrderFormModal` | `max-w-3xl max-h-[90vh]` |
| `features/warehouse/components/GoodsReceivingFormModal.tsx` | `GoodsReceivingFormModal` | `w-[min(97vw,86rem)] max-h-[90vh]` |
| `features/warehouse/components/TransferFormModal.tsx` | `TransferFormModal` | `max-w-screen-2xl max-h-[95vh]` |
| `features/warehouse/components/ReturnCancelFormModal.tsx` | `ReturnCancelFormModal` | `max-w-lg` |
| `features/warehouse/components/ReturnCancelDetailModal.tsx` | `ReturnCancelDetailModal` | `w-[min(96vw,42rem)] max-h-[90vh]` |
| `features/warehouse/components/DeficiencyReportFormModal.tsx` | `DeficiencyReportFormModal` | `max-w-2xl max-h-[90vh]` |
| `features/warehouse/components/DeficiencyReportDetailModal.tsx` | `DeficiencyReportDetailModal` | `max-w-3xl max-h-[85vh]` |
| `features/warehouse/components/DeficiencyActionConfirmModal.tsx` | `DeficiencyActionConfirmModal` | `max-w-lg max-h-[85vh]` |
| `features/warehouse/components/inventory-modal/WarehouseInventoryModal.tsx` | `WarehouseInventoryModal` | `max-w-4xl max-h-[90vh]` |
| `features/warehouse/components/WarehouseStockLevelsModal.tsx` | `WarehouseStockLevelsModal` | `max-w-3xl max-h-[85vh]` |
| `features/kds/components/KdsWasteModal.tsx` | `KdsWasteModal` | `max-w-lg` |
| `features/kds/components/KdsOrderNotesModal.tsx` | `KdsOrderNotesModal` | `max-w-md` |

---

## H — Öncelik 7: `ModalOverlay`

| Dosya | Bileşen | Boyut | Notlar |
|-------|---------|-------|--------|
| `features/invoices/components/CreateInvoiceModal.tsx` | `CreateInvoiceModal` | `max-w-md` | |
| `features/tables/components/TableOrderModal/index.tsx` | `TableOrderModal` | `max-w-4xl lg:max-w-6xl max-h-[min(94dvh,900px)]` | Çok büyük; iç dialog'lar var |
| `features/tables/components/TakeawayOrderModal/index.tsx` | `TakeawayOrderModal` | benzer | Çok büyük; iç dialog'lar var |

---

## Kaldırılacak Dosyalar (Tüm Migrasyon Sonrası)

- `frontend/src/components/ui/modal-overlay/warehouse-modal-scaffold.tsx`
- `frontend/src/components/ui/modal-overlay/index.tsx`
- `frontend/src/features/admin/components/ui/ModalControls.tsx` içindeki `Modal` bileşeni

---

## Yeni Standart Kullanım Kalıpları

### Basit modal
```tsx
<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
  <DialogContent className="sm:max-w-lg">
    <DialogHeader>
      <DialogTitle>Başlık</DialogTitle>
      <DialogCloseButton />
    </DialogHeader>
    <div className="px-6 py-4">
      {/* içerik */}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={onClose}>İptal</Button>
      <Button onClick={onSubmit}>Kaydet</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Form modal (backdrop click engelli)
```tsx
<Dialog open disablePointerDismissal onOpenChange={(open, ev) => {
  if (!open && ev.reason !== 'focus-out') onClose()
}}>
  ...
</Dialog>
```

### Çok elemanlı / araçlı header
```tsx
<DialogHeader>
  <div className="flex-1 flex items-center gap-3">
    <DialogTitle>Başlık</DialogTitle>
    <ExtraToolbar />
  </div>
  <DialogCloseButton />
</DialogHeader>
```

### İki satırlı header (filtre/arama ikinci satırda)
```tsx
<DialogHeader className="flex-col gap-3 items-stretch">
  <div className="flex items-center justify-between">
    <DialogTitle>Başlık</DialogTitle>
    <DialogCloseButton />
  </div>
  <div className="flex gap-2">
    <SearchInput />
    <FilterSelect />
  </div>
</DialogHeader>
```
