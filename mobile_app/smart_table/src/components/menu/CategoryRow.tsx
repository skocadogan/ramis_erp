// ============================================================
// Smart Table — CategoryRow Component (FlatList variant)
//
// Horizontally scrolling row of CategoryCards with FlatList
// for virtualized rendering and better scroll performance.
// ============================================================

import React, { useRef, useEffect, useCallback } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  type WithSpringConfig,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";
import { CategoryCard } from "./CategoryCard";
import type { Category, Language } from "@/types";

const SPRING_CONFIG: WithSpringConfig = {
  damping: 18,
  stiffness: 200,
  mass: 0.8,
};

const CARD_GAP = 12;
const HORIZONTAL_PADDING = 24;
const ESTIMATED_CARD_WIDTH = 100;

export interface CategoryRowProps {
  categories: Category[];
  activeCategoryId?: string | null;
  onCategoryPress?: (categoryId: string) => void;
  language?: Language;
}

export const CategoryRow = React.memo(function CategoryRow({
  categories,
  activeCategoryId,
  onCategoryPress,
  language = "tr",
}: CategoryRowProps) {
  const { colors } = useTheme();
  const flatListRef = useRef<Animated.FlatList<Category> | null>(null);
  const indicatorOffset = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const cardLayoutsRef = useRef<Map<string, { x: number; width: number }>>(
    new Map(),
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorOffset.value }],
    width: indicatorWidth.value,
  }));

  useEffect(() => {
    if (!activeCategoryId) return;
    const pos = cardLayoutsRef.current.get(activeCategoryId);
    if (pos) {
      indicatorOffset.value = withSpring(pos.x, SPRING_CONFIG);
      indicatorWidth.value = withSpring(pos.width, SPRING_CONFIG);
    }
    const idx = categories.findIndex((c) => c.id === activeCategoryId);
    if (idx >= 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: idx,
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [activeCategoryId, categories, indicatorOffset, indicatorWidth]);

  const handleCardLayout = useCallback(
    (event: LayoutChangeEvent, categoryId: string) => {
      const { x, width } = event.nativeEvent.layout;
      cardLayoutsRef.current.set(categoryId, { x, width });
      if (categoryId === activeCategoryId) {
        indicatorOffset.value = withSpring(x, SPRING_CONFIG);
        indicatorWidth.value = withSpring(width, SPRING_CONFIG);
      }
    },
    [activeCategoryId, indicatorOffset, indicatorWidth],
  );

  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const idx = categories.findIndex((c) => c.id === activeCategoryId);
        if (idx < 0) return;
        const estimateX = idx * (ESTIMATED_CARD_WIDTH + CARD_GAP);
        const scrolledX = estimateX - event.contentOffset.x;
        indicatorOffset.value = scrolledX;
      },
    },
    [categories, activeCategoryId],
  );

  const renderItem = useCallback(
    ({ item }: { item: Category }) => (
      <View onLayout={(e) => handleCardLayout(e, item.id)}>
        <CategoryCard
          category={item}
          isActive={item.id === activeCategoryId}
          language={language}
          onPress={() => onCategoryPress?.(item.id)}
        />
      </View>
    ),
    [activeCategoryId, language, onCategoryPress, handleCardLayout],
  );

  return (
    <View>
      <Animated.FlatList
        ref={flatListRef}
        horizontal
        data={categories}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingVertical: 10,
          gap: CARD_GAP,
        }}
        onScroll={scrollHandler}
        scrollEventThrottle={50}
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={4}
        windowSize={5}
      />
      {activeCategoryId && (
        <View className="px-4 mt-0.5">
          <Animated.View
            style={[
              indicatorStyle,
              {
                height: 2,
                borderRadius: 1,
                backgroundColor:
                  categories.find((c) => c.id === activeCategoryId)?.color ??
                  colors.primary,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
});
