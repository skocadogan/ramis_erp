// ============================================================
// Stock Man — Supplier Card
//
// List-item representation of a supplier. Shows the supplier
// name, contact person, phone + email with icons, and an
// optional stock-item count badge.
//
// Phone and email are not gated by RBAC here (the supplier
// list endpoint already requires `inventory.view_supplier`);
// the supplier *detail* screen hides them for unprivileged
// users via the `usePermission` hook.
// ============================================================

import React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { routes } from "@/navigation/routes";
import { ChevronRight, Mail, Phone, Truck, User } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/utils/cn";
import type { Supplier } from "@/types";

export interface SupplierCardProps {
  supplier: Supplier;
  itemCount?: number;
}

export function SupplierCard({ supplier, itemCount }: SupplierCardProps) {
  const router = useRouter();

  const onPress = () => {
    router.push(routes.supplier.detail(supplier.id));
  };

  return (
    <Card onPress={onPress} variant="elevated" className="mb-3">
      <View className="flex-row items-start">
        <View className="h-11 w-11 items-center justify-center rounded-lg bg-primary/10 mr-3">
          <Truck size={20} color="#1E40AF" />
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center">
            <Text
              className="flex-1 text-h3 text-foreground"
              numberOfLines={1}
            >
              {supplier.name}
            </Text>
            {typeof itemCount === "number" && itemCount > 0 ? (
              <Badge
                variant="info"
                size="sm"
                label={String(itemCount)}
                className="ml-2"
              />
            ) : null}
            <ChevronRight
              size={18}
              color="#94A3B8"
              style={{ marginLeft: 6 }}
            />
          </View>

          {supplier.contact_person ? (
            <View className="flex-row items-center mt-1">
              <User size={12} color="#64748B" />
              <Text
                className="ml-1.5 text-caption text-muted-foreground"
                numberOfLines={1}
              >
                {supplier.contact_person}
              </Text>
            </View>
          ) : null}

          {supplier.phone ? (
            <View className="flex-row items-center mt-0.5">
              <Phone size={12} color="#64748B" />
              <Text
                className="ml-1.5 text-caption text-foreground text-mono"
                numberOfLines={1}
              >
                {supplier.phone}
              </Text>
            </View>
          ) : null}

          {supplier.email ? (
            <View className="flex-row items-center mt-0.5">
              <Mail size={12} color="#64748B" />
              <Text
                className={cn(
                  "ml-1.5 text-caption text-foreground",
                  "flex-1"
                )}
                numberOfLines={1}
              >
                {supplier.email}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

