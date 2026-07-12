// ============================================================
// Stock Man — More / Settings (P1)
//
// Settings hub grouped into readable sections:
//   Hesap    → profile card
//   Modüller → suppliers, expiry, branch picker
//   Tercihler → language + theme
//   Bağlantı → server URL
//   Hakkında → app version
//   Giriş geçmişi + çıkış
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import Constants from "expo-constants";
import { Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Bell,
  CalendarClock,
  ChevronRight,
  Clock,
  Globe,
  ListMinus,
  LogOut,
  Moon,
  Monitor,
  RotateCcw,
  Server,
  Sun,
  Truck,
  User as UserIcon,
  Users,
} from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BranchPicker } from "@/components/branch/BranchPicker";
import {
  useI18n,
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  type Language,
} from "@/i18n";
import { useAuthStore } from "@/store/useAuthStore";
import { useUIStore, type ThemePreference } from "@/store/useUIStore";
import { useBranchStore } from "@/store/useBranchStore";
import { useAppTheme } from "@/utils/theme";
import { useFormatters } from "@/hooks/useFormatters";
import { dialog } from "@/store/useDialogStore";
import { useToast } from "@/components/ui/Toast";
import { useResponsive } from "@/hooks/useResponsive";
import { cn } from "@/utils/cn";
import type { LucideIcon } from "lucide-react-native";

