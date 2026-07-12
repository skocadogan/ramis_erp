import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Modal,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Lock, User, Eye, EyeOff, Globe, ChevronDown, Trash2, Server } from "lucide-react-native";
import axios from "axios";
import apiClient, { resetApiBaseURLToDefault, setApiBaseURL } from "../../src/api/client";
import * as SecureStore from "expo-secure-store";
import { useAuthStore } from "../../src/store/useAuthStore";
import { usePosStore, applyWaiterScreenPreferences } from "../../src/store/usePosStore";
import { useI18n } from "../../src/i18n";

/** SecureStore anahtarı — kayıtlı sunucu listesi (JSON array). */
const SAVED_SERVERS_KEY = "saved_servers";

interface SavedServer {
  url: string;
  username: string;
  /** Şifre SecureStore'da tutulur — güvenlik notu: cihaz şifrelemesi aktifken güvenlidir. */
  password: string;
}

async function loadSavedServers(): Promise<SavedServer[]> {
  try {
    const raw = await SecureStore.getItemAsync(SAVED_SERVERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedServer[];
  } catch {
    return [];
  }
}

async function persistSavedServers(list: SavedServer[]): Promise<void> {
  await SecureStore.setItemAsync(SAVED_SERVERS_KEY, JSON.stringify(list));
}

/** Başarılı giriş sonrası sunucuyu listeye ekler/günceller. */
async function upsertSavedServer(url: string, username: string, password: string): Promise<void> {
  const list = await loadSavedServers();
  const idx = list.findIndex((s) => s.url === url);
  if (idx >= 0) {
    list[idx] = { url, username, password };
  } else {
    list.unshift({ url, username, password });
  }
  await persistSavedServers(list);
}

// ---------------------------------------------------------------------------

export default function LoginScreen() {
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedServers, setSavedServers] = useState<SavedServer[]>([]);
  const [serverPickerOpen, setServerPickerOpen] = useState(false);

  const router = useRouter();
  const { t } = useI18n();
  const login = useAuthStore((state) => state.login);

  // Kayıtlı sunucu listesi yalnızca picker için; otomatik bağlantı veya URL önizlemesi yok.
  useEffect(() => {
    resetApiBaseURLToDefault();
    void loadSavedServers().then(setSavedServers);
  }, []);

  /** Listeden seçim yalnızca formu doldurur; API/WS bağlantısı Giriş ile başlar. */
  const handleSelectServer = useCallback((server: SavedServer) => {
    setServerUrl(server.url);
    setUsername(server.username);
    setPassword(server.password);
    setServerPickerOpen(false);
    setError(null);
  }, []);

  /** Kayıtlı sunucuyu listeden sil. */
  const handleDeleteServer = useCallback(async (url: string) => {
    const updated = savedServers.filter((s) => s.url !== url);
    setSavedServers(updated);
    await persistSavedServers(updated);
  }, [savedServers]);

  const handleLogin = async () => {
    if (!serverUrl.trim()) {
      setError(t("auth.serverUrlRequired"));
      return;
    }
    if (!username || !password) {
      setError(t("auth.validationError"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const formattedUrl = serverUrl.trim();
      setApiBaseURL(formattedUrl);

      const response = await apiClient.post("/auth/token/", { username, password });
      const { access } = response.data;

      if (rememberMe) {
        await SecureStore.setItemAsync("server_url", formattedUrl);
        await upsertSavedServer(formattedUrl, username, password);
        setSavedServers(await loadSavedServers());
      }

      // Geçici token (persist: false) — /auth/me/ için gerekli
      await login({ username } as any, access, false);

      const meRes = await apiClient.get("/auth/me/");
      const u = meRes.data;

      const resolvedBranchId =
        u.branch != null && String(u.branch).trim() !== ""
          ? String(u.branch)
          : u.available_branches?.[0]?.id != null
            ? String(u.available_branches[0].id)
            : "";

      usePosStore.getState().setActiveBranchId(resolvedBranchId || null);

      try {
        const prefsRes = await apiClient.get("/auth/me/pos-screen-preferences/", {
          params: { context: "waiter" },
        });
        const p = prefsRes.data?.preferences as Record<string, unknown> | undefined;
        applyWaiterScreenPreferences(p);
        const uuid = p?.assigned_pos_terminal_uuid;
        const code = p?.assigned_terminal_code;
        if (uuid && code) {
          usePosStore.getState().setTerminal(String(code), String(uuid));
          void usePosStore.getState().syncStockTrackingModeFromTerminal(String(uuid));
        }
      } catch {
        /* sunucuda terminal tercihi yok */
      }

      await login({
        id: u.id,
        username: u.username,
        fullName: [u.first_name, u.last_name].map((s) => String(s || "").trim()).filter(Boolean).join(" ") || u.username,
        role: u.role_names?.[0] || "staff",
        branchId: resolvedBranchId,
        branchName: u.branch_name ? String(u.branch_name) : undefined,
      }, access, rememberMe);

      router.replace("/(main)");
    } catch (err) {
      console.error("Login error:", err);
      if (axios.isAxiosError(err)) {
        if (err.response) {
          setError((err.response.data as { detail?: string })?.detail || t("auth.generalError"));
        } else {
          setError(t("auth.serverError"));
        }
      } else {
        setError(t("auth.generalError"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <>
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}
        className="flex-1 bg-background"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24 }}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View className="items-center pt-16 pb-12">
            <View className="w-32 h-32 items-center justify-center mb-6">
              <Image
                source={require("../../assets/adaptive-icon.png")}
                style={{ width: 192, height: 192 }}
                contentFit="contain"
                cachePolicy="memory"
              />
            </View>
            <Text className="text-foreground text-2xl font-bold">{t("auth.waiterLogin")}</Text>
           
          </View>

          <View className="space-y-4">
            {/* Hata mesajı */}
            {error ? (
              <View className="bg-destructive/10 p-4 rounded-xl mb-2 border border-destructive/20">
                <Text className="text-destructive text-sm text-center">{error}</Text>
              </View>
            ) : null}

            {/* ── Sunucu Adresi ── */}
            <View className="py-1">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-foreground font-medium">{t("auth.serverUrl")}</Text>
                {savedServers.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setServerPickerOpen(true)}
                    className="flex-row items-center gap-1"
                    activeOpacity={0.7}
                  >
                    <Server size={14} color="#71717a" />
                    <Text className="text-muted-foreground text-xs font-semibold ml-1">
                      {t("auth.savedServers")} ({savedServers.length})
                    </Text>
                    <ChevronDown size={14} color="#71717a" />
                  </TouchableOpacity>
                )}
              </View>

              <View className="flex-row items-center bg-card border border-border rounded-xl px-4 h-14">
                <Globe size={20} color="#71717a" />
                <TextInput
                  className="flex-1 ml-3 text-foreground"
                  placeholder={t("auth.serverUrlPlaceholder")}
                  placeholderTextColor="#a1a1aa"
                  value={serverUrl}
                  onChangeText={(v) => { setServerUrl(v); setError(null); }}
                  autoCapitalize="none"
                  keyboardType="url"
                  editable={!isLoading}
                  returnKeyType="next"
                />
                {savedServers.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setServerPickerOpen(true)}
                    className="p-2"
                    accessibilityLabel={t("auth.savedServers")}
                  >
                    <ChevronDown size={20} color="#71717a" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* ── Kullanıcı Adı ── */}
            <View className="py-1 mt-2">
              <Text className="text-foreground font-medium mb-2">{t("auth.username")}</Text>
              <View className="flex-row items-center bg-card border border-border rounded-xl px-4 h-14">
                <User size={20} color="#71717a" />
                <TextInput
                  className="flex-1 ml-3 text-foreground"
                  placeholder={t("auth.usernamePlaceholder")}
                  placeholderTextColor="#a1a1aa"
                  value={username}
                  onChangeText={(v) => { setUsername(v); setError(null); }}
                  autoCapitalize="none"
                  editable={!isLoading}
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* ── Şifre ── */}
            <View className="mt-4">
              <Text className="text-foreground font-medium mb-2">{t("auth.password")}</Text>
              <View className="flex-row items-center bg-card border border-border rounded-xl px-4 h-14">
                <Lock size={20} color="#71717a" />
                <TextInput
                  className="flex-1 ml-3 text-foreground"
                  placeholder={t("auth.passwordPlaceholder")}
                  placeholderTextColor="#a1a1aa"
                  value={password}
                  onChangeText={(v) => { setPassword(v); setError(null); }}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} className="p-2">
                  {showPassword ? <EyeOff size={20} color="#71717a" /> : <Eye size={20} color="#71717a" />}
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Beni Hatırla ── */}
            <View className="flex-row items-center mt-4 px-1">
              <TouchableOpacity
                onPress={() => setRememberMe(!rememberMe)}
                className="flex-row items-center"
                activeOpacity={0.7}
              >
                <View className={`w-6 h-6 rounded-lg border items-center justify-center mr-3 ${rememberMe ? "bg-primary border-primary" : "bg-transparent border-border"}`}>
                  {rememberMe && <View className="w-2 h-2 rounded-full bg-white" />}
                </View>
                <Text className="text-muted-foreground font-medium">{t("auth.rememberMe")}</Text>
              </TouchableOpacity>
            </View>

            {/* ── Giriş Yap ── */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={isLoading}
              className={`bg-primary h-14 rounded-xl items-center justify-center mt-8 shadow-sm ${isLoading ? "opacity-70" : ""}`}
              accessibilityRole="button"
              accessibilityLabel={t("auth.loginBtn")}
            >
              {isLoading ? (
                <ActivityIndicator color="#fafafa" />
              ) : (
                <Text className="text-primary-foreground font-bold text-lg">{t("auth.loginBtn")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Kayıtlı Sunucular Modal ── */}
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
            {/* Başlık */}
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-foreground text-base font-black tracking-tight">
                {t("auth.savedServers")}
              </Text>
              <Pressable
                onPress={() => setServerPickerOpen(false)}
                className="w-8 h-8 rounded-lg bg-secondary items-center justify-center active:opacity-70"
                accessibilityRole="button"
              >
                <Text className="text-foreground font-bold text-base leading-none">✕</Text>
              </Pressable>
            </View>

            {savedServers.length === 0 ? (
              <View className="py-8 items-center">
                <Text className="text-muted-foreground text-sm font-semibold">{t("auth.noSavedServers")}</Text>
              </View>
            ) : (
              <FlatList
                data={savedServers}
                keyExtractor={(item) => item.url}
                style={{ maxHeight: 360 }}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <View className="h-px bg-border mx-1" />}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleSelectServer(item)}
                    className="flex-row items-center py-4 px-2 active:bg-secondary rounded-xl"
                    accessibilityRole="button"
                    accessibilityLabel={item.url}
                  >
                    {/* İkon */}
                    <View className="w-10 h-10 bg-primary/10 rounded-lg items-center justify-center mr-3 shrink-0">
                      <Server size={18} color="#1E2A4A" />
                    </View>

                    {/* Bilgiler */}
                    <View className="flex-1 min-w-0">
                      <Text
                        className="text-foreground font-bold text-sm tracking-tight"
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        {item.url}
                      </Text>
                      <Text className="text-muted-foreground text-xs font-semibold mt-0.5">
                        {item.username}
                      </Text>
                    </View>

                    {/* Sil butonu */}
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        void handleDeleteServer(item.url);
                      }}
                      className="w-9 h-9 rounded-lg bg-destructive/10 dark:bg-destructive/20 items-center justify-center ml-2 active:opacity-70 shrink-0"
                      accessibilityRole="button"
                      accessibilityLabel={t("auth.deleteServer")}
                    >
                      <Trash2 size={16} color="#C53030" />
                    </Pressable>
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
