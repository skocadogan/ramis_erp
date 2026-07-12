// Shared product-detail UI primitives (sheet + full modal)

import React, { memo, useCallback, useMemo } from "react";
import { Text, View, Pressable } from "react-native";
import { Minus, Plus, AlertTriangle } from "lucide-react-native";
import { useTheme } from "@/hooks/useTheme";
import { formatPrice } from "@/utils/format";
import {
  getSelectableProductUnits,
  hasSelectableProductUnits,
} from "@/utils/pricing";
import type { Allergen, Language, ModifierGroup, Product } from "@/types";

const severityColorsLight: Record<
  string,
  { bg: string; text: string; icon: string }
> = {
  HIGH: { bg: "#FEE2E2", text: "#991B1B", icon: "#EF4444" },
  MEDIUM: { bg: "#FEF3C7", text: "#92400E", icon: "#F59E0B" },
  LOW: { bg: "#DBEAFE", text: "#1E40AF", icon: "#3B82F6" },
};

const severityColorsDark: Record<
  string,
  { bg: string; text: string; icon: string }
> = {
  HIGH: { bg: "#450A0A", text: "#FCA5A5", icon: "#EF4444" },
  MEDIUM: { bg: "#451A03", text: "#FCD34D", icon: "#F59E0B" },
  LOW: { bg: "#0C1F45", text: "#93C5FD", icon: "#3B82F6" },
};

export function AllergenChip({ allergen }: { allergen: Allergen }) {
  const { isDark } = useTheme();
  const palette = isDark ? severityColorsDark : severityColorsLight;
  const allergenColors = palette[allergen.severity] ?? palette.LOW;
  return (
    <View
      className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
      style={{ backgroundColor: allergenColors.bg }}
    >
      <AlertTriangle size={12} color={allergenColors.icon} strokeWidth={2} />
      <Text
        className="text-xs font-semibold"
        style={{ color: allergenColors.text }}
        numberOfLines={1}
      >
        {allergen.name}
      </Text>
      <View
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: allergenColors.icon }}
      />
    </View>
  );
}

