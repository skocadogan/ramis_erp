import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  PanResponder,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FlashListCast = FlashList as any;
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Star } from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../../src/store/useAuthStore";
import { useShallow } from "zustand/react/shallow";
import apiClient from "../../../src/api/client";
import { useI18n } from "../../../src/i18n";
import { useTableDetailRefreshStore } from "../../../src/store/useTableDetailRefreshStore";
import { effectiveBranchId } from "../../../src/utils/branchScope";
import {
  fetchMenuCategories,
  fetchMenuProducts,
  fetchPrinters,
  type KitchenPrinter,
} from "../../../src/api/waiterApi";
import type { Category, Product, ProductUnit } from "../../../src/types/models";
import { OrderProductGridCell } from "../../../src/components/OrderProductGridCell";
import {
  selectCartItemCount,
  usePosStore,
  type CartAddResult,
} from "../../../src/store/usePosStore";
import { buildStationOrderPrintJobs } from "../../../src/lib/buildStationOrderPrintJobs";
import { checkPosStationStock } from "../../../src/api/posStockCheck";
import { useKitchenQueueBuffer } from "../../../src/hooks/useKitchenQueueBuffer";
import {
  executeOrEnqueue,
  extractOrderFromResponse,
} from "../../../src/features/offline/executeOrEnqueue";
import { useWaiterConnectivity } from "../../../src/features/offline/connectivity";
import { isOfflineQueueEnabled } from "../../../src/features/offline/config";
import { randomUUID } from "../../../src/features/offline/randomUUID";

// Alt bileşenlerin import edilmesi
import { UnitSelectionModal } from "../../../src/components/UnitSelectionModal";
import { ProductOptionsModal } from "../../../src/components/ProductOptionsModal";
import { CartModal } from "../../../src/components/CartModal";
import { CustomDialog } from "../../../src/components/CustomDialog";
import { StockWarningModal } from "../../../src/components/StockWarningModal";
import type { PosStationStockIssue } from "../../../src/api/posStockCheck";

const SIDEBAR_WIDTH = 90;

const CategorySeparator = () => <View style={{ height: 8 }} />;

/** Verilen kategori ve tüm alt kategorilerinin ID'lerini toplar. */
function getAllDescendantIds(catId: string | number, categories: Category[]): Set<string | number> {
  const ids = new Set<string | number>([catId]);
  for (const c of categories) {
    if (c.parent != null && String(c.parent) === String(catId)) {
      const childIds = getAllDescendantIds(c.id, categories);
      childIds.forEach((id) => ids.add(id));
    }
  }
  return ids;
}

type SubmitCartItem = {
  product: { id: string; name: string };
  quantity: number;
  unitPrice: number;
  selectedUnit?: { name?: string };
  selectedModifiers?: { id: string; name: string; price_adjustment?: number }[];
  notes?: string;
};

/** Web POS ile aynı: mutfak fişi kalemleri sepetten üretilir (API yanıtında kalem/not olmayabilir). */
function buildReceiptItemsFromCart(items: SubmitCartItem[]) {
  return items.map((item) => {
    const modifierLabel = (item.selectedModifiers ?? []).map((m) => m.name).join(", ");
    return {
      name: item.product.name,
      qty: item.quantity,
      price: item.unitPrice,
      unit: item.selectedUnit?.name || "",
      ...(modifierLabel
        ? {
            modifiers: modifierLabel,
            modifier_names: (item.selectedModifiers ?? []).map((m) => m.name),
          }
        : {}),
      ...(item.notes?.trim() ? { notes: item.notes.trim() } : {}),
    };
  });
}

/** Şablondaki {{ descriptions }} — backend ReceiptRenderer ile aynı biçim. */
function compileReceiptDescriptions(items: SubmitCartItem[], orderNote?: string) {
  const parts: string[] = [];
  const trimmedOrderNote = orderNote?.trim() || "";
  if (trimmedOrderNote) parts.push(trimmedOrderNote);
  for (const item of items) {
    const note = item.notes?.trim();
    if (!note) continue;
    parts.push(`${item.product.name} : ${note}`);
  }
  return parts.join(", ");
}

