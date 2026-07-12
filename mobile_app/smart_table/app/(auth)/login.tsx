// ============================================================
// Smart Table — Login Screen
//
// API Server URL, username, and password entry.
// On success, persists credentials and redirects to menu.
// Pattern: mobile_apps/waiter/app/(auth)/login.tsx
// ============================================================

import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Server,
  User,
  Lock,
  ChevronRight,
  History,
  Trash2,
  Wifi,
  UtensilsCrossed,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useAuthStore, type SavedServer } from "@/store/auth-store";
import {
  login as apiLogin,
  getProfile,
  testConnection,
} from "@/services/authService";
import { useUIStore } from "@/store/ui-store";
import { useDialogStore } from "@/store/dialog-store";
import { useTheme } from "@/hooks/useTheme";
import { Image } from "expo-image";

export default function LoginScreen() {
  const router = useRouter();
  const language = useUIStore((s) => s.language);
  const loginStore = useAuthStore((s) => s.login);
  const savedServers = useAuthStore((s) => s.savedServers);
  const saveServer = useAuthStore((s) => s.saveServer);
  const removeSavedServer = useAuthStore((s) => s.removeSavedServer);
  const { isDark, colors } = useTheme();

  // ── Idle Timer Deactivation ──
  const setIdleTimerActive = useUIStore((s) => s.setIdleTimerActive);
  useEffect(() => {
    setIdleTimerActive(false);
  }, [setIdleTimerActive]);

  // ── Form state ──
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSavedServers, setShowSavedServers] = useState(false);

  // ── Helpers ──
  const formatServerUrl = useCallback((url: string): string => {
    let formatted = url.trim();
    if (
      formatted &&
      !formatted.startsWith("http://") &&
      !formatted.startsWith("https://")
    ) {
      formatted = "http://" + formatted;
    }
    // Remove trailing /api or /api/v1 if user accidentally pasted full path
    formatted = formatted.replace(/\/api\/v1\/?$/, "");
    formatted = formatted.replace(/\/api\/?$/, "");
    // Remove trailing slash
    formatted = formatted.replace(/\/+$/, "");
    return formatted;
  }, []);

  // ── Handle Login ──
  const handleLogin = useCallback(async () => {
    setError(null);

    const formattedUrl = formatServerUrl(serverUrl);
    if (!formattedUrl) {
      setError(
        language === "tr" ? "Sunucu adresini girin" : "Enter server address",
      );
      return;
    }
    if (!username.trim()) {
      setError(language === "tr" ? "Kullanıcı adını girin" : "Enter username");
      return;
    }
    if (!password) {
      setError(language === "tr" ? "Şifreyi girin" : "Enter password");
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Test connection
      const connTest = await testConnection(formattedUrl);
      if (!connTest.ok) {
        setError(
          connTest.error ||
            (language === "tr"
              ? "Sunucuya bağlanılamadı"
              : "Cannot connect to server"),
        );
        setIsLoading(false);
        return;
      }

      // Step 2: Login
      const loginResult = await apiLogin(
        formattedUrl,
        username.trim(),
        password,
      );
      if (loginResult.error || !loginResult.token) {
        setError(loginResult.error || "Login failed");
        setIsLoading(false);
        return;
      }

      // Step 3: Get profile
      const profileResult = await getProfile(formattedUrl, loginResult.token);
      if (profileResult.error || !profileResult.user) {
        setError(profileResult.error || "Profil bilgisi alınamadı");
        setIsLoading(false);
        return;
      }

      // Step 4: Save server if remember me
      if (rememberMe) {
        await saveServer({
          url: formattedUrl,
          username: username.trim(),
          password,
        });
      }

      // Step 5: Store auth and redirect
      await loginStore(
        formattedUrl,
        loginResult.token,
        loginResult.refresh,
        profileResult.user,
        rememberMe,
      );

      // Redirect to menu
      router.replace("/(tabs)/menu");
    } catch (err: any) {
      setError(
        err?.message ||
          (language === "tr" ? "Beklenmeyen hata" : "Unexpected error"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    serverUrl,
    username,
    password,
    rememberMe,
    formatServerUrl,
    language,
    loginStore,
    saveServer,
    router,
  ]);

  // ── Select saved server ──
  const handleSelectSaved = useCallback((saved: SavedServer) => {
    setServerUrl(saved.url);
    setUsername(saved.username);
    setPassword(saved.password);
    setShowSavedServers(false);
    setError(null);
  }, []);

  // ── Texts ──
  const t = {
    title: language === "tr" ? "Akıllı Masa Ayarlar" : "Smart Table Settings",
    subtitle:
      language === "tr"
        ? "Restoran sunucusuna bağlanmak için bilgilerinizi girin"
        : "Enter your credentials to connect to the restaurant server",
    serverLabel: language === "tr" ? "Sunucu Adresi" : "Server Address",
    serverPlaceholder: "http://192.168.1.100",
    usernameLabel: language === "tr" ? "Kullanıcı Adı" : "Username",
    usernamePlaceholder: "smart_table",
    passwordLabel: language === "tr" ? "Şifre" : "Password",
    passwordPlaceholder: "••••••••",
    rememberMe: language === "tr" ? "Bilgileri kaydet" : "Remember me",
    login: language === "tr" ? "Bağlan" : "Connect",
    connecting: language === "tr" ? "Bağlanıyor..." : "Connecting...",
    savedServers: language === "tr" ? "Kayıtlı Sunucular" : "Saved Servers",
    noSavedServers:
      language === "tr" ? "Kayıtlı sunucu yok" : "No saved servers",
    delete: language === "tr" ? "Sil" : "Delete",
    select: language === "tr" ? "Seç" : "Select",
  };

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
      edges={["top", "bottom"]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-8 py-8">
            {/* ── Logo / Header ── */}
            <View className="items-center mb-8">
              <View className="w-32 h-32 mb-2">
                <Image
                  source={require("../../assets/splash-icon.png")}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="contain"
                />
              </View>

              <Text
                className="text-2xl font-extrabold text-center mb-2"
                style={{ color: colors.foreground }}
              >
                {t.title}
              </Text>
              <Text
                className="text-sm text-center leading-relaxed"
                style={{ color: colors.mutedForeground }}
              >
                {t.subtitle}
              </Text>
            </View>

            {/* ── Error ── */}
            {error && (
              <View
                className="border rounded-xl px-4 py-3 mb-5"
                style={{
                  backgroundColor: `${colors.destructive}1A`,
                  borderColor: colors.destructive,
                }}
              >
                <Text
                  className="text-sm font-medium"
                  style={{ color: colors.destructive }}
                >
                  {error}
                </Text>
              </View>
            )}

            {/* ── Server URL ── */}
            <View className="mb-4">
              <Text
                className="text-sm font-bold mb-2"
                style={{ color: colors.foreground }}
              >
                {t.serverLabel}
              </Text>
              <View
                className="flex-row items-center gap-3 px-4 py-3.5 rounded-2xl border-2"
                style={{
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                }}
              >
                <Server size={20} color={colors.icon} strokeWidth={1.8} />
                <TextInput
                  className="flex-1 text-base"
                  style={{ color: colors.foreground }}
                  placeholder={t.serverPlaceholder}
                  placeholderTextColor={colors.placeholder}
                  value={serverUrl}
                  onChangeText={(text) => {
                    setServerUrl(text);
                    setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                {savedServers.length > 0 && (
                  <Pressable
                    onPress={() => setShowSavedServers(true)}

                    className="p-1"
                  >
                    <History
                      size={20}
                      color={colors.primary}
                      strokeWidth={1.8}
                    />
                  </Pressable>
                )}
              </View>
            </View>

            {/* ── Username ── */}
            <View className="mb-4">
              <Text
                className="text-sm font-bold mb-2"
                style={{ color: colors.foreground }}
              >
                {t.usernameLabel}
              </Text>
              <View
                className="flex-row items-center gap-3 px-4 py-3.5 rounded-2xl border-2"
                style={{
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                }}
              >
                <User size={20} color={colors.icon} strokeWidth={1.8} />
                <TextInput
                  className="flex-1 text-base"
                  style={{ color: colors.foreground }}
                  placeholder={t.usernamePlaceholder}
                  placeholderTextColor={colors.placeholder}
                  value={username}
                  onChangeText={(text) => {
                    setUsername(text);
                    setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* ── Password ── */}
            <View className="mb-6">
              <Text
                className="text-sm font-bold mb-2"
                style={{ color: colors.foreground }}
              >
                {t.passwordLabel}
              </Text>
              <View
                className="flex-row items-center gap-3 px-4 py-3.5 rounded-2xl border-2"
                style={{
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                }}
              >
                <Lock size={20} color={colors.icon} strokeWidth={1.8} />
                <TextInput
                  className="flex-1 text-base"
                  style={{ color: colors.foreground }}
                  placeholder={t.passwordPlaceholder}
                  placeholderTextColor={colors.placeholder}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setError(null);
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* ── Remember Me ── */}
            <Pressable
              onPress={() => setRememberMe(!rememberMe)}

              className="flex-row items-center gap-3 mb-8"
            >
              <View
                className="w-6 h-6 rounded-lg border-2 items-center justify-center"
                style={{
                  backgroundColor: rememberMe ? colors.primary : "transparent",
                  borderColor: rememberMe ? colors.primary : colors.border,
                }}
              >
                {rememberMe && (
                  <Text
                    className="text-xs font-bold"
                    style={{ color: colors.primaryForeground }}
                  >
                    ✓
                  </Text>
                )}
              </View>
              <Text
                className="text-sm font-medium"
                style={{ color: colors.mutedForeground }}
              >
                {t.rememberMe}
              </Text>
            </Pressable>

            {/* ── Login Button ── */}
            <Pressable
              onPress={handleLogin}
              disabled={isLoading}

              className="h-[56px] rounded-2xl items-center justify-center flex-row gap-2 shadow-lg"
              style={{
                backgroundColor: colors.primary,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
                elevation: 8,
              }}
            >
              {isLoading ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text
                    className="text-lg font-bold"
                    style={{ color: colors.primaryForeground }}
                  >
                    {t.connecting}
                  </Text>
                </>
              ) : (
                <>
                  <Wifi size={22} color="#FFFFFF" strokeWidth={2} />
                  <Text
                    className="text-lg font-bold"
                    style={{ color: colors.primaryForeground }}
                  >
                    {t.login}
                  </Text>
                  <ChevronRight size={20} color="#FFFFFF" strokeWidth={2.5} />
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Saved Servers Modal ── */}
      <Modal
        visible={showSavedServers}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSavedServers(false)}
      >
        <View
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
        >
          <View
            className="rounded-t-3xl px-6 pt-6 pb-10 max-h-[60%]"
            style={{ backgroundColor: colors.background }}
          >
            <View className="flex-row items-center justify-between mb-6">
              <Text
                className="text-xl font-extrabold"
                style={{ color: colors.foreground }}
              >
                {t.savedServers}
              </Text>
              <Pressable
                onPress={() => setShowSavedServers(false)}

                className="px-4 py-2 rounded-full"
                style={{ backgroundColor: colors.muted }}
              >
                <Text
                  className="text-sm font-bold"
                  style={{ color: colors.foreground }}
                >
                  {language === "tr" ? "Kapat" : "Close"}
                </Text>
              </Pressable>
            </View>

            {savedServers.length === 0 ? (
              <View className="py-12 items-center">
                <History size={40} color={colors.icon} strokeWidth={1.5} />
                <Text
                  className="text-base font-medium mt-4"
                  style={{ color: colors.mutedForeground }}
                >
                  {t.noSavedServers}
                </Text>
              </View>
            ) : (
              <FlatList
                data={savedServers}
                keyExtractor={(item) => item.url}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <View
                    className="flex-row items-center gap-3 px-4 py-4 rounded-2xl mb-2 border"
                    style={{
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    }}
                  >
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center"
                      style={{ backgroundColor: `${colors.primary}1A` }}
                    >
                      <Server
                        size={20}
                        color={colors.primary}
                        strokeWidth={1.8}
                      />
                    </View>
                    <View className="flex-1">
                      <Text
                        className="text-sm font-bold"
                        style={{ color: colors.foreground }}
                        numberOfLines={1}
                      >
                        {item.url}
                      </Text>
                      <Text
                        className="text-xs"
                        style={{ color: colors.mutedForeground }}
                      >
                        {item.username}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleSelectSaved(item)}

                      className="h-10 px-4 rounded-full items-center justify-center"
                      style={{ backgroundColor: colors.primary }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.primaryForeground }}
                      >
                        {t.select}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        useDialogStore
                          .getState()
                          .confirm(
                            language === "tr" ? "Sil" : "Delete",
                            language === "tr"
                              ? `${item.url} kaydını silmek istediğinize emin misiniz?`
                              : `Are you sure you want to delete ${item.url}?`,
                            () => removeSavedServer(item.url),
                            undefined,
                            language === "tr" ? "Sil" : "Delete",
                            language === "tr" ? "İptal" : "Cancel",
                            true,
                          );
                      }}

                      className="p-2"
                    >
                      <Trash2 size={18} color="#EF4444" strokeWidth={1.8} />
                    </Pressable>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
