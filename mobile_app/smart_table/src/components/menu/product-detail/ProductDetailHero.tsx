// Kompakt ürün görseli — genişliğe göre 4:3 alan; isteğe bağlı sabit yükseklik

import { View, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { UtensilsCrossed, ChevronLeft, X } from "lucide-react-native";
import { useTheme } from "@/hooks/useTheme";
import {
  FOOD_IMAGE_ASPECT_RATIO,
  useAdaptiveProductImageFit,
} from "@/utils/productImage";

export { PRODUCT_IMAGE_CONTENT_FIT } from "@/utils/productImage";

const BLURHASH = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";

export interface ProductDetailHeroProps {
  imageUrl?: string;
  width?: number | `${number}%`;
  /** Verilirse alanı doldurur; verilmezse `aspectRatio` ile boyutlanır */
  height?: number;
  aspectRatio?: number;
  borderRadius?: number;
  onClose?: () => void;
  closeLabel?: string;
  /** Sheet modunda sağ üst X; tam ekranda kullanılmaz */
  closeVariant?: "back" | "close";
}

export function ProductDetailHero({
  imageUrl,
  height,
  width = "100%",
  aspectRatio = FOOD_IMAGE_ASPECT_RATIO,
  borderRadius = 16,
  onClose,
  closeLabel = "Close",
  closeVariant = "back",
}: ProductDetailHeroProps) {
  const { colors } = useTheme();
  const CloseIcon = closeVariant === "back" ? ChevronLeft : X;
  const { contentFit, handleContainerLayout, handleImageLoad } =
    useAdaptiveProductImageFit(imageUrl);

  return (
    <View
      onLayout={handleContainerLayout}
      style={[
        {
          width,
          borderRadius,
          overflow: "hidden",
          backgroundColor: colors.muted,
        },
        height != null ? { height } : { aspectRatio },
      ]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          contentFit={contentFit}
          contentPosition="center"
          placeholder={{ blurhash: BLURHASH }}
          transition={300}
          cachePolicy="memory-disk"
          style={StyleSheet.absoluteFill}
          onLoad={handleImageLoad}
        />
      ) : (
        <View style={styles.placeholder}>
          <UtensilsCrossed
            size={40}
            color={colors.mutedForeground}
            strokeWidth={1.5}
          />
        </View>
      )}

      {onClose ? (
        <Pressable
          onPress={onClose}
          className={`absolute top-3 w-10 h-10 rounded-full items-center justify-center ${
            closeVariant === "close" ? "right-3" : "left-3"
          }`}
          style={{ backgroundColor: `${colors.background}CC` }}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        >
          <CloseIcon size={22} color={colors.foreground} strokeWidth={2.5} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
});