export default function MoreScreen() {
  const router = useRouter();
  const { t, language, setLanguage } = useI18n();
  const user = useAuthStore((s) => s.user);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const setServerUrl = useAuthStore((s) => s.setServerUrl);
  const loginHistory = useAuthStore((s) => s.loginHistory);
  const logout = useAuthStore((s) => s.logout);
  const themePreference = useUIStore((s) => s.themePreference);
  const { setPreference } = useAppTheme();
  const toast = useToast();
  const { isTablet } = useResponsive();
  const { dateTime } = useFormatters();
  const activeBranch = useBranchStore((s) => s.activeBranchId);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [serverDraft, setServerDraft] = useState("");

  const recentLogins = useMemo(
    () => loginHistory.slice(0, 5),
    [loginHistory]
  );

  const onLogout = useCallback(() => {
    dialog.confirm(
      t("settings.logoutConfirm"),
      undefined,
      async () => {
        await logout();
        toast.info(t("auth.sessionExpired"));
        router.replace("/(auth)/login");
      }
    );
  }, [logout, router, t, toast]);

  const onPickTheme = useCallback(
    (p: ThemePreference) => {
      setPreference(p);
    },
    [setPreference]
  );

  const onOpenServer = useCallback(() => {
    setServerDraft(serverUrl ?? "");
    setServerModalOpen(true);
  }, [serverUrl]);

  const onSaveServer = useCallback(async () => {
    const trimmed = serverDraft.trim();
    if (!trimmed) return;
    await setServerUrl(trimmed);
    setServerModalOpen(false);
    toast.success(t("settings.serverUrlSaved"));
  }, [serverDraft, setServerUrl, toast, t]);

  const accountSection = (
    <SettingsSection title={t("settings.account")}>
      <Card>
        <View className="flex-row items-center">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-primary/10 mr-3">
            <UserIcon size={22} color="#1E40AF" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-h3 text-foreground" numberOfLines={1}>
              {user?.full_name ?? user?.username ?? "—"}
            </Text>
            <Text className="text-caption text-muted-foreground mt-0.5" numberOfLines={1}>
              {user?.email ?? user?.username}
            </Text>
            {user?.branch_name ? (
              <Text className="text-caption text-primary mt-1" numberOfLines={1}>
                {t("branches.current")}: {user.branch_name}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>
    </SettingsSection>
  );

  const modulesSection = (
    <SettingsSection title={t("settings.modules")}>
      <Card className="p-0 overflow-hidden">
        <NavRow
          icon={Truck}
          label={t("supplier.title")}
          hint={t("supplier.list")}
          onPress={() => router.push("/(main)/supplier" as any)}
        />
        <NavRow
          icon={ListMinus}
          label={t("deficiency.title")}
          hint={t("deficiency.list")}
          onPress={() => router.push("/(main)/(tabs)/deficiency" as any)}
        />
        <NavRow
          icon={RotateCcw}
          label={t("returnCancel.nav.tabLabel")}
          hint={t("returnCancel.subtitle")}
          onPress={() => router.push("/(main)/(tabs)/return-cancel" as any)}
        />
        <NavRow
          icon={CalendarClock}
          label={t("expiry.title")}
          hint={t("expiry.summary.title")}
          onPress={() => router.push("/(main)/expiry" as any)}
        />
        <NavRow
          icon={Users}
          label={t("branches.title")}
          hint={activeBranch ? t("branches.current") : t("branches.select")}
          onPress={() => setBranchPickerOpen(true)}
          isLast
        />
      </Card>
    </SettingsSection>
  );

  const preferencesSection = (
    <SettingsSection title={t("settings.preferences")}>
      <Card className="p-0 overflow-hidden">
        <SettingBlock
          title={t("settings.language")}
          description={t("settings.languageDesc")}
        >
          <View className="flex-row flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((lng: Language) => (
              <Chip
                key={lng}
                label={LANGUAGE_LABELS[lng]}
                selected={language === lng}
                onPress={() => void setLanguage(lng)}
                variant="primary"
                leftIcon={Globe}
              />
            ))}
          </View>
        </SettingBlock>

        <SettingBlock
          title={t("settings.theme.title")}
          description={t("settings.theme.desc")}
          isLast
        >
          <View className="flex-row flex-wrap gap-2">
            <Chip
              label={t("settings.theme.light")}
              leftIcon={Sun}
              selected={themePreference === "light"}
              onPress={() => onPickTheme("light")}
              variant="primary"
            />
            <Chip
              label={t("settings.theme.dark")}
              leftIcon={Moon}
              selected={themePreference === "dark"}
              onPress={() => onPickTheme("dark")}
              variant="primary"
            />
            <Chip
              label={t("settings.theme.system")}
              leftIcon={Monitor}
              selected={themePreference === "system"}
              onPress={() => onPickTheme("system")}
              variant="primary"
            />
          </View>
        </SettingBlock>
      </Card>
    </SettingsSection>
  );

  const connectionSection = (
    <SettingsSection title={t("settings.connection")}>
      <Card>
        <View className="flex-row items-start">
          <View className="h-9 w-9 items-center justify-center rounded-lg bg-muted mr-3">
            <Server size={18} color="#64748B" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-body font-semibold text-foreground">
              {t("settings.server")}
            </Text>
            <Text className="text-caption text-muted-foreground mt-0.5">
              {t("settings.currentServer")}
            </Text>
            <Text className="text-body text-foreground mt-2" selectable numberOfLines={3}>
              {serverUrl ?? "—"}
            </Text>
            <View className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onPress={onOpenServer}
                leftIcon={Server}
              >
                {t("settings.changeServer")}
              </Button>
            </View>
          </View>
        </View>
      </Card>
    </SettingsSection>
  );

  const aboutSection = (
    <SettingsSection title={t("settings.about")}>
      <Card>
        <View className="flex-row items-center">
          <View className="h-9 w-9 items-center justify-center rounded-lg bg-muted mr-3">
            <Bell size={18} color="#64748B" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-body font-semibold text-foreground">
              {t("app.name")}
            </Text>
            <Text className="text-caption text-muted-foreground mt-0.5">
              {t("settings.version")} {Constants.expoConfig?.version ?? "1.0.0"}
            </Text>
          </View>
        </View>
      </Card>
    </SettingsSection>
  );

  const loginHistorySection = (
    <SettingsSection title={t("settings.loginHistory")}>
      {recentLogins.length === 0 ? (
        <Card>
          <Text className="text-caption text-muted-foreground">
            {t("settings.noLoginHistory")}
          </Text>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {recentLogins.map((entry, idx) => (
            <View
              key={`login-${entry.timestamp}-${idx}`}
              className={cn(
                "flex-row items-center px-4 py-3",
                idx < recentLogins.length - 1 && "border-b border-border"
              )}
            >
              <View className="h-8 w-8 items-center justify-center rounded-full bg-success/10 mr-3">
                <Clock size={16} color="#059669" />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-body text-foreground" numberOfLines={1}>
                  {entry.username}
                </Text>
                <Text className="text-caption text-muted-foreground" numberOfLines={1}>
                  {dateTime(new Date(entry.timestamp))}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </SettingsSection>
  );

  const logoutSection = (
    <View className="pt-1">
      <Button
        variant="destructive"
        fullWidth
        leftIcon={LogOut}
        onPress={onLogout}
      >
        {t("settings.logout")}
      </Button>
    </View>
  );

  const primaryColumn = (
    <View className="gap-6">
      {accountSection}
      {modulesSection}
    </View>
  );

  const secondaryColumn = (
    <View className="gap-6">
      {preferencesSection}
      {connectionSection}
      {aboutSection}
      {loginHistorySection}
      {logoutSection}
    </View>
  );

  return (
    <Screen scroll padded={false}>
      <View className="px-4 pt-2">
        <Header title={t("settings.title")} />
      </View>

      <View className="px-4 pb-8 mt-2">
        {isTablet ? (
          <View className="flex-row" style={{ gap: 16 }}>
            <View style={{ flex: 2, minWidth: 0 }}>{primaryColumn}</View>
            <View style={{ flex: 3, minWidth: 0 }}>{secondaryColumn}</View>
          </View>
        ) : (
          <View className="gap-6">
            {accountSection}
            {modulesSection}
            {preferencesSection}
            {connectionSection}
            {aboutSection}
            {loginHistorySection}
            {logoutSection}
          </View>
        )}
      </View>

      <Modal
        visible={serverModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setServerModalOpen(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/60"
          onPress={() => setServerModalOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            className="bg-card border-t border-border rounded-t-2xl p-4"
          >
            <Text className="text-h3 text-foreground mb-3">
              {t("settings.serverUrlModalTitle")}
            </Text>
            <Input
              label={t("auth.serverUrl")}
              placeholder={t("auth.serverUrlPlaceholder")}
              value={serverDraft}
              onChangeText={setServerDraft}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View className="mt-4 flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onPress={() => setServerModalOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button variant="primary" className="flex-1" onPress={() => void onSaveServer()}>
                {t("common.save")}
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <BranchPicker
        visible={branchPickerOpen}
        onClose={() => setBranchPickerOpen(false)}
      />
    </Screen>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text className="text-caption text-muted-foreground font-semibold uppercase tracking-wide mb-2 px-0.5">
        {title}
      </Text>
      {children}
    </View>
  );
}

function SettingBlock({
  title,
  description,
  children,
  isLast,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <View
      className={cn(
        "px-4 py-4",
        !isLast && "border-b border-border"
      )}
    >
      <Text className="text-body font-semibold text-foreground">{title}</Text>
      {description ? (
        <Text className="text-caption text-muted-foreground mt-0.5">
          {description}
        </Text>
      ) : null}
      <View className="mt-3">{children}</View>
    </View>
  );
}

interface NavRowProps {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onPress: () => void;
  isLast?: boolean;
}

function NavRow({ icon: Icon, label, hint, onPress, isLast }: NavRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        "flex-row items-center px-4 py-3.5 active:opacity-80",
        !isLast && "border-b border-border"
      )}
      hitSlop={4}
    >
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-primary/10 mr-3">
        <Icon size={18} color="#1E40AF" />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-body font-semibold text-foreground" numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text className="text-caption text-muted-foreground mt-0.5" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color="#94A3B8" />
    </Pressable>
  );
}
