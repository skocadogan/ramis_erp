// Önerilen ürün detay modalı — resim solda, detaylar sağda

import { useEffect } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  useWindowDimensions,
  Pressable,
} from "react-native";
import { X } from "lucide-react-native";
import { ProductDetailHero } from "@/components/menu/product-detail/ProductDetailHero";
import { ProductUnitsTable } from "@/components/menu/product-detail/ProductUnitsTable";
import { ProductDetailFormSections } from "@/components/menu/product-detail/shared";
import { useProductDisplayName } from "@/hooks/useProductDisplayName";
import { useTheme } from "@/hooks/useTheme";
import { useProductDetailForm } from "@/hooks/useProductDetailForm";
import { formatPrice } from "@/utils/format";
import { productHasDiscount } from "@/utils/pricing";
import { productDisplayDescription } from "@/utils/recommendedProducts";
import type { Language, Product } from "@/types";

interface RecommendedProductDetailModalProps {
  product: Product | null;
  visible: boolean;
  initialUnitId?: string;
  language?: Language;
  onClose: () => void;
}

export function RecommendedProductDetailModal({
  product,
  visible,
  initialUnitId,
  language = "tr",
  onClose,
}: RecommendedProductDetailModalProps) {
  const { colors } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const {
    selectedUnitId,
    setSelectedUnitId,
    selectedVariantId,
    setSelectedVariantId,
    selectedModifiers,
    computeDisplayTotals,
    handleModifierToggle,
  } = useProductDetailForm(visible ? product : null);

  const { totalPrice, listPrice } = computeDisplayTotals(1);
  const displayName = useProductDisplayName(product, language);

  useEffect(() => {
    if (!visible || !product || !initialUnitId) return;
    setSelectedUnitId(initialUnitId);
  }, [visible, product, initialUnitId, setSelectedUnitId]);

  if (!product) return null;
  const displayDescription = productDisplayDescription(product, language);

  const modalMaxWidth = Math.min(screenWidth - 40, 820);
  const modalMaxHeight = Math.min(screenHeight * 0.88, 640);
  const useSplitLayout = modalMaxWidth >= 560;
  const imageColumnWidth = useSplitLayout
    ? Math.min(300, Math.round(modalMaxWidth * 0.38))
    : modalMaxWidth;

  const t = {
    close: language === "tr" ? "Kapat" : "Close",
  };

  const detailContent = (
    <View
      style={{
        gap: 16,
        paddingHorizontal: 20,
        paddingTop: useSplitLayout ? 44 : 16,
        paddingBottom: 16,
      }}
    >
      <View>
        <Text
          className="text-xl font-extrabold"
          style={{ color: colors.foreground }}
        >
          {displayName}
        </Text>
        <View className="flex-row items-baseline flex-wrap gap-2 mt-2">
          <Text
            className="text-2xl font-extrabold"
            style={{ color: colors.primary }}
          >
            {formatPrice(totalPrice)}
          </Text>
          {productHasDiscount(product) && totalPrice < listPrice ? (
            <Text
              className="text-base font-bold line-through"
              style={{ color: colors.mutedForeground }}
            >
              {formatPrice(listPrice)}
            </Text>
          ) : null}
        </View>
      </View>

      {displayDescription ? (
        <Text
          className="text-sm leading-relaxed"
          style={{ color: colors.mutedForeground }}
        >
          {displayDescription}
        </Text>
      ) : null}

      <ProductUnitsTable product={product} language={language} />

      <ProductDetailFormSections
        product={product}
        language={language}
        selectedUnitId={selectedUnitId}
        setSelectedUnitId={setSelectedUnitId}
        selectedVariantId={selectedVariantId}
        setSelectedVariantId={setSelectedVariantId}
        selectedModifiers={selectedModifiers}
        handleModifierToggle={handleModifierToggle}
        showDescription={false}
        showUnitSelection={false}
        showCartSection={false}
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        className="flex-1 justify-center px-5"
        style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      >
        <Pressable
          className="absolute inset-0"
          onPress={onClose}
          accessibilityLabel={t.close}
        />

        <View
          className="rounded-3xl overflow-hidden border shadow-2xl self-center w-full"
          style={{
            maxWidth: modalMaxWidth,
            maxHeight: modalMaxHeight,
            backgroundColor: colors.background,
            borderColor: colors.border,
          }}
        >
          <Pressable
            onPress={onClose}
            className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: `${colors.background}CC` }}
            accessibilityRole="button"
            accessibilityLabel={t.close}
          >
            <X size={22} color={colors.foreground} strokeWidth={2.5} />
          </Pressable>

          {useSplitLayout ? (
            <View style={{ flexDirection: "row", height: modalMaxHeight }}>
              <View
                style={{
                  width: imageColumnWidth,
                  flexShrink: 0,
                  borderRightWidth: 1,
                  borderRightColor: colors.border,
                }}
              >
                <ProductDetailHero
                  imageUrl={product.imageUrl || undefined}
                  height={modalMaxHeight}
                  width="100%"
                  borderRadius={0}
                />
              </View>
              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={{ flexGrow: 1 }}
              >
                {detailContent}
              </ScrollView>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              <ProductDetailHero
                imageUrl={product.imageUrl || undefined}
                width="100%"
                borderRadius={0}
              />
              {detailContent}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
