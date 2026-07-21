// ============================================================
// Stock Man — Login screen (P0)
//
// Polished, tablet-first sign-in:
//   - Brand banner at top
//   - Language switcher (top-right)
//   - Server URL, username, password fields
//   - "Save this server" toggle
//   - Saved logins modal (quick fill — waiter parity)
//   - Submit calls useAuthStore.login(); on success the (main)
//     layout's auth guard routes us to the tabs.
// ============================================================

import React, { useCallback, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  ChevronDown,
  Lock,
  Server,
  Trash2,
  User as UserIcon,
  Eye,
  EyeOff,
  Fingerprint,
} from "lucide-react-native";
import Constants from "expo-constants";
import * as LocalAuthentication from "expo-local-authentication";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useI18n, LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type Language } from "@/i18n";
import { useAuthStore, type SavedServer } from "@/store/useAuthStore";
import { cn } from "@/utils/cn";
import { useResponsive } from "@/hooks/useResponsive";
import { Image } from "expo-image";
const formatServerUrl = (raw: string) => raw.trim().replace(/\/+$/, "");

export default function LoginScreen() {
  const router = useRouter();
  const { t, language, setLanguage } = useI18n();
  const { isTablet } = useResponsive();

  const initialServer = useAuthStore((s) => s.serverUrl ?? "");
  const savedServers = useAuthStore((s) => s.savedServers);
  const isLoading = useAuthStore((s) => s.isLoading);
  const errorFromStore = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const loginWithBiometrics = useAuthStore((s) => s.loginWithBiometrics);
  const hasBiometricCredentials = useAuthStore((s) => s.hasBiometricCredentials);
  const removeSavedServer = useAuthStore((s) => s.removeSavedServer);

  const [serverUrl, setServerUrl] = useState(initialServer);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [serverPickerOpen, setServerPickerOpen] = useState(false);

  const handleBiometricAuth = useCallback(async () => {
    setBiometricLoading(true);
    setLocalError(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t("auth.biometricPrompt"),
        fallbackLabel: t("auth.biometricFallback"),
      });
      if (!result.success) {
        setBiometricLoading(false);
        return;
      }
      await loginWithBiometrics();
      router.replace("/(main)/(tabs)");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("auth.loginError");
      setLocalError(message);
      setBiometricLoading(false);
    }
  }, [t, loginWithBiometrics, router]);

  React.useEffect(() => {
    async function checkBiometrics() {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const canUseBiometrics = hasHardware && isEnrolled;
      setHasBiometrics(canUseBiometrics);

      if (canUseBiometrics && hasBiometricCredentials && !useAuthStore.getState().isAuthenticated) {
        handleBiometricAuth();
      }
    }
    checkBiometrics();
  }, [handleBiometricAuth, hasBiometricCredentials]);

  const error = localError || errorFromStore;

  const onSubmit = async () => {
    setLocalError(null);
    const url = formatServerUrl(serverUrl);
    if (!url || !username.trim() || !password) {
      setLocalError(t("auth.validationError"));
      return;
    }
    if (url.startsWith("http://")) {
      console.warn(
        "[Login] HTTP API kullanılıyor. Mümkünse HTTPS tercih edin (LAN dışı MITM riski)."
      );
    }
    try {
      await login(url, username.trim(), password, rememberMe);
      router.replace("/(main)/(tabs)");
    } catch (e: any) {
      setLocalError(e?.message ?? t("auth.loginError"));
    }
  };

  const handleSelectServer = useCallback((server: SavedServer) => {
    setServerUrl(server.url);
    setUsername(server.username);
    setPassword("");
    setServerPickerOpen(false);
    setLocalError(null);
  }, []);

  const handleDeleteServer = useCallback(
    async (url: string) => {
      await removeSavedServer(url);
    },
    [removeSavedServer]
  );

  const openServerPicker = useCallback(() => {
    if (savedServers.length > 0) {
      setServerPickerOpen(true);
    }
  }, [savedServers.length]);

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
          className="bg-background"
        >
          <View className={cn("flex-1 px-4 pt-8", isTablet && "px-12")}>
            <View className="flex-row justify-end mb-6">
              <View className="flex-row gap-2">
                {SUPPORTED_LANGUAGES.map((lng: Language) => (
                  <Chip
                    key={lng}
                    label={LANGUAGE_LABELS[lng]}
                    selected={language === lng}
                    onPress={() => setLanguage(lng)}
                    size="sm"
                    variant="primary"
                  />
                ))}
              </View>
            </View>

            <View className="items-center mb-8">
            <Image
                source={require("../../assets/icon.png")}
                style={{ width: 192, height: 192 }}
                contentFit="contain"
                cachePolicy="memory"
              />
              <Text className="text-h1 text-foreground">{t("app.name")}</Text>
              <Text className="mt-1 text-caption text-muted-foreground">
                {t("app.tagline")}
              </Text>
            </View>

            <Card variant="elevated" className="mb-4">
              <Text className="text-h3 text-foreground mb-1">
                {t("auth.welcomeBack")}
              </Text>
              <Text className="text-body text-muted-foreground mb-4">
                {t("auth.welcomeDesc")}
              </Text>

              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-sm font-medium text-foreground">
                  {t("auth.serverUrl")}
                </Text>
                {savedServers.length > 0 ? (
                  <Pressable
                    onPress={openServerPicker}
                    className="flex-row items-center active:opacity-70"
                    accessibilityRole="button"
                    accessibilityLabel={t("auth.savedServers")}
                  >
                    <Server size={14} color="#64748B" />
                    <Text className="ml-1 text-xs font-semibold text-muted-foreground">
                      {t("auth.savedServers")} ({savedServers.length})
                    </Text>
                    <ChevronDown size={14} color="#64748B" />
                  </Pressable>
                ) : null}
              </View>

              <Input
                placeholder={t("auth.serverUrlPlaceholder")}
                value={serverUrl}
                onChangeText={setServerUrl}
                leftIcon={Server}
                rightIcon={savedServers.length > 0 ? ChevronDown : undefined}
                onRightIconPress={savedServers.length > 0 ? openServerPicker : undefined}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                hint={t("auth.serverUrlHelper")}
              />

              <View className="h-3" />

              <Input
                label={t("auth.username")}
                placeholder={t("auth.usernamePlaceholder")}
                value={username}
                onChangeText={setUsername}
                leftIcon={UserIcon}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View className="h-3" />

              <Input
                label={t("auth.password")}
                placeholder={t("auth.passwordPlaceholder")}
                value={password}
                onChangeText={setPassword}
                leftIcon={Lock}
                rightIcon={showPassword ? EyeOff : Eye}
                onRightIconPress={() => setShowPassword((s) => !s)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Pressable
                onPress={() => setRememberMe((v) => !v)}
                accessibilityRole="switch"
                accessibilityState={{ checked: rememberMe }}
                className="mt-3 flex-row items-center min-h-[48px]"
                hitSlop={8}
              >
                <View
                  className={cn(
                    "h-6 w-6 rounded-md border-2 items-center justify-center mr-3",
                    rememberMe
                      ? "bg-primary border-primary"
                      : "border-input bg-background"
                  )}
                >
                  {rememberMe ? (
                    <Text className="text-primary-foreground text-xs font-bold">
                      ✓
                    </Text>
                  ) : null}
                </View>
                <Text className="text-sm text-foreground">
                  {t("auth.rememberMe")}
                </Text>
              </Pressable>

              {error ? (
                <Text className="mt-3 text-sm text-destructive">{error}</Text>
              ) : null}

              <View className="mt-5">
                <Button
                  fullWidth
                  size="lg"
                  loading={isLoading}
                  onPress={onSubmit}
                >
                  {isLoading ? t("auth.loggingIn") : t("auth.login")}
                </Button>
              </View>

            </Card>

            {hasBiometrics && hasBiometricCredentials ? (
              <View className="mb-4">
                <Button
                  variant="outline"
                  fullWidth
                  leftIcon={Fingerprint}
                  loading={biometricLoading}
                  onPress={handleBiometricAuth}
                >
                  {t("auth.biometricPrompt")}
                </Button>
              </View>
            ) : null}

            <View className="items-center mt-auto pt-6 mb-6">
              <Text className="text-caption text-muted-foreground">
                {t("app.companyName")} · v{Constants.expoConfig?.version ?? "1.0.0"}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={serverPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setServerPickerOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/60 justify-end"
          onPress={() => setServerPickerOpen(false)}
        >
          <Pressable
            className="bg-card rounded-t-2xl px-6 pt-6 pb-10 border-t border-border"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-h3 text-foreground">
                {t("auth.savedServers")}
              </Text>
              <Pressable
                onPress={() => setServerPickerOpen(false)}
                className="h-8 w-8 rounded-lg bg-muted items-center justify-center active:opacity-70"
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
              >
                <Text className="text-foreground font-bold text-base leading-none">
                  ✕
                </Text>
              </Pressable>
            </View>

            {savedServers.length === 0 ? (
              <View className="py-8 items-center">
                <Text className="text-sm text-muted-foreground">
                  {t("auth.noSavedServers")}
                </Text>
              </View>
            ) : (
              <FlatList
                data={savedServers}
                keyExtractor={(item) => item.url}
                style={{ maxHeight: 360 }}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => (
                  <View className="h-px bg-border mx-1" />
                )}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleSelectServer(item)}
                    className="flex-row items-center py-4 px-2 active:bg-muted rounded-xl"
                    accessibilityRole="button"
                    accessibilityLabel={`${item.url}, ${item.username}`}
                  >
                    <View className="h-10 w-10 bg-primary/10 rounded-lg items-center justify-center mr-3 shrink-0">
                      <Server size={18} color="#1E40AF" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text
                        className="text-sm font-bold text-foreground"
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        {item.url}
                      </Text>
                      <Text className="text-xs text-muted-foreground mt-0.5">
                        {item.username}
                      </Text>
                    </View>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        void handleDeleteServer(item.url);
                      }}
                      className="h-9 w-9 rounded-lg bg-destructive/10 items-center justify-center ml-2 active:opacity-70 shrink-0"
                      accessibilityRole="button"
                      accessibilityLabel={t("auth.deleteServer")}
                    >
                      <Trash2 size={16} color="#DC2626" />
                    </Pressable>
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
