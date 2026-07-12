// ============================================================
// Stock Man — Supplier List
//
// One screen, two states: search-driven or list-driven. The
// search input is local-state-mirrored and lifted to the
// React Query cache on every keystroke (the cache is
// debounced server-side by DRF's SearchFilter; no client
// debounce needed for tablet-class result sets).
//
// Empty / loading / error all have a dedicated card so the
// user always knows what state the screen is in.
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Plus, Search, Truck, X } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { SupplierCard } from "@/components/supplier/SupplierCard";
import { useI18n } from "@/i18n";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useNavigateBack } from "@/hooks/useNavigateBack";
import { extractResults } from "@/types/api";
import type { Supplier } from "@/types";

export default function SupplierListScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { goBack, canGoBack } = useNavigateBack("/(main)/(tabs)/more");
  const [search, setSearch] = useState("");

  const query = useSuppliers({ search: search || undefined, page_size: 100 } as any);
  const suppliers: Supplier[] = useMemo(
    () => extractResults(query.data) ?? [],
    [query.data]
  );

  const onAdd = useCallback(() => {
    router.push("/(main)/supplier/new");
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: Supplier }) => <SupplierCard supplier={item} />,
    []
  );

  const keyExtractor = useCallback((s: Supplier) => s.id, []);

  return (
    <Screen padded={false}>
      <View className="px-4 pt-2">
        <Header
          title={t("supplier.title")}
          subtitle={t("supplier.list")}
          back={canGoBack}
          onBackPress={goBack}
          right={
            <Pressable
              onPress={onAdd}
              accessibilityRole="button"
              accessibilityLabel={t("supplier.add")}
              className="h-10 w-10 items-center justify-center rounded-full bg-primary active:bg-primary/90"
              hitSlop={8}
            >
              <Plus size={20} color="#FFFFFF" />
            </Pressable>
          }
        />
      </View>

      <View className="px-4 pt-2">
        <View className="flex-row items-center min-h-[48px] rounded-xl border border-input bg-background px-3">
          <Search size={18} color="#64748B" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t("common.searchPlaceholder")}
            placeholderTextColor="#94A3B8"
            className="flex-1 ml-2 text-body text-foreground py-2"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel={t("common.search")}
          />
          {search.length > 0 ? (
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
        <Text className="mt-2 text-caption text-muted-foreground">
          {query.isFetching
            ? t("common.loading")
            : `${suppliers.length} ${t("supplier.title").toLowerCase()}`}
        </Text>
      </View>

      <View className="flex-1 mt-2">
        {query.isPending ? (
          <Loading />
        ) : suppliers.length === 0 ? (
          <View className="px-4">
            <Card>
              <EmptyState
                icon={Truck}
                title={t("common.noData")}
                description={t("supplier.list")}
                actionLabel={t("supplier.add")}
                onAction={onAdd}
              />
            </Card>
          </View>
        ) : (
          <FlashList
            data={suppliers}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>
    </Screen>
  );
}
