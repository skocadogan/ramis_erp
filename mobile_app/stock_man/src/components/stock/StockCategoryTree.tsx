import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Search,
  Tag,
  X,
} from "lucide-react-native";
import { Chip } from "@/components/ui/Chip";
import { useI18n } from "@/i18n";
import {
  buildCategoryTree,
  collectExpandableIds,
  filterCategoriesForTree,
  type CategoryTreeNode,
} from "@/lib/stock/categoryTree";
import { cn } from "@/utils/cn";
import type { StockCategory, UUID } from "@/types";

export interface StockCategoryTreeProps {
  categories: StockCategory[];
  selectedId?: UUID | null;
  onSelect: (id: UUID | null) => void;
  maxHeight?: number;
  /** Hide the section heading when embedded in a modal. */
  showHeading?: boolean;
}

export function StockCategoryTree({
  categories,
  selectedId,
  onSelect,
  maxHeight = 220,
  showHeading = true,
}: StockCategoryTreeProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<UUID>>(new Set());

  const filteredCategories = useMemo(
    () => filterCategoriesForTree(categories, search),
    [categories, search]
  );

  const tree = useMemo(
    () => buildCategoryTree(filteredCategories),
    [filteredCategories]
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (search.trim()) {
      setExpanded(collectExpandableIds(filteredCategories));
    } else {
      setExpanded(
        new Set(tree.filter((n) => n.children.length > 0).map((n) => n.id))
      );
    }
  }, [search, filteredCategories, tree]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleExpanded = useCallback((id: UUID) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const renderNode = (node: CategoryTreeNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const isSelected = selectedId === node.id;

    return (
      <View key={node.id}>
        <View
          className={cn(
            "flex-row items-center min-h-[40px] rounded-lg active:opacity-80",
            isSelected && "bg-primary/10"
          )}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          {hasChildren ? (
            <Pressable
              onPress={() => toggleExpanded(node.id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? t("common.collapse") : t("common.expand")}
              className="h-7 w-7 items-center justify-center mr-1"
            >
              {isExpanded ? (
                <ChevronDown size={16} color="#64748B" />
              ) : (
                <ChevronRight size={16} color="#64748B" />
              )}
            </Pressable>
          ) : (
            <View className="w-7 mr-1" />
          )}

          <Pressable
            onPress={() => onSelect(isSelected ? null : node.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className="flex-1 flex-row items-center min-h-[40px] active:opacity-80"
          >
            {hasChildren ? (
              isExpanded ? (
                <FolderOpen size={16} color={isSelected ? "#1E40AF" : "#64748B"} />
              ) : (
                <Folder size={16} color={isSelected ? "#1E40AF" : "#64748B"} />
              )
            ) : (
              <Tag size={14} color={isSelected ? "#1E40AF" : "#64748B"} />
            )}

            <View className="flex-1 min-w-0 ml-2">
              <Text
                className={cn(
                  "text-body",
                  isSelected ? "text-primary font-semibold" : "text-foreground"
                )}
                numberOfLines={1}
              >
                {node.name}
              </Text>
              {node.code ? (
                <Text className="text-caption text-muted-foreground" numberOfLines={1}>
                  {node.code}
                </Text>
              ) : null}
            </View>
          </Pressable>
        </View>

        {hasChildren && isExpanded
          ? node.children.map((child) => renderNode(child, depth + 1))
          : null}
      </View>
    );
  };

  return (
    <View className={showHeading ? "mt-3" : undefined}>
      {showHeading ? (
        <Text className="text-caption text-muted-foreground font-semibold uppercase mb-2">
          {t("stock.categories")}
        </Text>
      ) : null}

      <View className="flex-row items-center min-h-[44px] rounded-xl border border-input bg-background px-3">
        <Search size={16} color="#64748B" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("stock.searchCategories")}
          placeholderTextColor="#94A3B8"
          accessibilityLabel={t("stock.searchCategories")}
          className="flex-1 ml-2 text-body text-foreground py-2"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search ? (
          <Pressable
            onPress={() => setSearch("")}
            accessibilityRole="button"
            accessibilityLabel={t("common.clear")}
            className="p-1 rounded-md active:bg-muted"
            hitSlop={8}
          >
            <X size={16} color="#64748B" />
          </Pressable>
        ) : null}
      </View>

      <View className="mt-2 mb-1">
        <Chip
          label={t("stock.allCategories")}
          selected={!selectedId}
          onPress={() => onSelect(null)}
          size="sm"
          variant="default"
        />
      </View>

      {categories.length === 0 ? (
        <Text className="text-caption text-muted-foreground py-2">
          {t("common.noData")}
        </Text>
      ) : tree.length === 0 ? (
        <Text className="text-caption text-muted-foreground py-2">
          {t("common.noData")}
        </Text>
      ) : (
        <View style={{ maxHeight }} className="min-h-0 overflow-hidden">
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            bounces={false}
          >
            {tree.map((node) => renderNode(node, 0))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

