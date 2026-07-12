import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Switch,
  Alert,
  Modal,
  ActivityIndicator
} from "react-native";
import { useColorScheme } from "nativewind";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  User,
  Bell,
  Volume2,
  MonitorSmartphone,
  LogOut,
  ChevronRight,
  Info,
  Printer,
  FileText,
  Radio
} from "lucide-react-native";
import { useAuthStore } from "../../src/store/useAuthStore";
import { usePosStore } from "../../src/store/usePosStore";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../src/i18n";
import { useQuery } from "@tanstack/react-query";
import { fetchPrinters, fetchReceiptTemplates } from "../../src/api/waiterApi";

export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? 0;
  const { user, logout } = useAuthStore(
    useShallow((s) => ({ user: s.user, logout: s.logout }))
  );

  const [isPaymentPrinterModalOpen, setIsPaymentPrinterModalOpen] = useState(false);
  const [isPaymentTemplateModalOpen, setIsPaymentTemplateModalOpen] = useState(false);

  const {
    terminalId,
    showReadyNotifs,
    setShowReadyNotifs,
    showWaiterCallNotifs,
    setShowWaiterCallNotifs,
    playNotifSound,
    setPlayNotifSound,
    language,
    setLanguage,
    activeBranchId,
    autoPrintOrder,
    setAutoPrintOrder,
    autoPrintPayment,
    setAutoPrintPayment,
    paymentPrinterId,
    paymentTemplateSlug,
    setPaymentPrinterId,
    setPaymentTemplateSlug,
    tableGridColumns,
    setTableGridColumns,
    themePreference,
    setThemePreference
  } = usePosStore(
    useShallow((s) => ({
      terminalId: s.terminalId,
      showReadyNotifs: s.showReadyNotifs,
      setShowReadyNotifs: s.setShowReadyNotifs,
      showWaiterCallNotifs: s.showWaiterCallNotifs,
      setShowWaiterCallNotifs: s.setShowWaiterCallNotifs,
      playNotifSound: s.playNotifSound,
      setPlayNotifSound: s.setPlayNotifSound,
      language: s.language,
      setLanguage: s.setLanguage,
      activeBranchId: s.activeBranchId,
      autoPrintOrder: s.autoPrintOrder,
      setAutoPrintOrder: s.setAutoPrintOrder,
      autoPrintPayment: s.autoPrintPayment,
      setAutoPrintPayment: s.setAutoPrintPayment,
      paymentPrinterId: s.paymentPrinterId,
      paymentTemplateSlug: s.paymentTemplateSlug,
      setPaymentPrinterId: s.setPaymentPrinterId,
      setPaymentTemplateSlug: s.setPaymentTemplateSlug,
      tableGridColumns: s.tableGridColumns,
      setTableGridColumns: s.setTableGridColumns,
      themePreference: s.themePreference,
      setThemePreference: s.setThemePreference,
    }))
  );

  const { setColorScheme } = useColorScheme();

  const { data: posPrinters = [], isLoading: loadingPrinters } = useQuery({
    queryKey: ["printers", activeBranchId, "POS"],
    queryFn: () => fetchPrinters(activeBranchId || "", { usage_type: "POS", is_active: true }),
    enabled: isPaymentPrinterModalOpen && !!activeBranchId,
    retry: false,
  });

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ["receipt-templates", "POS_RECEIPT"],
    queryFn: fetchReceiptTemplates,
    enabled: isPaymentTemplateModalOpen,
  });

  const paymentPrinter = posPrinters.find((p: any) => p.id === paymentPrinterId);
  const paymentTemplate = templates.find(
    (temp: any) => temp.slug === paymentTemplateSlug && temp.category === "POS_RECEIPT"
  );
  const paymentTemplates = templates.filter((temp: any) => temp.category === "POS_RECEIPT");

  const handleLogout = () => {
    Alert.alert(
      t("settings.logoutConfirmTitle"),
      t("settings.logoutConfirmDesc"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.logoutConfirmBtn"),
          style: "destructive",
          onPress: () => {
            void logout();
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      {/* Header */}
      <View className="px-4 py-4 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="active:opacity-80 p-2">
          <ChevronLeft size={28} color="#1E2A4A" />
        </Pressable>
        <Text className="text-foreground text-2xl font-bold">{t("settings.title")}</Text>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6"
        contentContainerStyle={{ paddingBottom: Math.max(bottomInset + 32, 48) }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Profile Card */}
        <View className="bg-secondary p-6 rounded-[32px] mb-8 mt-4 flex-row items-center">
          <View className="w-16 h-16 bg-primary rounded-full items-center justify-center mr-4 shadow-sm">
            <Text className="text-white font-bold text-2xl">
              {(user?.fullName || user?.username || "G")[0].toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-foreground font-bold text-lg" numberOfLines={1}>
              {user?.fullName || user?.username}
            </Text>
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">{t("dashboard.waiter")}</Text>
          </View>
        </View>

        {/* System Settings */}
        <Text className="text-foreground font-bold text-base mb-4 ml-1">{t("settings.systemAndNotifs")}</Text>

        <SettingToggle
          title={t("settings.showNotifs")}
          subtitle={t("settings.showNotifsDesc")}
          icon={<Bell size={20} color="#1E2A4A" />}
          value={showReadyNotifs}
          onValueChange={setShowReadyNotifs}
        />

        <SettingToggle
          title={t("settings.showWaiterCallNotifs")}
          subtitle={t("settings.showWaiterCallNotifsDesc")}
          icon={<Radio size={20} color="#1E2A4A" />}
          value={showWaiterCallNotifs}
          onValueChange={setShowWaiterCallNotifs}
        />

        <SettingToggle
          title={t("settings.notifSound")}
          subtitle={t("settings.notifSoundDesc")}
          icon={<Volume2 size={20} color="#1E2A4A" />}
          value={playNotifSound}
          onValueChange={setPlayNotifSound}
        />

        {/* Table Layout Columns selection */}
        <View className="bg-secondary/50 p-4 rounded-[24px] mb-4">
          <View className="flex-row items-center mb-4">
            <View className="w-12 h-12 bg-card rounded-full items-center justify-center mr-4">
              <Text style={{ fontSize: 18 }}>📊</Text>
            </View>
            <View className="flex-1">
              <Text className="text-foreground font-bold text-base">{t("settings.tableLayoutCols")}</Text>
              <Text className="text-muted-foreground text-[10px]">{t("settings.tableLayoutColsDesc")}</Text>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {(["auto", "1", "2", "3", "4", "5"] as const).map((colVal) => (
              <Pressable
                key={colVal}
                onPress={() => setTableGridColumns(colVal)}
                className={`active:opacity-80 flex-1 min-w-[54px] h-10 rounded-xl items-center justify-center ${tableGridColumns === colVal ? "bg-primary" : "bg-card border border-border"}`}
              >
                <Text className={`font-bold text-xs ${tableGridColumns === colVal ? "text-white" : "text-foreground"}`}>
                  {t(`settings.tableLayoutCols${colVal.charAt(0).toUpperCase() + colVal.slice(1)}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Appearance / Theme Selection */}
        <View className="bg-secondary/50 p-4 rounded-[24px] mb-4">
          <View className="flex-row items-center mb-4">
            <View className="w-12 h-12 bg-card rounded-full items-center justify-center mr-4">
              <Text style={{ fontSize: 18 }}>🎨</Text>
            </View>
            <View className="flex-1">
              <Text className="text-foreground font-bold text-base">{t("settings.appearance")}</Text>
              <Text className="text-muted-foreground text-[10px]">{t("settings.appearanceDesc")}</Text>
            </View>
          </View>
          <View className="flex-row gap-3">
            {(["light", "dark", "system"] as const).map((prefVal) => (
              <Pressable
                key={prefVal}
                onPress={() => {
                  setThemePreference(prefVal);
                  setColorScheme(prefVal);
                }}
                className={`active:opacity-80 flex-1 h-12 rounded-2xl items-center justify-center ${themePreference === prefVal ? "bg-primary" : "bg-card border border-border"}`}
              >
                <Text className={`font-bold text-xs ${themePreference === prefVal ? "text-white" : "text-foreground"}`}>
                  {t(`settings.theme${prefVal.charAt(0).toUpperCase() + prefVal.slice(1)}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Language Selection */}
        <Text className="text-foreground font-bold text-base mt-6 mb-4 ml-1">{t("settings.language")}</Text>
        <View className="bg-secondary/50 p-4 rounded-[24px]">
          <View className="flex-row items-center mb-4">
            <View className="w-12 h-12 bg-card rounded-full items-center justify-center mr-4">
              <Text className="text-xl">🌍</Text>
            </View>
            <View className="flex-1">
              <Text className="text-foreground font-bold text-base">{t("settings.language")}</Text>
              <Text className="text-muted-foreground text-[10px]">{t("settings.languageDesc")}</Text>
            </View>
          </View>
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => setLanguage("tr")}
              className={`active:opacity-80 flex-1 h-12 rounded-2xl items-center justify-center ${language === "tr" ? "bg-primary" : "bg-card border border-border"}`}
            >
              <Text className={`font-bold ${language === "tr" ? "text-white" : "text-foreground"}`}>Türkçe</Text>
            </Pressable>
            <Pressable
              onPress={() => setLanguage("en")}
              className={`active:opacity-80 flex-1 h-12 rounded-2xl items-center justify-center ${language === "en" ? "bg-primary" : "bg-card border border-border"}`}
            >
              <Text className={`font-bold ${language === "en" ? "text-white" : "text-foreground"}`}>English</Text>
            </Pressable>
          </View>
          <View className="flex-row gap-3 mt-2">
            <Pressable
              onPress={() => setLanguage("bg")}
              className={`active:opacity-80 flex-1 h-12 rounded-2xl items-center justify-center ${language === "bg" ? "bg-primary" : "bg-card border border-border"}`}
            >
              <Text className={`font-bold ${language === "bg" ? "text-white" : "text-foreground"}`}>Български</Text>
            </Pressable>
            <Pressable
              onPress={() => setLanguage("sq")}
              className={`active:opacity-80 flex-1 h-12 rounded-2xl items-center justify-center ${language === "sq" ? "bg-primary" : "bg-card border border-border"}`}
            >
              <Text className={`font-bold ${language === "sq" ? "text-white" : "text-foreground"}`}>Shqip</Text>
            </Pressable>
          </View>
        </View>

        {/* Terminal Settings */}
        <Text className="text-foreground font-bold text-base mt-6 mb-4 ml-1">{t("settings.terminalAndBranch")}</Text>

        <Pressable onPress={() => router.push("/(main)/terminal-select")}
          className="active:opacity-80 flex-row items-center mb-4 bg-secondary/50 p-4 rounded-[24px]"
        >
          <View className="w-12 h-12 bg-white rounded-full items-center justify-center mr-4">
            <MonitorSmartphone size={20} color="#1E2A4A" />
          </View>
          <View className="flex-1">
            <Text className="text-foreground font-bold text-base">{t("settings.activeTerminal")}</Text>
            <Text className="text-muted-foreground text-xs">{terminalId || t("settings.notSelected")}</Text>
          </View>
          <ChevronRight size={20} color="#8A8480" />
        </Pressable>

        <Pressable onPress={() => router.push("/(main)/terminal-select")}
          className="active:opacity-80 bg-primary h-14 rounded-[24px] items-center justify-center mb-6 flex-row shadow-sm"
        >
          <MonitorSmartphone size={20} color="#ffffff" style={{ marginRight: 8 }} />
          <Text className="text-white font-bold text-base">{t("settings.selectPos")}</Text>
        </Pressable>

        {/* Printer & Receipt Settings */}
        <Text className="text-foreground font-bold text-base mt-6 mb-4 ml-1">{t("settings.printerSettings")}</Text>

        <SettingToggle
          title={t("settings.autoPrintOrder")}
          subtitle={t("settings.autoPrintOrderDesc")}
          icon={<Printer size={20} color="#1E2A4A" />}
          value={autoPrintOrder}
          onValueChange={setAutoPrintOrder}
        />

        <SettingToggle
          title={t("settings.autoPrintPayment")}
          subtitle={t("settings.autoPrintPaymentDesc")}
          icon={<FileText size={20} color="#1E2A4A" />}
          value={autoPrintPayment}
          onValueChange={setAutoPrintPayment}
        />

        {autoPrintPayment ? (
          <>
            <Pressable
              onPress={() => setIsPaymentPrinterModalOpen(true)}
              className="active:opacity-80 flex-row items-center mb-4 bg-secondary/50 p-4 rounded-[24px]"
            >
              <View className="w-12 h-12 bg-white rounded-full items-center justify-center mr-4">
                <Printer size={20} color="#1E2A4A" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground font-bold text-base">{t("settings.paymentPrinter")}</Text>
                <Text className="text-muted-foreground text-xs">
                  {paymentPrinter ? (paymentPrinter.name as string) : t("settings.notSelected")}
                </Text>
              </View>
              <ChevronRight size={20} color="#8A8480" />
            </Pressable>

            <Pressable
              onPress={() => setIsPaymentTemplateModalOpen(true)}
              className="active:opacity-80 flex-row items-center mb-4 bg-secondary/50 p-4 rounded-[24px]"
            >
              <View className="w-12 h-12 bg-white rounded-full items-center justify-center mr-4">
                <FileText size={20} color="#1E2A4A" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground font-bold text-base">{t("settings.paymentTemplate")}</Text>
                <Text className="text-muted-foreground text-xs">
                  {paymentTemplate ? (paymentTemplate.name as string) : t("settings.notSelected")}
                </Text>
              </View>
              <ChevronRight size={20} color="#8A8480" />
            </Pressable>
          </>
        ) : null}

        {/* Smart Button Setup */}
        <Text className="text-foreground font-bold text-base mt-6 mb-4 ml-1">{t("settings.deviceSetup")}</Text>

        <Pressable
          onPress={() => router.push("/(main)/button-setup")}
          className="active:opacity-80 flex-row items-center mb-4 bg-secondary/50 p-4 rounded-[24px]"
        >
          <View className="w-12 h-12 bg-white rounded-full items-center justify-center mr-4">
            <Radio size={20} color="#1E2A4A" />
          </View>
          <View className="flex-1">
            <Text className="text-foreground font-bold text-base">{t("settings.buttonSetup")}</Text>
            <Text className="text-muted-foreground text-xs">{t("settings.buttonSetupDesc")}</Text>
          </View>
          <ChevronRight size={20} color="#8A8480" />
        </Pressable>

        {/* Logout */}
        <Pressable
          onPress={handleLogout}
          className="active:opacity-80 mt-6 mb-2 flex-row items-center justify-center bg-destructive/10 p-4 rounded-2xl border border-destructive/20"
        >
          <LogOut size={20} color="#ef4444" style={{ marginRight: 8 }} />
          <Text className="text-destructive font-bold text-base">{t("settings.logout")}</Text>
        </Pressable>

        {/* App Info */}
        <Text className="text-foreground font-bold text-base mt-6 mb-4 ml-1">{t("settings.about")}</Text>

        <View className="flex-row items-center mb-4 bg-secondary/50 p-4 rounded-[24px]">
          <View className="w-12 h-12 bg-white rounded-full items-center justify-center mr-4">
            <Info size={20} color="#1E2A4A" />
          </View>
          <View className="flex-1">
            <Text className="text-foreground font-bold text-base">Ramis ERP Waiter</Text>
            <Text className="text-muted-foreground text-xs">{t("settings.version")} 0.1.6</Text>
          </View>
        </View>

      </ScrollView>

      {/* Payment Printer Selection Modal */}
      <Modal
        visible={isPaymentPrinterModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsPaymentPrinterModalOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View
            className="bg-card rounded-t-[32px] p-6 max-h-[70%]"
            style={{
              borderCurve: "continuous",
              paddingBottom: Math.max(bottomInset + 16, 24)
            }}
          >
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-foreground text-xl font-bold">{t("settings.paymentPrinter")}</Text>
              <Pressable onPress={() => setIsPaymentPrinterModalOpen(false)} className="active:opacity-80 p-2">
                <Text className="text-primary font-bold">{t("common.cancel")}</Text>
              </Pressable>
            </View>

            {loadingPrinters ? (
              <ActivityIndicator size="large" color="#1E2A4A" className="my-8" />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
                <Pressable
                  onPress={() => {
                    setPaymentPrinterId(null);
                    setIsPaymentPrinterModalOpen(false);
                  }}
                  className={`p-4 rounded-2xl mb-3 flex-row justify-between items-center ${paymentPrinterId === null ? "bg-primary" : "bg-secondary"
                    }`}
                >
                  <Text className={`font-bold ${paymentPrinterId === null ? "text-white" : "text-foreground"}`}>
                    {t("settings.notSelected")}
                  </Text>
                  {paymentPrinterId === null && <Text className="text-white">✓</Text>}
                </Pressable>

                {posPrinters.map((p: any) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setPaymentPrinterId(p.id);
                      setIsPaymentPrinterModalOpen(false);
                    }}
                    className={`p-4 rounded-2xl mb-3 flex-row justify-between items-center ${paymentPrinterId === p.id ? "bg-primary" : "bg-secondary"
                      }`}
                  >
                    <View className="flex-1 mr-2">
                      <Text className={`font-bold ${paymentPrinterId === p.id ? "text-white" : "text-foreground"}`}>
                        {p.name}
                      </Text>
                      <Text className={`text-xs ${paymentPrinterId === p.id ? "text-white/80" : "text-muted-foreground"}`}>
                        {p.ip_address ? `${p.ip_address}:${p.port}` : p.device_path || ""} ({p.connection_type_display})
                      </Text>
                    </View>
                    {paymentPrinterId === p.id && <Text className="text-white">✓</Text>}
                  </Pressable>
                ))}

                {posPrinters.length === 0 && (
                  <Text className="text-muted-foreground text-center py-6">{t("common.noData")}</Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Payment Template Selection Modal */}
      <Modal
        visible={isPaymentTemplateModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsPaymentTemplateModalOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View
            className="bg-card rounded-t-[32px] p-6 max-h-[70%]"
            style={{
              borderCurve: "continuous",
              paddingBottom: Math.max(bottomInset + 16, 24)
            }}
          >
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-foreground text-xl font-bold">{t("settings.paymentTemplate")}</Text>
              <Pressable onPress={() => setIsPaymentTemplateModalOpen(false)} className="active:opacity-80 p-2">
                <Text className="text-primary font-bold">{t("common.cancel")}</Text>
              </Pressable>
            </View>

            {loadingTemplates ? (
              <ActivityIndicator size="large" color="#1E2A4A" className="my-8" />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
                <Pressable
                  onPress={() => {
                    setPaymentTemplateSlug(null);
                    setIsPaymentTemplateModalOpen(false);
                  }}
                  className={`p-4 rounded-2xl mb-3 flex-row justify-between items-center ${paymentTemplateSlug === null ? "bg-primary" : "bg-secondary"
                    }`}
                >
                  <Text className={`font-bold ${paymentTemplateSlug === null ? "text-white" : "text-foreground"}`}>
                    {t("settings.notSelected")}
                  </Text>
                  {paymentTemplateSlug === null && <Text className="text-white">✓</Text>}
                </Pressable>

                {paymentTemplates.map((temp: any) => (
                  <Pressable
                    key={temp.slug}
                    onPress={() => {
                      setPaymentTemplateSlug(temp.slug);
                      setIsPaymentTemplateModalOpen(false);
                    }}
                    className={`p-4 rounded-2xl mb-3 flex-row justify-between items-center ${paymentTemplateSlug === temp.slug ? "bg-primary" : "bg-secondary"
                      }`}
                  >
                    <View className="flex-1 mr-2">
                      <Text className={`font-bold ${paymentTemplateSlug === temp.slug ? "text-white" : "text-foreground"}`}>
                        {temp.name}
                      </Text>
                      <Text className={`text-xs ${paymentTemplateSlug === temp.slug ? "text-white/80" : "text-muted-foreground"}`}>
                        {temp.category_display} ({temp.paper_width} {t("tables.details")})
                      </Text>
                    </View>
                    {paymentTemplateSlug === temp.slug && <Text className="text-white">✓</Text>}
                  </Pressable>
                ))}

                {paymentTemplates.length === 0 && (
                  <Text className="text-muted-foreground text-center py-6">{t("common.noData")}</Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SettingToggle({ title, subtitle, icon, value, onValueChange }: { title: string, subtitle: string, icon: React.ReactNode, value: boolean, onValueChange: (v: boolean) => void }) {
  return (
    <View className="flex-row items-center mb-4 bg-secondary/50 p-4 rounded-[24px]">
      <View className="w-12 h-12 bg-card rounded-full items-center justify-center mr-4">
        {icon}
      </View>
      <View className="flex-1 mr-2">
        <Text className="text-foreground font-bold text-base">{title}</Text>
        <Text className="text-muted-foreground text-[10px]">{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#E0E0E0", true: "#1E2A4A" }}
        thumbColor={"#ffffff"}
      />
    </View>
  );
}