export default function OrderScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cartButtonBottom = Math.max(insets.bottom + 12, 24);

  const columnCount = useMemo(() => {
    const availableWidth = width - SIDEBAR_WIDTH;
    if (availableWidth >= 850) return 5;
    if (availableWidth >= 600) return 4;
    if (availableWidth >= 440) return 3;
    return 2;
  }, [width]);

  const productItemWidth = useMemo(() => {
    return (width - SIDEBAR_WIDTH - (columnCount + 1) * 16) / columnCount;
  }, [width, columnCount]);

  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const requestTableDetailRefresh = useTableDetailRefreshStore((s) => s.requestRefreshAfterOrder);
  const user = useAuthStore((s) => s.user);
  const cart = usePosStore((s) => s.cart);
  const cartLength = usePosStore(selectCartItemCount);
  const {
    activeBranchId,
    addToCart,
    updateQuantity,
    clearCart,
    setCartTableId,
    autoPrintOrder,
    stockTrackingMode,
  } = usePosStore(
    useShallow((s) => ({
      activeBranchId: s.activeBranchId,
      addToCart: s.addToCart,
      updateQuantity: s.updateQuantity,
      clearCart: s.clearCart,
      setCartTableId: s.setCartTableId,
      autoPrintOrder: s.autoPrintOrder,
      stockTrackingMode: s.stockTrackingMode,
    }))
  );

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCartModalVisible, setIsCartModalVisible] = useState(false);
  const [unitSelectionProduct, setUnitSelectionProduct] = useState<Product | null>(null);
  const [isUnitModalVisible, setIsUnitModalVisible] = useState(false);
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);
  const [isOptionsModalVisible, setIsOptionsModalVisible] = useState(false);
  const [stockWarningVisible, setStockWarningVisible] = useState(false);
  const [stockBlockIssues, setStockBlockIssues] = useState<PosStationStockIssue[]>([]);
  const [pendingSubmitNotes, setPendingSubmitNotes] = useState("");

  // Dialog State
  const [dialogConfig, setDialogConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: "info" | "success" | "error" | "warning" | "confirm";
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    visible: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const showDialog = useCallback((config: Omit<typeof dialogConfig, "visible">) => {
    setDialogConfig({ ...config, visible: true });
  }, []);

  const hideDialog = useCallback(() => {
    setDialogConfig((prev) => ({ ...prev, visible: false }));
  }, []);

  // "Ürün kısıtına göre" modunda (remaining_portions) sepete ekleme sınırına
  // takıldığında kullanıcıyı bilgilendir.
  const maybeShowCartLimitDialog = useCallback(
    (result: CartAddResult) => {
      if (!result.capped) return;
      if (result.maxAddable == null) return; // LIMITED olmayan ürünler
      // remaining_portions = added + maxAddable
      const max = result.added + (result.maxAddable ?? 0);
      const message =
        result.added > 0
          ? t("order.cartLimitDescPartial", { max, added: result.added })
          : t("order.cartLimitDesc", { max });
      showDialog({
        title: t("order.cartLimitTitle"),
        message,
        type: "info",
        confirmLabel: t("order.cartLimitOk"),
        onConfirm: hideDialog,
      });
    },
    [t, showDialog, hideDialog]
  );

  // +/- butonları için updateQuantity wrapper'ı (sınır kontrolü + dialog).
  const handleUpdateQuantity = useCallback(
    (cartId: string, delta: number) => {
      const result = updateQuantity(cartId, delta);
      maybeShowCartLimitDialog(result);
    },
    [updateQuantity, maybeShowCartLimitDialog]
  );

  // Bu ekrana girildiğinde sepetin hangi masaya ait olduğunu işaretle
  useEffect(() => {
    if (!id) return;
    const st = usePosStore.getState();
    if (st.cartTableId && st.cartTableId !== id && st.cart.length > 0) {
      clearCart();
    }
    setCartTableId(id);
  }, [id, clearCart, setCartTableId]);

  const branchFallback = effectiveBranchId(user?.branchId, activeBranchId);
  const isVirtualTable = id?.startsWith("tw-new__") || id?.startsWith("tw-ord__");
  const { offlineMode } = useWaiterConnectivity();

  const tableQuery = useQuery({
    queryKey: ["table", "detail", id] as const,
    queryFn: () => apiClient.get(`/tables/${id}/`).then((r) => r.data),
    enabled: !!id && !isVirtualTable,
  });

  const tableBranch =
    tableQuery.data?.branch_id != null && String(tableQuery.data.branch_id).trim() !== ""
      ? String(tableQuery.data.branch_id)
      : null;
  const menuBranchId = tableBranch || branchFallback;
  const { expectedBuffer, busyThreshold } = useKitchenQueueBuffer(
    cart,
    menuBranchId,
    stockTrackingMode
  );
  const isKitchenBusy = expectedBuffer >= busyThreshold;

  const categoriesQuery = useQuery({
    queryKey: ["menu", "categories", menuBranchId] as const,
    queryFn: () => fetchMenuCategories(menuBranchId!),
    enabled: !!menuBranchId,
    staleTime: 5 * 60_000,
  });

  const featuredProbeQuery = useQuery({
    queryKey: ["menu", "featured-probe", menuBranchId] as const,
    queryFn: () => fetchMenuProducts(menuBranchId!, { featuredOnly: true }),
    enabled: !!menuBranchId,
    staleTime: 5 * 60_000,
    select: (rows) => rows.some((p: { is_featured?: boolean }) => !!p.is_featured),
  });

  const kitchenPrintersQuery = useQuery({
    queryKey: ["printers", "kitchen", menuBranchId] as const,
    queryFn: () =>
      fetchPrinters(String(menuBranchId), {
        usage_type: "KITCHEN",
        is_active: true,
      }),
    enabled: !!menuBranchId && autoPrintOrder,
    staleTime: 10 * 60_000,
  });

  const ordersQuery = useQuery({
    queryKey: ["table", "active-orders", id] as const,
    queryFn: () =>
      apiClient
        .get("/orders/main/", {
          params: {
            branch_id: menuBranchId || undefined,
            table_id: id,
            status: "PENDING,PREPARING,READY,DELIVERED",
          },
        })
        .then((r) => {
          const list = Array.isArray(r.data) ? r.data : r.data.results || [];
          return list;
        }),
    enabled: !!id && !!menuBranchId && !isVirtualTable,
  });

  const orderedQtysMap = useMemo(() => {
    const map = new Map<string, number>();
    const ordersList = ordersQuery.data || [];
    for (const order of ordersList) {
      if (Array.isArray(order.items)) {
        for (const item of order.items) {
          const productId = item.product_id || item.product?.id;
          if (productId) {
            const qty = parseFloat(String(item.quantity || 0));
            map.set(productId, (map.get(productId) ?? 0) + qty);
          }
        }
      }
    }
    return map;
  }, [ordersQuery.data]);

  const categories = useMemo(
    () => (categoriesQuery.data ?? []) as Category[],
    [categoriesQuery.data]
  );
  const hasFeatured = featuredProbeQuery.data === true;

  // Sadece parent (root) kategoriler
  const parentCategories = useMemo(
    () => categories.filter((c: Category) => c.parent == null),
    [categories]
  );

  const defaultCategory = useMemo(() => {
    if (!hasFeatured && parentCategories.length === 0) return null;
    if (hasFeatured) return "FEATURED";
    return parentCategories.length > 0 ? parentCategories[0].id : null;
  }, [hasFeatured, parentCategories]);

  useEffect(() => {
    setCategoryTouched(false);
    setSelectedCategory(null);
  }, [id, menuBranchId]);

  const activeCategory = categoryTouched ? selectedCategory : (selectedCategory ?? defaultCategory);

  // Seçili kategorinin kök parent'ı (subcategory bar için)
  const selectedRootParent = useMemo<Category | null>(() => {
    if (!activeCategory || activeCategory === "FEATURED") return null;
    let catId: string | number | null = activeCategory;
    let cat: Category | undefined;
    while (catId) {
      cat = categories.find((c: Category) => String(c.id) === String(catId));
      if (!cat) return null;
      catId = cat.parent ?? null;
    }
    return cat ?? null;
  }, [activeCategory, categories]);

  // Seçili parent'ın birinci seviye alt kategorileri (subcategory bar)
  const subCategories = useMemo<Category[]>(() => {
    if (!selectedRootParent) return [];
    return categories.filter(
      (c: Category) => c.parent != null && String(c.parent) === String(selectedRootParent.id)
    );
  }, [selectedRootParent, categories]);

  // Tüm ürünleri tek seferde çek, client-side filtrele
  const allProductsQuery = useQuery({
    queryKey: ["menu", "products", "all", menuBranchId] as const,
    queryFn: () => fetchMenuProducts(menuBranchId!),
    enabled: !!menuBranchId,
    staleTime: 5 * 60_000,
  });

  const allProducts = useMemo<Product[]>(
    () => (allProductsQuery.data ?? []) as Product[],
    [allProductsQuery.data]
  );

  // Client-side recursive filtreleme
  const filteredProducts = useMemo(() => {
    if (activeCategory === "FEATURED") {
      return allProducts.filter((p) => p.is_featured && p.show_on_pos !== false);
    }
    if (!activeCategory) return [];
    const descendantIds = getAllDescendantIds(activeCategory, categories);
    return allProducts.filter(
      (p) => p.category && descendantIds.has(p.category) && p.show_on_pos !== false
    );
  }, [allProducts, activeCategory, categories]);

  // Sidebar: sadece parent kategoriler + FEATURED
  const sidebarCategories = useMemo(() => {
    type SidebarCategory = Category & { isFeatured?: boolean };
    return [
      ...(hasFeatured
        ? [
            {
              id: "FEATURED",
              name: t("order.featured"),
              isFeatured: true,
            } as unknown as SidebarCategory,
          ]
        : []),
      ...parentCategories.map((category) => ({ ...category, isFeatured: false })),
    ];
  }, [hasFeatured, parentCategories, t]);

  const handleNextCategory = useCallback(() => {
    if (sidebarCategories.length === 0) return;
    const currentIndex = sidebarCategories.findIndex((c) => c.id === activeCategory);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex < sidebarCategories.length) {
      setCategoryTouched(true);
      setSelectedCategory(String(sidebarCategories[nextIndex].id));
    }
  }, [sidebarCategories, activeCategory]);

  const handlePrevCategory = useCallback(() => {
    if (sidebarCategories.length === 0) return;
    const currentIndex = sidebarCategories.findIndex((c) => c.id === activeCategory);
    if (currentIndex === -1) return;
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      setCategoryTouched(true);
      setSelectedCategory(String(sidebarCategories[prevIndex].id));
    }
  }, [sidebarCategories, activeCategory]);

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const { dx, dy } = gestureState;
        // Horizontal swipe must be significantly larger than vertical drag to avoid breaking list scroll
        return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 15;
      },
      onPanResponderRelease: (evt, gestureState) => {
        const { dx } = gestureState;
        const SWIPE_THRESHOLD = 50;
        if (Math.abs(dx) > SWIPE_THRESHOLD) {
          if (dx > 0) {
            // Swipe Right (parmağı soldan sağa çekmek) -> Sonraki kategoriye git
            handleNextCategory();
          } else {
            // Swipe Left (parmağı sağdan sola çekmek) -> Bir önceki kategoriye git
            handlePrevCategory();
          }
        }
      },
    });
  }, [handleNextCategory, handlePrevCategory]);

  const isBlockingLoading = !isVirtualTable && tableQuery.isPending;
  const isMenuLoading =
    !!menuBranchId &&
    (categoriesQuery.isPending || (!!activeCategory && allProductsQuery.isPending));

  const formatSuccessOrderNo = (orderResponse: Record<string, unknown> | undefined | null) => {
    const rawNum = orderResponse?.order_number;
    if (rawNum !== undefined && rawNum !== null && String(rawNum).trim() !== "") {
      return String(rawNum);
    }
    const rawId = orderResponse?.id;
    if (typeof rawId === "string") {
      const short = rawId.split("-")[0];
      return short || rawId;
    }
    if (rawId !== undefined && rawId !== null) {
      return String(rawId);
    }
    return "—";
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleOrderSubmit = async (
    orderNotes?: string,
    opts?: { skipStationStockCheck?: boolean }
  ) => {
    const submitCart = usePosStore.getState().cart as SubmitCartItem[];
    if (submitCart.length === 0) return;

    const receiptItems = buildReceiptItemsFromCart(submitCart);
    const receiptDescriptions = compileReceiptDescriptions(submitCart, orderNotes);
    const trimmedOrderNotes = orderNotes?.trim() || "";

    const branchId =
      menuBranchId ||
      (user?.branchId && String(user.branchId).trim() !== "" ? user.branchId : null) ||
      activeBranchId;
    if (!branchId) {
      showDialog({
        title: t("order.errorTitle"),
        message: t("order.errorDesc"),
        type: "error",
        onConfirm: hideDialog,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (!opts?.skipStationStockCheck && !(offlineMode && isOfflineQueueEnabled())) {
        const stockCheck = await checkPosStationStock(
          String(branchId),
          submitCart.map((item) => ({
            product_id: item.product.id,
            quantity: item.quantity,
          })),
          stockTrackingMode
        );
        if (!stockCheck.ok && stockCheck.issues.length > 0) {
          setStockBlockIssues(stockCheck.issues);
          setPendingSubmitNotes(trimmedOrderNotes);
          setStockWarningVisible(true);
          return;
        }
      }

      const isTakeaway = isVirtualTable;
      const tableLabel = isTakeaway
        ? t("tables.takeaway") || "Paket Servis"
        : tableQuery.data?.name || `Masa #${id}`;
      const payload = {
        branch_id: branchId,
        table_id: isTakeaway ? null : id,
        order_type: isTakeaway ? "TAKEAWAY" : "TABLE",
        items: submitCart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          unit_name: item.selectedUnit?.name || null,
          modifier_ids: (item.selectedModifiers ?? []).map((m) => m.id),
          ...(item.notes?.trim() ? { notes: item.notes.trim() } : {}),
        })),
        stock_tracking_mode: stockTrackingMode,
        notes: trimmedOrderNotes,
        ...(opts?.skipStationStockCheck ? { skip_station_stock_check: true } : {}),
      };

      const printContextBase = {
        table_name: tableLabel,
        waiter_name: (() => {
          const name = (user?.fullName || "").trim();
          if (
            !name ||
            name === "null null" ||
            name === "undefined undefined" ||
            name === "null" ||
            name === "undefined"
          ) {
            return user?.username || "Garson";
          }
          return name;
        })(),
        ...(trimmedOrderNotes ? { notes: trimmedOrderNotes } : {}),
        ...(receiptDescriptions ? { descriptions: receiptDescriptions } : {}),
      };

      const kitchenPrinters: KitchenPrinter[] = autoPrintOrder
        ? (kitchenPrintersQuery.data ?? [])
        : [];

      const pendingPrintJobs =
        autoPrintOrder && kitchenPrinters.length > 0
          ? buildStationOrderPrintJobs({
              cart: submitCart,
              kitchenPrinters,
              baseContext: {
                ...printContextBase,
                items: receiptItems,
                total: submitCart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
              },
              orderNumber: "Yeni",
              idempotencyPrefix: `pending:${randomUUID()}`,
            })
          : [];

      const deferredPrints =
        pendingPrintJobs.length > 0
          ? pendingPrintJobs
              .filter((job) => Boolean(job.idempotencyKey))
              .map((job) => ({
                templateSlug: job.templateSlug,
                printerId: job.printerId,
                context: job.context,
                idempotencyKey: job.idempotencyKey as string,
              }))
          : undefined;

      const result = await executeOrEnqueue({
        offlineMode,
        type: "CREATE_ORDER",
        endpoint: "/orders/main/",
        payload,
        branchId: String(branchId),
        label: t("offline.createOrderLabel", { table: tableLabel }),
        meta: {
          skipStationStockCheck: Boolean(opts?.skipStationStockCheck || offlineMode),
          deferredPrints,
          tableName: tableLabel,
        },
      });

      if (result.mode === "queued") {
        clearCart();
        setIsCartModalVisible(false);
        showDialog({
          title: t("order.successTitle"),
          message: t("offline.queuedOrder"),
          type: "success",
          onConfirm: () => {
            hideDialog();
            router.replace("/(main)/tables");
          },
        });
        return;
      }

      const orderData = extractOrderFromResponse(result.data);
      const displayNo = formatSuccessOrderNo(orderData);
      const queueNotice = orderData.kitchen_queue_notice as
        | { show?: boolean; extra_minutes?: number }
        | undefined;
      const queueNoticeLine =
        queueNotice?.show && typeof queueNotice.extra_minutes === "number"
          ? `\n\n${t("order.kitchenQueueNotice", { minutes: queueNotice.extra_minutes })}`
          : "";

      if (autoPrintOrder && kitchenPrinters.length > 0) {
        const totalRaw = orderData.total_amount;
        const totalAmount =
          totalRaw !== undefined && totalRaw !== null && String(totalRaw).trim() !== ""
            ? parseFloat(String(totalRaw))
            : submitCart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

        const now = new Date();
        const dateStr = now.toLocaleDateString("tr-TR");
        const timeStr = now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

        const printJobs = buildStationOrderPrintJobs({
          cart: submitCart,
          kitchenPrinters,
          baseContext: {
            ...printContextBase,
            total: totalAmount,
            created_at: now.toLocaleString("tr-TR"),
            date: dateStr,
            time: timeStr,
          },
          orderNumber: displayNo,
          orderId: orderData.id ? String(orderData.id) : undefined,
          idempotencyPrefix: orderData.id ? String(orderData.id) : undefined,
        });

        for (const job of printJobs) {
          void apiClient
            .post(`/reporting/receipts/${job.templateSlug}/print_thermal/`, {
              printer_id: job.printerId,
              context: job.context,
              ...(job.idempotencyKey ? { idempotency_key: job.idempotencyKey } : {}),
            })
            .catch((err) => {
              console.error("Waiter automatic printing failed:", err);
            });
        }
      }

      clearCart();
      setIsCartModalVisible(false);
      if (id) {
        requestTableDetailRefresh(String(id));
      }

      void queryClient.invalidateQueries({ queryKey: ["table", "detail", id] });
      void queryClient.invalidateQueries({ queryKey: ["tables", branchId] });
      void queryClient.invalidateQueries({ queryKey: ["zones", branchId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "stats", branchId] });
      void queryClient.invalidateQueries({ queryKey: ["orders", "main", "waiter", branchId] });

      showDialog({
        title: t("order.successTitle"),
        message: `${t("order.successDesc", { no: displayNo })}${queueNoticeLine}`,
        type: "success",
        onConfirm: () => {
          hideDialog();
          router.replace("/(main)/tables");
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      showDialog({
        title: t("order.errorTitle"),
        message: error.response?.data?.detail || t("order.errorDesc"),
        type: "error",
        onConfirm: hideDialog,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canForcePastCriticalStock =
    stockBlockIssues.length > 0 &&
    stockBlockIssues.every((issue) => issue.code === "CRITICAL_STOCK");

  const handleForceSubmitPastCritical = useCallback(() => {
    setStockWarningVisible(false);
    void handleOrderSubmit(pendingSubmitNotes, { skipStationStockCheck: true });
  }, [handleOrderSubmit, pendingSubmitNotes]);

  const handleProductCardPress = useCallback(
    (product: Product) => {
      const isSoldOut =
        stockTrackingMode === "INGREDIENT"
          ? !!product.is_reserved_out
          : product.availability_mode === "SOLD_OUT" ||
            (product.availability_mode === "LIMITED" && product.remaining_portions === 0);

      if (isSoldOut && product.pos_block_mode === "BLOCK") {
        showDialog({
          title: t("order.soldOutBlockTitle"),
          message: t("order.soldOutBlockMsg"),
          type: "error",
          onConfirm: hideDialog,
        });
        return;
      }

      const proceedAddToCart = (
        selectedUnit?: ProductUnit | null,
        selectedModifiers?: { id: string; name: string; price_adjustment: number }[]
      ) => {
        const result = addToCart(product, selectedUnit ?? undefined, 1, selectedModifiers);
        maybeShowCartLimitDialog(result);
      };

      const productNeedsOptions =
        (product.units && product.units.length > 0) ||
        (product.modifier_groups && product.modifier_groups.length > 0);

      const showOptionsSelection = () => {
        if (productNeedsOptions) {
          setOptionsProduct(product);
          setIsOptionsModalVisible(true);
        } else {
          proceedAddToCart();
        }
      };

      const showPortionSelection = () => {
        if (product.units && product.units.length > 0) {
          setUnitSelectionProduct(product);
          setIsUnitModalVisible(true);
        } else {
          showOptionsSelection();
        }
      };

      if (isSoldOut && product.pos_block_mode === "WARN") {
        showDialog({
          title: t("order.soldOutWarnTitle"),
          message: t("order.soldOutWarnMsg"),
          type: "confirm",
          confirmLabel: t("order.soldOutWarnConfirm"),
          cancelLabel: t("common.cancel"),
          onConfirm: () => {
            hideDialog();
            showPortionSelection();
          },
          onCancel: hideDialog,
        });
        return;
      }
      showPortionSelection();
    },
    [t, stockTrackingMode, showDialog, hideDialog, addToCart, maybeShowCartLimitDialog]
  );

  const handleProductCardLongPress = useCallback(
    (product: Product) => {
      const hasDesc = product.description && String(product.description).trim() !== "";
      showDialog({
        title: product.name,
        message: hasDesc ? String(product.description).trim() : "Ürün açıklaması bulunmuyor.",
        type: "info",
        confirmLabel: "Tamam",
        onConfirm: hideDialog,
      });
    },
    [showDialog, hideDialog]
  );

  const handlePortionsSelect = (selections: { unit?: ProductUnit; quantity: number }[]) => {
    const product = unitSelectionProduct;
    setIsUnitModalVisible(false);
    setUnitSelectionProduct(null);
    if (!product) return;

    const hasModifiers =
      Array.isArray(product.modifier_groups) && product.modifier_groups.length > 0;

    for (const sel of selections) {
      if (sel.quantity <= 0) continue;
      if (hasModifiers) {
        setOptionsProduct({ ...product, _pendingUnit: sel.unit, _pendingQty: sel.quantity });
        setIsOptionsModalVisible(true);
        return;
      }
      const result = addToCart(product, sel.unit ?? undefined, sel.quantity);
      maybeShowCartLimitDialog(result);
    }
  };

  const handleOptionsConfirm = (
    unit: ProductUnit | null | undefined,
    modifiers: { id: string; name: string; price_adjustment?: number | string }[]
  ) => {
    const target = optionsProduct;
    if (!target) return;
    const pendingQty = target._pendingQty ?? 1;
    const normalizedMods = modifiers.map((m) => ({
      id: m.id,
      name: m.name,
      price_adjustment: Number(m.price_adjustment ?? 0),
    }));
    const result = addToCart(target, unit ?? undefined, Number(pendingQty), normalizedMods);
    maybeShowCartLimitDialog(result);
    setIsOptionsModalVisible(false);
    setOptionsProduct(null);
  };

  const renderProductItem = useCallback(
    ({ item }: { item: Product }) => (
      <OrderProductGridCell
        product={item}
        orderedQty={orderedQtysMap.get(String(item.id)) || 0}
        productItemWidth={productItemWidth}
        stockTrackingMode={stockTrackingMode}
        catalogProducts={allProducts}
        onPress={handleProductCardPress}
        onLongPress={handleProductCardLongPress}
        onUpdateQuantity={handleUpdateQuantity}
        onCartLimit={maybeShowCartLimitDialog}
      />
    ),
    [
      orderedQtysMap,
      productItemWidth,
      stockTrackingMode,
      allProducts,
      handleUpdateQuantity,
      handleProductCardPress,
      handleProductCardLongPress,
      maybeShowCartLimitDialog,
    ]
  );

  const renderCategoryItem = useCallback(
    ({ item }: { item: Category & { isFeatured?: boolean } }) => {
      const isSelected = activeCategory === item.id;
      return (
        <Pressable
          onPress={() => {
            setCategoryTouched(true);
            setSelectedCategory(String(item.id));
          }}
          className={`active:scale-95 p-3 rounded-xl items-center justify-center border ${
            isSelected ? "bg-primary border-primary" : "bg-card border-border"
          }`}
        >
          {item.isFeatured ? <Star size={16} color={isSelected ? "#ffffff" : "#1E2A4A"} /> : null}
          <Text
            numberOfLines={2}
            className={`text-[9px] font-black text-center ${
              isSelected ? "text-white" : "text-foreground"
            }`}
            style={item.isFeatured ? { marginTop: 4 } : undefined}
          >
            {item.name}
          </Text>
        </Pressable>
      );
    },
    [activeCategory]
  );

  if (!id || !menuBranchId) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-muted-foreground">{t("common.noData")}</Text>
      </View>
    );
  }

  if (isBlockingLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#1E2A4A" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background" edges={["top"]}>
      {/* Header */}
      <View className="px-4 py-3.5 flex-row justify-between items-center bg-card border-b border-border/40">
        <Pressable
          onPress={() => router.back()}
          className="active:scale-95 bg-secondary w-10 h-10 rounded-xl items-center justify-center border border-border"
        >
          <ChevronLeft size={22} color="#1E2A4A" />
        </Pressable>
        <View className="items-center">
          <Text className="text-foreground font-black text-lg tracking-tight">
            {isVirtualTable
              ? t("tables.takeaway") || "Paket Servis"
              : tableQuery.data?.name || "Masa"}
          </Text>
          {!isVirtualTable ? (
            <Text className="text-muted-foreground text-[9px] font-black uppercase tracking-wider mt-0.5">
              {tableQuery.data?.zone_name}
            </Text>
          ) : null}
        </View>
        <View className="w-10" />
      </View>

      <View className="flex-1 flex-row">
        {/* Sidebar Categories */}
        <View style={{ width: SIDEBAR_WIDTH }} className="border-r border-border bg-secondary">
          <FlashListCast
            data={sidebarCategories}
            keyExtractor={(item: Category & { isFeatured?: boolean }) => String(item.id)}
            estimatedItemSize={75}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 8 }}
            ItemSeparatorComponent={CategorySeparator}
            renderItem={renderCategoryItem}
          />
        </View>

        {/* Products Grid */}
        <View {...panResponder.panHandlers} className="flex-1 bg-background">
          {/* Subcategory bar */}
          {subCategories.length > 0 && selectedRootParent && (
            <View className="border-b border-border bg-card py-1.5">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 8, gap: 6 }}
              >
                <Pressable
                  onPress={() => {
                    setCategoryTouched(true);
                    setSelectedCategory(String(selectedRootParent.id));
                  }}
                  className={`px-3 py-1.5 rounded-lg ${
                    activeCategory === selectedRootParent.id
                      ? "bg-primary"
                      : "bg-secondary border border-border"
                  }`}
                >
                  <Text
                    className={`text-[11px] font-bold ${
                      activeCategory === selectedRootParent.id ? "text-white" : "text-foreground"
                    }`}
                  >
                    {t("order.all")}
                  </Text>
                </Pressable>
                {subCategories.map((sub) => {
                  const isSubActive = activeCategory === sub.id;
                  return (
                    <Pressable
                      key={String(sub.id)}
                      onPress={() => {
                        setCategoryTouched(true);
                        setSelectedCategory(String(sub.id));
                      }}
                      className={`px-3 py-1.5 rounded-lg ${
                        isSubActive ? "bg-primary" : "bg-secondary border border-border"
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-bold ${
                          isSubActive ? "text-white" : "text-foreground"
                        }`}
                      >
                        {sub.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
          {/* Product grid */}

          {isMenuLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#1E2A4A" />
            </View>
          ) : filteredProducts.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-muted-foreground text-xs font-semibold">
                Bu kategoride ürün bulunamadı.
              </Text>
            </View>
          ) : (
            <FlashListCast
              data={filteredProducts}
              keyExtractor={(item: Product) => String(item.id)}
              estimatedItemSize={140}
              renderItem={renderProductItem}
              numColumns={columnCount}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 8 }}
            />
          )}
        </View>
      </View>

      {/* Floating Cart Button */}
      {cartLength > 0 ? (
        <View
          style={{ position: "absolute", bottom: cartButtonBottom, left: 24, right: 24 }}
          className={isKitchenBusy ? "shadow-lg shadow-amber-600/25" : "shadow-lg"}
        >
          <Pressable
            onPress={() => setIsCartModalVisible(true)}
            className={`active:scale-[0.98] h-16 rounded-2xl flex-row justify-between items-center px-8 ${
              isKitchenBusy ? "bg-amber-600" : "bg-primary"
            }`}
          >
            <View>
              <Text className="text-white font-black text-base">{t("order.viewCart")}</Text>
              {isKitchenBusy ? (
                <Text className="text-amber-100 text-[10px] font-bold uppercase mt-0.5">
                  {t("order.kitchenBusy", { minutes: expectedBuffer })}
                </Text>
              ) : null}
            </View>
            <View className="bg-white/20 px-3.5 py-1 rounded-xl">
              <Text className="text-white font-black text-xs">
                {t("order.cartBadge", { count: cartLength })}
              </Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* Cart Modal Component */}
      <CartModal
        visible={isCartModalVisible}
        cart={cart}
        onClose={() => setIsCartModalVisible(false)}
        onClear={clearCart}
        onUpdateQty={handleUpdateQuantity}
        onSubmit={handleOrderSubmit}
        isSubmitting={isSubmitting}
        expectedBuffer={expectedBuffer}
        busyThreshold={busyThreshold}
        t={t}
      />

      {isUnitModalVisible && unitSelectionProduct ? (
        <UnitSelectionModal
          visible
          product={unitSelectionProduct}
          onSelect={handlePortionsSelect}
          onClose={() => {
            setIsUnitModalVisible(false);
            setUnitSelectionProduct(null);
          }}
          t={t}
        />
      ) : null}

      {isOptionsModalVisible && optionsProduct ? (
        <ProductOptionsModal
          visible
          product={optionsProduct}
          onConfirm={handleOptionsConfirm}
          onClose={() => {
            setIsOptionsModalVisible(false);
            setOptionsProduct(null);
          }}
          t={t}
        />
      ) : null}

      {/* Stock warning — POS ile aynı detaylı uyarı */}
      <StockWarningModal
        visible={stockWarningVisible}
        issues={stockBlockIssues}
        canForcePastCritical={canForcePastCriticalStock}
        onClose={() => setStockWarningVisible(false)}
        onForceSubmit={handleForceSubmitPastCritical}
        t={t}
      />

      {/* Global Premium Custom Dialog */}
      <CustomDialog
        visible={dialogConfig.visible}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        confirmLabel={dialogConfig.confirmLabel}
        cancelLabel={dialogConfig.cancelLabel}
        onConfirm={dialogConfig.onConfirm}
        onCancel={dialogConfig.onCancel}
      />
    </SafeAreaView>
  );
}
