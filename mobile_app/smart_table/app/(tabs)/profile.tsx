// ============================================================
// Smart Table — Profile & Settings Screen
//
// Customer info, server connection status, language/theme
// toggles, server settings, and logout.
// ============================================================

import { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  User,
  Sun,
  Moon,
  Languages,
  MapPin,
  Clock,
  Smartphone,
  UtensilsCrossed,
  Server,
  Wifi,
  WifiOff,
  LogOut,
  ChevronRight,
  Settings,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react-native";
import { useUIStore } from "@/store/ui-store";
import { useAuthStore } from "@/store/auth-store";
import { useTableStore } from "@/store/table-store";
import { useCartStore } from "@/store/cart-store";
import { useDialogStore } from "@/store/dialog-store";
import { useTheme } from "@/hooks/useTheme";
import { ProfileBranchTableModal } from "@/components/profile/ProfileBranchTableModal";

export default function ProfileScreen() {
  const router = useRouter();
  const theme = useUIStore((s) => s.theme);
  const language = useUIStore((s) => s.language);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const setLanguage = useUIStore((s) => s.setLanguage);
  const idleTimeout = useUIStore((s) => s.idleTimeout);
  const setIdleTimeout = useUIStore((s) => s.setIdleTimeout);
  const showToast = useUIStore((s) => s.showToast);

  const { user, serverUrl, isAuthenticated, logout } = useAuthStore();
  const selectedTable = useTableStore((s) => s.selectedTable);
  const selectedBranch = useTableStore((s) => s.selectedBranch);
  const availableTables = useTableStore((s) => s.availableTables);
  const availableBranches = useTableStore((s) => s.availableBranches);
  const isLoadingBranches = useTableStore((s) => s.isLoadingBranches);
  const isLoadingTables = useTableStore((s) => s.isLoadingTables);
  const branchesError = useTableStore((s) => s.branchesError);
  const tablesError = useTableStore((s) => s.tablesError);
  const selectTable = useTableStore((s) => s.selectTable);
  const selectBranch = useTableStore((s) => s.selectBranch);
  const fetchTables = useTableStore((s) => s.fetchTables);
  const fetchBranches = useTableStore((s) => s.fetchBranches);
  const setCartTable = useCartStore((s) => s.setTable);

  const isDark = theme === "dark";
  const { colors } = useTheme();

  // ── Server settings state ──
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [editServerUrl, setEditServerUrl] = useState(serverUrl ?? "");
  const [editUsername, setEditUsername] = useState(user?.username ?? "");
  const [editPassword, setEditPassword] = useState("");

  // ── Table selection state ──
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableModalStep, setTableModalStep] = useState<"branch" | "table">(
    "branch",
  );

  // ── Handlers ──
  const toggleLanguage = useCallback(() => {
    const newLang = language === "tr" ? "en" : "tr";
    setLanguage(newLang);
    showToast(
      newLang === "tr"
        ? "Dil Türkçe olarak değiştirildi"
        : "Language changed to English",
    );
  }, [language, setLanguage, showToast]);

  const handleLogout = useCallback(() => {
    useDialogStore.getState().confirm(
      language === "tr" ? "Çıkış Yap" : "Logout",
      language === "tr"
        ? "Çıkış yapmak istediğinize emin misiniz?"
        : "Are you sure you want to logout?",
      async () => {
        await logout();
        router.replace("/(auth)/login" as never);
      },
      undefined,
      language === "tr" ? "Çıkış Yap" : "Logout",
      language === "tr" ? "İptal" : "Cancel",
      true, // destructive
    );
  }, [language, logout, router]);

  const handleSaveServerSettings = useCallback(async () => {
    // Validate URL
    if (!editServerUrl.trim()) {
      useDialogStore
        .getState()
        .alert(
          language === "tr" ? "Hata" : "Error",
          language === "tr" ? "Sunucu adresini girin" : "Enter server address",
        );
      return;
    }

    // Format URL
    let formattedUrl = editServerUrl.trim();
    if (
      !formattedUrl.startsWith("http://") &&
      !formattedUrl.startsWith("https://")
    ) {
      formattedUrl = "http://" + formattedUrl;
    }
    formattedUrl = formattedUrl
      .replace(/\/api\/v1\/?$/, "")
      .replace(/\/api\/?$/, "")
      .replace(/\/+$/, "");

    try {
      const { login, setServerUrl } = useAuthStore.getState();

      // If password is provided, try to re-login with new credentials
      if (editPassword) {
        const { login: apiLogin, getProfile } =
          await import("@/services/authService");
        const loginResult = await apiLogin(
          formattedUrl,
          editUsername,
          editPassword,
        );
        if (loginResult.error || !loginResult.token) {
          useDialogStore
            .getState()
            .alert(
              language === "tr" ? "Hata" : "Error",
              loginResult.error || "Login failed",
            );
          return;
        }
        const profileResult = await getProfile(formattedUrl, loginResult.token);
        if (profileResult.error || !profileResult.user) {
          useDialogStore
            .getState()
            .alert(
              language === "tr" ? "Hata" : "Error",
              profileResult.error || "Profil alınamadı",
            );
          return;
        }
        await login(
          formattedUrl,
          loginResult.token,
          loginResult.refresh,
          profileResult.user,
          true,
        );
      } else {
        // Just update the server URL
        await setServerUrl(formattedUrl);
      }

      setShowServerSettings(false);
      setEditPassword("");
      useDialogStore
        .getState()
        .alert(
          language === "tr" ? "Başarılı" : "Success",
          language === "tr"
            ? "Sunucu ayarları güncellendi"
            : "Server settings updated",
        );
    } catch (err: any) {
      useDialogStore
        .getState()
        .alert(
          language === "tr" ? "Hata" : "Error",
          err?.message ||
            (language === "tr" ? "Bir hata oluştu" : "An error occurred"),
        );
    }
  }, [editServerUrl, editUsername, editPassword, language]);

  // ── Masa seç ──
  const handleSelectTable = useCallback(
    async (tableId: string, tableName: string, zoneName: string) => {
      await selectTable({ id: tableId, name: tableName, zoneName });
      setCartTable(tableId);
      setShowTableModal(false);
      setTableModalStep("branch");
    },
    [selectTable, setCartTable],
  );

  // ── Şube seç ──
  const handleSelectBranch = useCallback(
    async (branch: { id: string; name: string; code: string }) => {
      await selectBranch(branch);
      // Seçilen şubenin masalarını getir
      await fetchTables(branch.id);
      setTableModalStep("table");
    },
    [selectBranch, fetchTables],
  );

  // ── Modalı aç ──
  const handleOpenTableModal = useCallback(async () => {
    setShowTableModal(true);

    if (availableBranches.length === 0) {
      // İlk defa açılıyor — branch'leri getir
      await fetchBranches();
    }

    // Eğer seçili şube varsa ve masalar henüz yüklenmemişse
    const currentBranch = useTableStore.getState().selectedBranch;
    if (
      currentBranch &&
      useTableStore.getState().availableTables.length === 0
    ) {
      await fetchTables(currentBranch.id);
    }

    // Step belirle
    const hasBranches = useTableStore.getState().availableBranches.length > 0;
    const hasSelectedBranch = !!useTableStore.getState().selectedBranch;
    setTableModalStep(hasBranches && hasSelectedBranch ? "table" : "branch");
  }, [availableBranches.length, fetchBranches, fetchTables]);

  // ── Texts ──
  const t = {
    title: language === "tr" ? "Profil" : "Profile",
    customer: language === "tr" ? "Müşteri" : "Customer",
    table: language === "tr" ? "Masa" : "Table",
    settings: language === "tr" ? "Ayarlar" : "Settings",
    language: language === "tr" ? "Dil" : "Language",
    theme: language === "tr" ? "Görünüm" : "Theme",
    light: language === "tr" ? "Açık" : "Light",
    dark: language === "tr" ? "Koyu" : "Dark",
    restaurant: language === "tr" ? "Restoran Bilgisi" : "Restaurant Info",
    branch: language === "tr" ? "Şube" : "Branch",
    hours: language === "tr" ? "Çalışma Saatleri" : "Hours",
    hoursValue:
      language === "tr"
        ? "Hafta içi: 09:00 - 23:00"
        : "Weekdays: 09:00 - 23:00",
    weekendHours:
      language === "tr"
        ? "Hafta sonu: 10:00 - 01:00"
        : "Weekend: 10:00 - 01:00",
    about: language === "tr" ? "Hakkında" : "About",
    version: language === "tr" ? "Uygulama Sürümü" : "App Version",
    tr: "Türkçe",
    en: "English",
    serverConnection:
      language === "tr" ? "Sunucu Bağlantısı" : "Server Connection",
    connected: language === "tr" ? "Bağlı" : "Connected",
    serverUrl: language === "tr" ? "Sunucu Adresi" : "Server Address",
    loggedInAs: language === "tr" ? "Giriş Yapan" : "Logged in as",
    serverSettings: language === "tr" ? "Sunucu Ayarları" : "Server Settings",
    save: language === "tr" ? "Kaydet" : "Save",
    cancel: language === "tr" ? "İptal" : "Cancel",
    passwordPlaceholder:
      language === "tr"
        ? "Yeni şifre (boş bırakılırsa değişmez)"
        : "New password (leave blank to keep)",
    logout: language === "tr" ? "Çıkış Yap" : "Logout",
    onOff: language === "tr" ? "Kapalı" : "Off",
    shortSec: language === "tr" ? "sn" : "sec",
    shortMin: language === "tr" ? "dk" : "min",
  };

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
      edges={["top"]}
    >
      <View className="flex-1">
        {/* ── Header ── */}
        <View
          className="flex-row items-center justify-between px-5 py-4 border-b"
          style={{ borderBottomColor: colors.border }}
        >
          <View className="flex-row items-center gap-3">
            <View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: `${colors.primary}1A` }}
            >
              <User size={22} color={colors.primary} strokeWidth={1.8} />
            </View>
            <Text
              className="text-2xl font-extrabold"
              style={{ color: colors.foreground }}
            >
              {t.title}
            </Text>
          </View>
        </View>

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* ── Customer Info Card ── */}
          <View className="px-5 pt-6">
            <View
              className="rounded-3xl p-6 border"
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            >
              <View className="flex-row items-center gap-4">
                {/* Avatar */}
                <View
                  className="w-16 h-16 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${colors.primary}1A` }}
                >
                  <User size={32} color={colors.primary} strokeWidth={1.5} />
                </View>

                {/* Info */}
                <View className="flex-1">
                  <Text
                    className="text-xl font-bold"
                    style={{ color: colors.foreground }}
                  >
                    {user?.first_name || t.customer}
                  </Text>
                  <View className="flex-row items-center gap-1.5 mt-1">
                    <MapPin
                      size={14}
                      color={colors.mutedForeground}
                      strokeWidth={1.5}
                    />
                    <Text
                      className="text-sm"
                      style={{ color: colors.mutedForeground }}
                    >
                      {t.table}: {selectedTable?.name ?? "-"}
                    </Text>
                  </View>
                  {(selectedBranch?.name || user?.branch_name) && (
                    <Text
                      className="text-xs mt-0.5"
                      style={{ color: colors.mutedForeground }}
                    >
                      {selectedBranch?.name || user?.branch_name}
                    </Text>
                  )}
                </View>

                {/* User + Server status */}
                <View className="items-end gap-1">
                  <View className="flex-row items-center gap-1.5">
                    <View
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: colors.success }}
                    />
                    <Text
                      className="text-xs font-medium"
                      style={{ color: colors.success }}
                    >
                      {language === "tr" ? "Aktif" : "Active"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* ── Server Connection Status ── */}
          <View className="px-5 pt-6">
            <Pressable
              onPress={() => setShowServerSettings(!showServerSettings)}

              className="rounded-3xl p-5 border"
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            >
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{ backgroundColor: `${colors.success}1A` }}
                  >
                    <Server
                      size={20}
                      color={colors.success}
                      strokeWidth={1.8}
                    />
                  </View>
                  <View>
                    <Text
                      className="text-base font-bold"
                      style={{ color: colors.foreground }}
                    >
                      {t.serverConnection}
                    </Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      <Wifi size={12} color={colors.success} strokeWidth={2} />
                      <Text
                        className="text-xs font-medium"
                        style={{ color: colors.success }}
                      >
                        {t.connected}
                      </Text>
                    </View>
                  </View>
                </View>
                <ChevronRight size={20} color={colors.icon} strokeWidth={1.8} />
              </View>

              <View className="gap-1.5">
                <Text
                  className="text-xs"
                  style={{ color: colors.mutedForeground }}
                  numberOfLines={1}
                >
                  {t.serverUrl}: {serverUrl ?? "-"}
                </Text>
                <Text
                  className="text-xs"
                  style={{ color: colors.mutedForeground }}
                >
                  {t.loggedInAs}: {user?.username ?? "-"}
                </Text>
              </View>
            </Pressable>
          </View>

          {/* ── Server Settings Expandable ── */}
          {showServerSettings && (
            <View className="px-5 pt-4">
              <View
                className="rounded-3xl p-5 border"
                style={{
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-base font-bold mb-4"
                  style={{ color: colors.foreground }}
                >
                  {t.serverSettings}
                </Text>

                {/* Server URL */}
                <Text
                  className="text-xs font-bold mb-1.5"
                  style={{ color: colors.mutedForeground }}
                >
                  {t.serverUrl}
                </Text>
                <View
                  className="flex-row items-center gap-3 px-4 py-3 rounded-2xl border-2 mb-4"
                  style={{
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  }}
                >
                  <Server size={18} color={colors.icon} strokeWidth={1.8} />
                  <TextInput
                    className="flex-1 text-sm"
                    style={{ color: colors.foreground }}
                    value={editServerUrl}
                    onChangeText={setEditServerUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder="http://..."
                    placeholderTextColor={colors.placeholder}
                  />
                </View>

                {/* Username */}
                <Text
                  className="text-xs font-bold mb-1.5"
                  style={{ color: colors.mutedForeground }}
                >
                  {language === "tr" ? "Kullanıcı Adı" : "Username"}
                </Text>
                <View
                  className="flex-row items-center gap-3 px-4 py-3 rounded-2xl border-2 mb-4"
                  style={{
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  }}
                >
                  <User size={18} color={colors.icon} strokeWidth={1.8} />
                  <TextInput
                    className="flex-1 text-sm"
                    style={{ color: colors.foreground }}
                    value={editUsername}
                    onChangeText={setEditUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor={colors.placeholder}
                  />
                </View>

                {/* Password */}
                <Text
                  className="text-xs font-bold mb-1.5"
                  style={{ color: colors.mutedForeground }}
                >
                  {language === "tr" ? "Şifre" : "Password"}
                </Text>
                <View
                  className="flex-row items-center gap-3 px-4 py-3 rounded-2xl border-2 mb-5"
                  style={{
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  }}
                >
                  <User size={18} color={colors.icon} strokeWidth={1.8} />
                  <TextInput
                    className="flex-1 text-sm"
                    style={{ color: colors.foreground }}
                    value={editPassword}
                    onChangeText={setEditPassword}
                    secureTextEntry
                    placeholder={t.passwordPlaceholder}
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Save / Cancel */}
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={() => setShowServerSettings(false)}

                    className="flex-1 h-[48px] rounded-2xl items-center justify-center border-2"
                    style={{
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      className="text-sm font-bold"
                      style={{ color: colors.foreground }}
                    >
                      {t.cancel}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSaveServerSettings}

                    className="flex-1 h-[48px] rounded-2xl items-center justify-center flex-row gap-2"
                    style={{ backgroundColor: colors.primary }}
                  >
                    <CheckCircle2 size={18} color="#FFFFFF" strokeWidth={2} />
                    <Text
                      className="text-sm font-bold"
                      style={{ color: colors.primaryForeground }}
                    >
                      {t.save}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {/* ── Table Selection Card ── */}
          <View className="px-5 pt-6">
            <Pressable
              onPress={handleOpenTableModal}

              className="rounded-3xl p-5 border"
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            >
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{ backgroundColor: `${colors.primary}1A` }}
                  >
                    <MapPin
                      size={20}
                      color={colors.primary}
                      strokeWidth={1.8}
                    />
                  </View>
                  <View>
                    <Text
                      className="text-base font-bold"
                      style={{ color: colors.foreground }}
                    >
                      {t.table}
                    </Text>
                    <Text
                      className="text-xs"
                      style={{ color: colors.mutedForeground }}
                    >
                      {selectedTable?.name ?? "-"}
                      {selectedTable?.zoneName
                        ? ` · ${selectedTable.zoneName}`
                        : ""}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={20} color={colors.icon} strokeWidth={1.8} />
              </View>
            </Pressable>
          </View>

          {/* ── Settings ── */}
          <View className="px-5 pt-8">
            <Text
              className="text-sm font-bold uppercase tracking-widest mb-4"
              style={{ color: colors.mutedForeground }}
            >
              {t.settings}
            </Text>

            {/* Language Toggle */}
            <View
              className="flex-row items-center justify-between px-5 py-4 rounded-2xl mb-3 border"
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            >
              <View className="flex-row items-center gap-3">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: "#3B82F61A" }}
                >
                  <Languages size={20} color="#3B82F6" strokeWidth={1.8} />
                </View>
                <View>
                  <Text
                    className="text-base font-bold"
                    style={{ color: colors.foreground }}
                  >
                    {t.language}
                  </Text>
                  <Text
                    className="text-xs"
                    style={{ color: colors.mutedForeground }}
                  >
                    {language === "tr" ? t.tr : t.en}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={toggleLanguage}

                className="h-[40px] px-4 rounded-full items-center justify-center"
                style={{
                  backgroundColor:
                    language === "tr" ? colors.primary : colors.muted,
                }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{
                    color:
                      language === "tr"
                        ? colors.primaryForeground
                        : colors.foreground,
                  }}
                >
                  {language === "tr" ? t.en : t.tr}
                </Text>
              </Pressable>
            </View>

            {/* Theme Toggle */}
            <View
              className="flex-row items-center justify-between px-5 py-4 rounded-2xl border"
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            >
              <View className="flex-row items-center gap-3">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${colors.warning}1A` }}
                >
                  {isDark ? (
                    <Sun size={20} color={colors.warning} strokeWidth={1.8} />
                  ) : (
                    <Moon size={20} color={colors.warning} strokeWidth={1.8} />
                  )}
                </View>
                <View>
                  <Text
                    className="text-base font-bold"
                    style={{ color: colors.foreground }}
                  >
                    {t.theme}
                  </Text>
                  <Text
                    className="text-xs"
                    style={{ color: colors.mutedForeground }}
                  >
                    {isDark ? t.dark : t.light}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={toggleTheme}

                className="w-[52px] h-[30px] rounded-full items-center justify-center"
                style={{
                  backgroundColor: isDark ? colors.warning : colors.border,
                }}
              >
                <View
                  className={`w-[22px] h-[22px] rounded-full shadow-sm ${
                    isDark ? "self-end mr-0.5" : "self-start ml-0.5"
                  }`}
                  style={{
                    backgroundColor: "#FFFFFF",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.2,
                    shadowRadius: 2,
                    elevation: 2,
                  }}
                />
              </Pressable>
            </View>

            {/* Idle Timeout — compact vertical layout */}
            <View
              className="px-5 py-3 rounded-2xl mt-3 border"
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            >
              {/* Top row: icon + label + current value */}
              <View className="flex-row items-center gap-3 mb-2.5">
                <View
                  className="w-8 h-8 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${colors.warning}1A` }}
                >
                  <Clock size={16} color={colors.warning} strokeWidth={1.8} />
                </View>
                <Text
                  className="text-sm font-bold flex-1"
                  style={{ color: colors.foreground }}
                >
                  {language === "tr" ? "Zaman Aşımı" : "Timeout"}
                </Text>
                <Text
                  className="text-xs font-semibold"
                  style={{
                    color:
                      idleTimeout === 0 ? colors.destructive : colors.warning,
                  }}
                >
                  {idleTimeout === 0
                    ? language === "tr"
                      ? "Kapalı"
                      : "Off"
                    : idleTimeout < 60
                      ? language === "tr"
                        ? `${idleTimeout}sn`
                        : `${idleTimeout}s`
                      : language === "tr"
                        ? `${Math.floor(idleTimeout / 60)}dk`
                        : `${Math.floor(idleTimeout / 60)}m`}
                </Text>
              </View>

              {/* Bottom row: preset buttons */}
              <View className="flex-row gap-1.5">
                {[
                  { value: 10, label: "10" + t.shortSec },
                  { value: 20, label: "20" + t.shortSec },
                  { value: 30, label: "30" + t.shortSec },
                  { value: 60, label: "1" + t.shortMin },
                  { value: 300, label: "5" + t.shortMin },
                ].map((preset) => (
                  <Pressable
                    key={preset.value}
                    onPress={() => setIdleTimeout(preset.value)}

                    className="flex-1 h-[30px] rounded-lg items-center justify-center"
                    style={{
                      backgroundColor:
                        idleTimeout === preset.value
                          ? colors.warning
                          : colors.muted,
                    }}
                  >
                    <Text
                      className="text-[11px] font-bold"
                      style={{
                        color:
                          idleTimeout === preset.value
                            ? colors.warningForeground
                            : colors.foreground,
                      }}
                    >
                      {preset.label}
                    </Text>
                  </Pressable>
                ))}
                {/* OFF button */}
                <Pressable
                  onPress={() => setIdleTimeout(0)}

                  className="flex-1 h-[30px] rounded-lg items-center justify-center"
                  style={{
                    backgroundColor:
                      idleTimeout === 0 ? colors.destructive : colors.muted,
                  }}
                >
                  <Text
                    className="text-[11px] font-bold"
                    style={{
                      color:
                        idleTimeout === 0
                          ? colors.destructiveForeground
                          : colors.foreground,
                    }}
                  >
                    {t.onOff}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* ── Restaurant Info ── */}
          <View className="px-5 pt-8">
            <Text
              className="text-sm font-bold uppercase tracking-widest mb-4"
              style={{ color: colors.mutedForeground }}
            >
              {t.restaurant}
            </Text>

            <View
              className="rounded-3xl border overflow-hidden"
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            >
              {/* Branch */}
              <View className="flex-row items-center gap-3 px-5 py-4">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${colors.primary}1A` }}
                >
                  <MapPin size={20} color={colors.primary} strokeWidth={1.8} />
                </View>
                <View className="flex-1">
                  <Text
                    className="text-base font-bold"
                    style={{ color: colors.foreground }}
                  >
                    {selectedBranch
                      ? selectedBranch.name
                      : language === "tr"
                        ? "Şube Seçilmedi"
                        : "No Branch Selected"}
                  </Text>
                </View>
              </View>

              <View
                className="h-px mx-5"
                style={{ backgroundColor: colors.border }}
              />
            </View>
          </View>

          {/* ── About ── */}
          <View className="px-5 pt-8">
            <Text
              className="text-sm font-bold uppercase tracking-widest mb-4"
              style={{ color: colors.mutedForeground }}
            >
              {t.about}
            </Text>

            <View
              className="rounded-3xl border"
              style={{
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            >
              {/* Version */}
              <View className="flex-row items-center gap-3 px-5 py-4">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${colors.mutedForeground}1A` }}
                >
                  <Smartphone size={20} color={colors.icon} strokeWidth={1.8} />
                </View>
                <View className="flex-1">
                  <Text
                    className="text-base font-bold"
                    style={{ color: colors.foreground }}
                  >
                    {t.version}
                  </Text>
                  <Text
                    className="text-xs"
                    style={{ color: colors.mutedForeground }}
                  >
                    0.0.7
                  </Text>
                </View>
              </View>

              <View
                className="h-px mx-5"
                style={{ backgroundColor: colors.border }}
              />

              {/* Powered by Ramis */}
            </View>
          </View>

          {/* ── Logout Button ── */}
          <View className="px-5 pt-8 pb-8">
            <Pressable
              onPress={handleLogout}

              className="h-[52px] rounded-2xl items-center justify-center flex-row gap-2 shadow-lg"
              style={{
                backgroundColor: colors.destructive,
                shadowColor: colors.destructive,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
                elevation: 8,
              }}
            >
              <LogOut size={20} color="#FFFFFF" strokeWidth={2.5} />
              <Text
                className="text-base font-bold"
                style={{ color: colors.destructiveForeground }}
              >
                {t.logout}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      {/* ── Table / Branch Selection Modal ── */}
      <ProfileBranchTableModal
        visible={showTableModal}
        onClose={() => setShowTableModal(false)}
        step={tableModalStep}
        onStepChange={setTableModalStep}
        language={language}
        selectedBranch={selectedBranch}
        selectedTable={selectedTable}
        availableBranches={availableBranches}
        availableTables={availableTables}
        isLoadingBranches={isLoadingBranches}
        isLoadingTables={isLoadingTables}
        branchesError={branchesError}
        tablesError={tablesError}
        onRefreshBranches={fetchBranches}
        onRefreshTables={fetchTables}
        onSelectBranch={handleSelectBranch}
        onSelectTable={handleSelectTable}
      />
    </SafeAreaView>
  );
}