function QuantitySelector({
  quantity,
  onDecrease,
  onIncrease,
  min = 1,
  language = "tr",
}: {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  min?: number;
  language?: Language;
}) {
  const { colors } = useTheme();
  const decLabel = language === "tr" ? "Adedi azalt" : "Decrease quantity";
  const incLabel = language === "tr" ? "Adedi artır" : "Increase quantity";

  return (
    <View className="flex-row items-center gap-4">
      <Pressable
        onPress={onDecrease}
        disabled={quantity <= min}
        className={`h-12 w-12 rounded-full items-center justify-center border-2 ${quantity <= min ? "opacity-30" : ""}`}
        style={{ borderColor: colors.border }}
        accessibilityRole="button"
        accessibilityLabel={decLabel}
      >
        <Minus size={22} color={colors.foreground} strokeWidth={2.5} />
      </Pressable>
      <Text
        className="text-2xl font-extrabold min-w-[40px] text-center"
        style={{ color: colors.foreground }}
      >
        {quantity}
      </Text>
      <Pressable
        onPress={onIncrease}
        className="h-12 w-12 rounded-full items-center justify-center"
        style={{ backgroundColor: colors.primary }}
        accessibilityRole="button"
        accessibilityLabel={incLabel}
      >
        <Plus size={22} color={colors.primaryForeground} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

function ModifierGroupSectionBase({
  group,
  selectedIds,
  onToggle,
  language,
  disabled = false,
}: {
  group: ModifierGroup;
  selectedIds: string[];
  onToggle: (modifierId: string) => void;
  language: Language;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hint = group.isRequired
    ? language === "tr"
      ? "(Zorunlu)"
      : "(Required)"
    : language === "tr"
      ? `(En fazla ${group.maxSelection})`
      : `(Max ${group.maxSelection})`;

  const handleToggle = useCallback(
    (modifierId: string) => {
      if (disabled) return;
      onToggle(modifierId);
    },
    [disabled, onToggle],
  );

  return (
    <View className="mb-2">
      <View className="flex-row items-center gap-2 mb-3">
        <Text
          className="text-base font-bold"
          style={{ color: colors.foreground }}
        >
          {language === "en" && group.nameEn ? group.nameEn : group.name}
        </Text>
        <Text
          className="text-xs font-medium"
          style={{ color: colors.mutedForeground }}
        >
          {hint}
        </Text>
      </View>
      <View className="gap-2">
        {group.modifiers.map((mod) => {
          const isSelected = selectedIdSet.has(mod.id);
          const modName =
            language === "en" && mod.nameEn ? mod.nameEn : mod.name;
          const rowBg = isSelected ? `${colors.primary}14` : colors.card;
          const rowBorder = isSelected ? colors.primary : colors.border;
          const dotBorder = isSelected ? colors.primary : colors.border;
          const nameColor = isSelected ? colors.primary : colors.foreground;
          return (
            <Pressable
              key={mod.id}
              onPress={() => handleToggle(mod.id)}
              disabled={disabled}
              className={`flex-row items-center justify-between px-4 py-3.5 rounded-2xl border-2 ${disabled ? "opacity-40" : ""}`}
              style={{ backgroundColor: rowBg, borderColor: rowBorder }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected, disabled }}
              accessibilityLabel={modName}
            >
              <View className="flex-row items-center gap-3 flex-1">
                <View
                  className="w-5 h-5 rounded-full border-2 items-center justify-center"
                  style={{ borderColor: dotBorder }}
                >
                  {isSelected ? (
                    <View className="w-2.5 h-2.5 rounded-full bg-white" />
                  ) : null}
                </View>
                <Text
                  className="text-base font-medium"
                  style={{ color: nameColor }}
                >
                  {modName}
                </Text>
              </View>
              {mod.price > 0 ? (
                <Text
                  className="text-sm font-bold"
                  style={{ color: colors.foreground }}
                >
                  +{formatPrice(mod.price)}
                </Text>
              ) : (
                <Text
                  className="text-xs"
                  style={{ color: colors.mutedForeground }}
                >
                  {language === "tr" ? "Ücretsiz" : "Free"}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
export const ModifierGroupSection = memo(ModifierGroupSectionBase);

export function SegmentedControl<
  T extends {
    id: string;
    name: string;
    nameEn?: string;
    price?: number;
    priceAdjustment?: number;
  },
>({
  options,
  selectedId,
  onSelect,
  showPrice = true,
  language = "tr",
}: {
  options: T[];
  selectedId: string;
  onSelect: (option: T) => void;
  showPrice?: boolean;
  language?: Language;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row gap-2 flex-wrap">
      {options.map((option) => {
        const isActive = option.id === selectedId;
        const label =
          language === "en" && option.nameEn ? option.nameEn : option.name;
        const optionPrice =
          option.priceAdjustment != null && option.priceAdjustment > 0
            ? option.priceAdjustment
            : option.price;

        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option)}
            className="flex-row items-center gap-1.5 h-[44px] px-4 rounded-full border-2"
            style={{
              backgroundColor: isActive ? colors.primary : colors.card,
              borderColor: isActive ? colors.primary : colors.border,
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
          >
            <Text
              className="text-sm font-semibold"
              style={{
                color: isActive ? colors.primaryForeground : colors.foreground,
              }}
            >
              {label}
            </Text>
            {showPrice &&
            optionPrice != null &&
            optionPrice > 0 &&
            !isActive ? (
              <Text
                className="text-xs font-bold"
                style={{ color: colors.mutedForeground }}
              >
                {option.priceAdjustment != null && option.priceAdjustment > 0
                  ? "+"
                  : ""}
                {formatPrice(optionPrice)}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export interface ProductDetailFormSectionsProps {
  product: Product;
  language: Language;
  selectedUnitId: string;
  setSelectedUnitId: (id: string) => void;
  selectedVariantId: string;
  setSelectedVariantId: (id: string) => void;
  selectedModifiers: Record<string, string[]>;
  handleModifierToggle: (groupId: string, modifierId: string) => void;
  quantity?: number;
  onDecrease?: () => void;
  onIncrease?: () => void;
  totalPrice?: number;
  listPrice?: number;
  footer?: React.ReactNode;
  showDescription?: boolean;
  afterDescription?: React.ReactNode;
  /** Birim seçimi SegmentedControl (false ise dışarıda tablo vb. gösterilir) */
  showUnitSelection?: boolean;
  /** Adet seçici ve sepete ekle alanını gizler */
  showCartSection?: boolean;
  /** Adet satırını açıklamanın üstüne taşır */
  quantityBeforeDescription?: boolean;
  /** Alerjen bölümünü göster */
  showAllergensSection?: boolean;
  /** Ekstra / modifier bölümünü göster */
  showModifiersSection?: boolean;
  /** Adet 0 iken ekstra seçimini kapatır */
  modifiersDisabled?: boolean;
}

export function ProductDetailQuantityRow({
  quantity,
  onDecrease,
  onIncrease,
  language = "tr",
}: {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  language?: Language;
}) {
  const { colors } = useTheme();
  const label = language === "tr" ? "Adet" : "Quantity";

  return (
    <View className="flex-row items-center justify-between">
      <Text
        className="text-base font-bold"
        style={{ color: colors.foreground }}
      >
        {label}
      </Text>
      <QuantitySelector
        quantity={quantity}
        onDecrease={onDecrease}
        onIncrease={onIncrease}
        min={0}
        language={language}
      />
    </View>
  );
}

export function ProductDetailFormSections({
  product,
  language,
  selectedUnitId,
  setSelectedUnitId,
  selectedVariantId,
  setSelectedVariantId,
  selectedModifiers,
  handleModifierToggle,
  quantity,
  onDecrease,
  onIncrease,
  footer,
  showDescription = true,
  afterDescription,
  showUnitSelection = true,
  showCartSection = true,
  quantityBeforeDescription = false,
  showAllergensSection = true,
  showModifiersSection = true,
  modifiersDisabled = false,
}: ProductDetailFormSectionsProps) {
  const { colors } = useTheme();
  const displayDescription =
    language === "en" && product.descriptionEn
      ? product.descriptionEn
      : product.description;
  const selectableUnits = useMemo(
    () => getSelectableProductUnits(product),
    [product],
  );

  const t = {
    unit: language === "tr" ? "Birim Seçimi" : "Select Unit",
    variant: language === "tr" ? "Varyant" : "Variant",
    description: language === "tr" ? "Açıklama" : "Description",
    allergens: language === "tr" ? "Alerjen Uyarıları" : "Allergen Warnings",
    extras: language === "tr" ? "Ekstralar" : "Extras",
    quantity: language === "tr" ? "Adet" : "Quantity",
  };

  const quantitySection = showCartSection ? (
    <ProductDetailQuantityRow
      quantity={quantity ?? 1}
      onDecrease={onDecrease ?? (() => {})}
      onIncrease={onIncrease ?? (() => {})}
      language={language}
    />
  ) : null;

  const descriptionSection =
    showDescription && displayDescription ? (
      <View>
        <Text
          className="text-base font-bold mb-2"
          style={{ color: colors.foreground }}
        >
          {t.description}
        </Text>
        <Text
          className="text-sm leading-relaxed"
          style={{ color: colors.mutedForeground }}
        >
          {displayDescription}
        </Text>
      </View>
    ) : null;

  const footerSection =
    showCartSection && footer ? (
      <View className="pt-2 pb-4">{footer}</View>
    ) : null;

  return (
    <View className="gap-5">
      {showUnitSelection && hasSelectableProductUnits(product) ? (
        <View>
          <Text
            className="text-base font-bold mb-3"
            style={{ color: colors.foreground }}
          >
            {t.unit}
          </Text>
          <SegmentedControl
            options={selectableUnits}
            selectedId={selectedUnitId}
            onSelect={(unit) => setSelectedUnitId(unit.id)}
            language={language}
          />
        </View>
      ) : null}

      {product.variants.length > 0 ? (
        <View>
          <Text
            className="text-base font-bold mb-3"
            style={{ color: colors.foreground }}
          >
            {t.variant}
          </Text>
          <SegmentedControl
            options={product.variants}
            selectedId={selectedVariantId}
            onSelect={(variant) => setSelectedVariantId(variant.id)}
            showPrice
            language={language}
          />
        </View>
      ) : null}

      {quantityBeforeDescription && quantitySection ? (
        <>
          <View className="h-px" style={{ backgroundColor: colors.border }} />
          {quantitySection}
        </>
      ) : null}

      {descriptionSection ? (
        <>
          <View className="h-px" style={{ backgroundColor: colors.border }} />
          {descriptionSection}
          {afterDescription}
        </>
      ) : afterDescription ? (
        <>
          <View className="h-px" style={{ backgroundColor: colors.border }} />
          {afterDescription}
        </>
      ) : null}

      {showAllergensSection &&
      product.isAllergenic &&
      product.allergens.length > 0 ? (
        <View>
          <View className="flex-row items-center gap-2 mb-3">
            <AlertTriangle
              size={18}
              color={colors.destructive}
              strokeWidth={2}
            />
            <Text
              className="text-base font-bold"
              style={{ color: colors.foreground }}
            >
              {t.allergens}
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {product.allergens.map((allergen) => (
              <AllergenChip key={allergen.id} allergen={allergen} />
            ))}
          </View>
        </View>
      ) : null}

      {showModifiersSection && product.modifierGroups.length > 0 ? (
        <>
          <View className="h-px" style={{ backgroundColor: colors.border }} />
          <View>
            <Text
              className="text-lg font-bold mb-4"
              style={{ color: colors.foreground }}
            >
              {t.extras}
            </Text>
            <View className="gap-5">
              {product.modifierGroups.map((group) => (
                <ModifierGroupSection
                  key={group.id}
                  group={group}
                  selectedIds={selectedModifiers[group.id] ?? []}
                  onToggle={(modId) => {
                    if (modifiersDisabled) return;
                    handleModifierToggle(group.id, modId);
                  }}
                  language={language}
                  disabled={modifiersDisabled}
                />
              ))}
            </View>
          </View>
        </>
      ) : null}

      {!quantityBeforeDescription && showCartSection ? (
        <View className="pt-2 pb-4">
          {quantitySection}
          {footer}
        </View>
      ) : (
        footerSection
      )}
    </View>
  );
}

function formatProductCaloriesLabel(
  calories: number | null | undefined,
): string | null {
  if (calories == null || !Number.isFinite(calories) || calories <= 0) {
    return null;
  }
  return `${Math.round(calories)} kCal`;
}

export function ProductCaloriesLabel({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  const { colors } = useTheme();
  const label = formatProductCaloriesLabel(product.nutritionalInfo?.calories);
  if (!label) return null;

  return (
    <Text
      className={`font-bold ${className || ""}`}
      style={{ color: colors.success }}
    >
      {label}
    </Text>
  );
}
