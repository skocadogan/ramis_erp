// ============================================================
// Stock Man — New Supplier
//
// Simple form for creating a supplier. Only `name` is required;
// contact fields are optional.
// ============================================================

import React, { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { Truck } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useI18n } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import { useCreateSupplier } from "@/hooks/useSuppliers";
import { extractApiError } from "@/utils/apiError";

export default function NewSupplierScreen() {
  const { t } = useI18n();
  const toast = useToast();
  const createSupplier = useCreateSupplier();

  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const canSubmit =
    name.trim().length > 0 && !createSupplier.isPending;

  const onSubmit = useCallback(() => {
    if (!canSubmit) return;

    const payload: {
      name: string;
      contact_person?: string;
      phone?: string;
      email?: string;
      address?: string;
      notes?: string;
    } = { name: name.trim() };

    if (contactPerson.trim()) payload.contact_person = contactPerson.trim();
    if (phone.trim()) payload.phone = phone.trim();
    if (email.trim()) payload.email = email.trim();
    if (address.trim()) payload.address = address.trim();
    if (notes.trim()) payload.notes = notes.trim();

    createSupplier.mutate(payload, {
      onSuccess: (supplier) => {
        toast.success(t("supplier.createSuccess"));
        router.replace(`/(main)/supplier/${supplier.id}`);
      },
      onError: (err: unknown) => {
        toast.error(extractApiError(err, t("supplier.createError")));
      },
    });
  }, [
    canSubmit,
    name,
    contactPerson,
    phone,
    email,
    address,
    notes,
    createSupplier,
    t,
    toast,
  ]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen padded={false} bottomSafe>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <View className="px-4 pt-2">
            <Header
              title={t("supplier.add")}
              subtitle={t("supplier.formHint")}
              back
              onBackPress={() => router.back()}
            />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
          >
            <Card>
              <Text className="text-caption text-muted-foreground font-semibold uppercase mb-3">
                {t("common.required")}
              </Text>
              <Input
                label={t("supplier.name")}
                placeholder={t("supplier.name")}
                value={name}
                onChangeText={setName}
                required
                autoCapitalize="words"
              />
            </Card>

            <View className="mt-4">
              <Card>
                <Text className="text-caption text-muted-foreground font-semibold uppercase mb-3">
                  {t("supplier.contact")} · {t("common.optional")}
                </Text>
                <View className="gap-4">
                  <Input
                    label={t("supplier.contactPerson")}
                    placeholder={t("supplier.contactPerson")}
                    value={contactPerson}
                    onChangeText={setContactPerson}
                  />
                  <Input
                    label={t("supplier.phone")}
                    placeholder={t("supplier.phone")}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                  <Input
                    label={t("supplier.email")}
                    placeholder={t("supplier.email")}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <Input
                    label={t("supplier.address")}
                    placeholder={t("supplier.address")}
                    value={address}
                    onChangeText={setAddress}
                  />
                  <Input
                    label={t("purchase.notes")}
                    placeholder={t("purchase.notes")}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                  />
                </View>
              </Card>
            </View>

            <View className="mt-6">
              <Button
                variant="primary"
                fullWidth
                loading={createSupplier.isPending}
                disabled={!canSubmit}
                leftIcon={Truck}
                onPress={onSubmit}
              >
                {t("common.save")}
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    </>
  );
}
