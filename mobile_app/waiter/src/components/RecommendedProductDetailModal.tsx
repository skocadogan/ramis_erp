import React from "react";
import { Modal, View, Text, ScrollView, Pressable, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { X } from "lucide-react-native";
import { getApiUrl } from "../api/client";
import { useI18n } from "../i18n";
import { resolveMediaUrl } from "../utils/mediaUrl";
import { STANDARD_UNIT, formatDisplayPrice, unitDisplayPrice } from "../utils/recommendedProducts";
import type { Product } from "../types/models";

interface RecommendedProductDetailModalProps {
  product: Product | null;
  visible: boolean;
  initialUnitId?: string;
  onClose: () => void;
}

export const RecommendedProductDetailModal: React.FC<RecommendedProductDetailModalProps> = ({
  product,
  visible,
  initialUnitId,
  onClose,
}) => {
  const { t } = useI18n();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const apiUrl = getApiUrl();

  if (!product) return null;

  const unitId = initialUnitId ?? STANDARD_UNIT;
  const price = unitDisplayPrice(product, unitId);
  const listPrice = unitDisplayPrice(
    { ...product, has_discount: false, discounted_price: undefined },
    unitId
  );
  const hasDiscount = product.has_discount && price < listPrice;
  const imageUri = resolveMediaUrl(product.image, apiUrl);
  const description = product.description?.trim() ?? "";

  const modalMaxWidth = Math.min(screenWidth - 40, 820);
  const modalMaxHeight = Math.min(screenHeight * 0.88, 640);
  const useSplitLayout = modalMaxWidth >= 560;
  const imageColumnWidth = useSplitLayout
    ? Math.min(300, Math.round(modalMaxWidth * 0.38))
    : modalMaxWidth;
  const stackedImageHeight = Math.min(200, screenHeight * 0.3);

  const detailContent = (
    <View className="gap-4 px-5 pt-11 pb-4">
      <View>
        <Text className="text-xl font-extrabold text-foreground">{product.name}</Text>
        <View className="flex-row items-baseline flex-wrap gap-2 mt-2">
          <Text className="text-2xl font-extrabold text-primary">{formatDisplayPrice(price)}</Text>
          {hasDiscount ? (
            <Text className="text-base font-bold line-through text-muted-foreground">
              {formatDisplayPrice(listPrice)}
            </Text>
          ) : null}
        </View>
      </View>

      {description ? (
        <Text className="text-sm leading-relaxed text-muted-foreground">{description}</Text>
      ) : null}

      {(product.units?.length ?? 0) > 0 ? (
        <View className="rounded-2xl border border-border overflow-hidden">
          <View className="px-3 py-2 bg-secondary/60 border-b border-border">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {t("order.recommendedColUnit")}
            </Text>
          </View>
          {product.units!.map((unit, index) => {
            const unitPrice = unitDisplayPrice(product, unit.id);
            const isLast = index === product.units!.length - 1;
            return (
              <View
                key={unit.id}
                className={`flex-row items-center justify-between px-3 py-2.5 ${isLast ? "" : "border-b border-border"}`}
              >
                <Text className="text-sm font-semibold text-foreground">{unit.name}</Text>
                <Text className="text-sm font-bold text-primary">
                  {formatDisplayPrice(unitPrice)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  const heroImage = imageUri ? (
    <Image
      source={{ uri: imageUri }}
      style={{ width: "100%", height: "100%" }}
      contentFit="cover"
      transition={200}
      cachePolicy="memory-disk"
    />
  ) : (
    <View className="w-full h-full items-center justify-center bg-secondary/60">
      <Text className="text-xs font-bold uppercase text-muted-foreground">
        {product.category_name ?? product.name}
      </Text>
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
      <View className="flex-1 justify-center px-5 bg-black/55">
        <Pressable
          className="absolute inset-0"
          onPress={onClose}
          accessibilityLabel={t("common.cancel")}
        />

        <View
          className="rounded-3xl overflow-hidden border border-border bg-card shadow-2xl self-center w-full"
          style={{ maxWidth: modalMaxWidth, maxHeight: modalMaxHeight }}
        >
          <Pressable
            onPress={onClose}
            className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full items-center justify-center bg-card/80"
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
          >
            <X size={22} color="#1E2A4A" strokeWidth={2.5} />
          </Pressable>

          {useSplitLayout ? (
            <View style={{ flexDirection: "row", height: modalMaxHeight }}>
              <View
                style={{
                  width: imageColumnWidth,
                  flexShrink: 0,
                  borderRightWidth: 1,
                  borderRightColor: "#e2e8f0",
                }}
              >
                {heroImage}
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
              <View style={{ height: stackedImageHeight }}>{heroImage}</View>
              {detailContent}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};
