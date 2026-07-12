import { Modal, Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { useTheme } from "@/hooks/useTheme";
import { formatPrice } from "@/utils/format";
import {
  getSelectableProductUnits,
  getUnitListPrice,
  getUnitSalePrice,
  hasReducedPrice,
  productHasDiscount,
} from "@/utils/pricing";
import type { Language, Product, ProductUnitInfo } from "@/types";

interface ProductUnitPickerModalProps {
  visible: boolean;
  product: Product | null;
  language?: Language;
  selectedUnitId?: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onSelect: (product: Product, unit: ProductUnitInfo) => void;
}

export function ProductUnitPickerModal({
  visible,
  product,
  language = "tr",
  selectedUnitId,
  title,
  subtitle,
  onClose,
  onSelect,
}: ProductUnitPickerModalProps) {
  const { colors } = useTheme();

  if (!visible || !product) {
    return null;
  }

  const units = getSelectableProductUnits(product);
  const productName =
    language === "en" && product.nameEn ? product.nameEn : product.name;
  const t = {
    title:
      title ??
      (language === "tr" ? "Satış birimi seçin" : "Choose a sales unit"),
    subtitle:
      (subtitle ?? language === "tr")
        ? `${productName} için bir birim seçerek sepete ekleyin.`
        : `Choose a unit for ${productName} and add it to the cart.`,
    close: language === "tr" ? "Kapat" : "Close",
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 items-center justify-center px-5"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      >
        <Pressable
          className="absolute inset-0"
          onPress={onClose}
          accessibilityLabel={t.close}
        />

        <View
          className="w-full max-w-md rounded-[28px] border px-5 py-5"
          style={{ backgroundColor: colors.card, borderColor: colors.border }}
        >
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text
                className="text-[22px] font-extrabold"
                style={{ color: colors.foreground }}
              >
                {t.title}
              </Text>
              <Text
                className="mt-2 text-[14px] leading-6"
                style={{ color: colors.mutedForeground }}
              >
                {t.subtitle}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.muted }}
              accessibilityRole="button"
              accessibilityLabel={t.close}
            >
              <X size={18} color={colors.icon} />
            </Pressable>
          </View>

          <View className="mt-5 gap-3">
            {units.map((unit) => {
              const unitName =
                language === "en" && unit.nameEn ? unit.nameEn : unit.name;
              const salePrice = getUnitSalePrice(unit, product);
              const listPrice = getUnitListPrice(unit, product);
              const showListPrice =
                productHasDiscount(product) &&
                hasReducedPrice(listPrice, salePrice);
              const isSelected = unit.id === selectedUnitId;

              return (
                <Pressable
                  key={unit.id}
                  onPress={() => onSelect(product, unit)}
                  className="rounded-[22px] border px-4 py-4"
                  style={{
                    backgroundColor: isSelected
                      ? `${colors.primary}14`
                      : colors.background,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${unitName} ${formatPrice(salePrice)}`}
                >
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-1">
                      <Text
                        className="text-[16px] font-bold"
                        style={{ color: colors.foreground }}
                      >
                        {unitName}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text
                        className="text-[16px] font-extrabold"
                        style={{ color: colors.primary }}
                      >
                        {formatPrice(salePrice)}
                      </Text>
                      {showListPrice ? (
                        <Text
                          className="mt-0.5 text-[12px] font-semibold line-through"
                          style={{ color: colors.mutedForeground }}
                        >
                          {formatPrice(listPrice)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
