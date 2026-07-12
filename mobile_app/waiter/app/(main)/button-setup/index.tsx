import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import * as SecureStore from "expo-secure-store";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "../../../src/i18n";
import { CustomDialog } from "../../../src/components/CustomDialog";
import { ButtonSetupWifiPicker } from "../../../src/components/button-setup/ButtonSetupWifiPicker";
import { ButtonSetupQrView } from "../../../src/components/button-setup/ButtonSetupQrView";
import {
  INITIAL_WIZARD_STATE,
  ESP_SETUP_AP_SSID,
  type ButtonSetupStep,
  type ButtonSetupWizardState,
  type ScannedWifiNetwork,
} from "../../../src/features/button-setup/types";
import {
  getCurrentWifiSsid,
  isConnectedToSetupAp,
  subscribeSetupApConnection,
} from "../../../src/features/button-setup/wifiMonitor";
import { scanWifiNetworks } from "../../../src/features/button-setup/wifiScanner";
import { extractRamisHostPort } from "../../../src/features/button-setup/ramisHost";
import {
  ButtonSetupApiError,
  postButtonSetup,
} from "../../../src/features/button-setup/buttonSetupApi";
import { fetchTables } from "../../../src/api/waiterApi";
import { useAuthStore } from "../../../src/store/useAuthStore";
import { usePosStore } from "../../../src/store/usePosStore";
import { effectiveBranchId } from "../../../src/utils/branchScope";

export default function ButtonSetupScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const activeBranchId = usePosStore((s) => s.activeBranchId);
  const branchId = effectiveBranchId(user?.branchId, activeBranchId);

  const [state, setState] = useState<ButtonSetupWizardState>(INITIAL_WIZARD_STATE);

  /** WiFi taraması UI'ı bloklamaz; connectAp adımına anında geçilir. */
  const enrichSetupContext = useCallback(async () => {
    const [networks, ssid] = await Promise.all([
      scanWifiNetworks({ forceRescan: false, timeoutMs: 5000 }).catch(
        () => [] as ScannedWifiNetwork[]
      ),
      getCurrentWifiSsid().catch(() => null),
    ]);

    const previousSsid = ssid && ssid !== ESP_SETUP_AP_SSID ? ssid : null;

    setState((prev) => {
      if (prev.step === "confirm") {
        return prev;
      }
      return {
        ...prev,
        cachedNetworks: networks.length > 0 ? networks : prev.cachedNetworks,
        previousSsid: previousSsid ?? prev.previousSsid,
        selectedSsid: prev.selectedSsid || previousSsid || "",
      };
    });
  }, []);

  const beginConnectApStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: "connectAp",
    }));
    void enrichSetupContext();
  }, [enrichSetupContext]);

  useEffect(() => {
    if (state.step !== "confirm") {
      return;
    }
    void enrichSetupContext();
  }, [state.step, enrichSetupContext]);

  const { data: tables = [] } = useQuery({
    queryKey: ["tables", branchId] as const,
    queryFn: () => fetchTables(branchId!),
    enabled: !!branchId,
  });

  const setStep = useCallback((step: ButtonSetupStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const resetWizard = useCallback(() => {
    setState((prev) => ({
      ...INITIAL_WIZARD_STATE,
      step: "confirm",
      previousSsid: prev.previousSsid,
    }));
  }, []);

  const proceedAfterApConnected = useCallback(async () => {
    setState((prev) => {
      if (prev.step !== "connectAp") {
        return prev;
      }
      return {
        ...prev,
        step: "selectWifi",
        selectedSsid: "",
        wifiPassword: "",
        masaId: "",
        tableName: "",
        errorMessage: "",
      };
    });
  }, []);

  useEffect(() => {
    if (state.step !== "connectAp") return;
    const unsub = subscribeSetupApConnection(() => {
      void proceedAfterApConnected();
    });
    return unsub;
  }, [state.step, proceedAfterApConnected]);

  const openWifiSettings = useCallback(() => {
    if (Platform.OS === "android") {
      void Linking.sendIntent("android.settings.WIFI_SETTINGS").catch(() => {
        void Linking.openSettings();
      });
    } else {
      void Linking.openSettings();
    }
  }, []);

  const resolveTableName = useCallback(
    (masaId: string) => {
      const table = tables.find((tbl) => String(tbl.id).toLowerCase() === masaId.toLowerCase());
      if (table?.name) {
        return String(table.name);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((table as any)?.table_number != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return `Masa ${(table as any).table_number}`;
      }
      return masaId.slice(0, 8);
    },
    [tables]
  );

  const submitSetup = useCallback(
    async (masaId: string) => {
      setStep("submitting");
      try {
        const serverUrl = await SecureStore.getItemAsync("server_url");
        if (!serverUrl) {
          setState((prev) => ({
            ...prev,
            step: "error",
            errorMessage: t("buttonSetup.errors.noServerUrl"),
          }));
          return;
        }

        const resolvedTableName = resolveTableName(masaId);
        const ramis_ip = extractRamisHostPort(serverUrl);
        await postButtonSetup({
          ssid: state.selectedSsid,
          password: state.wifiPassword,
          ramis_ip,
          masa: masaId,
          masa_name: resolvedTableName,
        });

        setState((prev) => ({
          ...prev,
          step: "success",
          masaId,
          tableName: resolvedTableName,
          errorMessage: "",
        }));
      } catch (err) {
        let message = t("buttonSetup.errors.unknown");
        if (err instanceof ButtonSetupApiError) {
          if (err.code === "timeout") {
            message = t("buttonSetup.errors.espTimeout");
          } else if (err.code === "rejected") {
            message = t("buttonSetup.errors.espRejected");
          } else {
            message = t("buttonSetup.errors.espTimeout");
          }
        }
        setState((prev) => ({
          ...prev,
          step: "error",
          errorMessage: message,
        }));
      }
    },
    [resolveTableName, setStep, state.selectedSsid, state.wifiPassword, t]
  );

  const handleQrScan = useCallback(
    (masaId: string) => {
      void submitSetup(masaId);
    },
    [submitSetup]
  );

  const handleInvalidQr = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: "error",
      errorMessage: t("buttonSetup.errors.invalidQr"),
    }));
  }, [t]);

  if (state.step === "selectWifi") {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <View className="px-4 py-4 flex-row items-center">
          <Pressable onPress={() => setStep("connectAp")} className="active:opacity-80 p-2">
            <ChevronLeft size={28} color="#1E2A4A" />
          </Pressable>
          <Text className="text-foreground text-xl font-bold flex-1 text-center mr-10">
            {t("buttonSetup.title")}
          </Text>
        </View>
        <ButtonSetupWifiPicker
          cachedNetworks={state.cachedNetworks}
          suggestedSsid={state.previousSsid}
          selectedSsid={state.selectedSsid}
          password={state.wifiPassword}
          onSelectSsid={(ssid) => setState((prev) => ({ ...prev, selectedSsid: ssid }))}
          onPasswordChange={(wifiPassword) => setState((prev) => ({ ...prev, wifiPassword }))}
          onContinue={() => setStep("scanQr")}
        />
      </SafeAreaView>
    );
  }

  if (state.step === "scanQr") {
    return (
      <ButtonSetupQrView
        onScan={handleQrScan}
        onBack={() => setStep("selectWifi")}
        onInvalidQr={handleInvalidQr}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 py-4 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="active:opacity-80 p-2">
          <ChevronLeft size={28} color="#1E2A4A" />
        </Pressable>
        <Text className="text-foreground text-2xl font-bold">{t("buttonSetup.title")}</Text>
        <View className="w-10" />
      </View>

      <View className="flex-1 px-6 justify-center items-center">
        <Text className="text-muted-foreground text-center text-sm leading-6">
          {t("buttonSetup.screenHint")}
        </Text>
      </View>

      <CustomDialog
        visible={state.step === "confirm"}
        title={t("buttonSetup.confirmTitle")}
        message={t("buttonSetup.confirmMessage")}
        type="confirm"
        confirmLabel={t("qrScanner.ok")}
        cancelLabel={t("common.cancel")}
        onConfirm={beginConnectApStep}
        onCancel={() => router.back()}
      />

      <CustomDialog
        visible={state.step === "connectAp"}
        title={t("buttonSetup.connectApTitle")}
        message={t("buttonSetup.connectApMessage")}
        type="confirm"
        confirmLabel={t("buttonSetup.continue")}
        cancelLabel={t("buttonSetup.openWifiSettings")}
        onConfirm={async () => {
          const connected = await isConnectedToSetupAp();
          if (connected) {
            await proceedAfterApConnected();
          } else {
            setState((prev) => ({
              ...prev,
              step: "error",
              errorMessage: t("buttonSetup.errors.notOnSetupAp"),
            }));
          }
        }}
        onCancel={openWifiSettings}
      />

      {state.step === "connectAp" ? (
        <View className="absolute bottom-16 left-0 right-0 items-center px-6">
          <Text className="text-muted-foreground text-xs text-center">
            {t("buttonSetup.waitingForAp")}
          </Text>
        </View>
      ) : null}

      {state.step === "submitting" ? (
        <View className="absolute inset-0 bg-black/50 justify-center items-center">
          <View className="bg-white rounded-[32px] p-8 items-center mx-6">
            <ActivityIndicator size="large" color="#1E2A4A" />
            <Text className="text-foreground font-bold mt-4">{t("buttonSetup.submitting")}</Text>
          </View>
        </View>
      ) : null}

      <CustomDialog
        visible={state.step === "success"}
        title={t("common.success")}
        message={
          state.previousSsid
            ? `${t("buttonSetup.successMessage", { tableName: state.tableName })}\n\n${t("buttonSetup.reconnectWifi", { ssid: state.previousSsid })}`
            : t("buttonSetup.successMessage", { tableName: state.tableName })
        }
        type="success"
        confirmLabel={t("buttonSetup.setupAnother")}
        onConfirm={resetWizard}
      />

      {state.step === "success" && state.previousSsid ? (
        <View className="absolute bottom-10 left-6 right-6">
          <Pressable
            onPress={openWifiSettings}
            className="active:opacity-80 bg-secondary h-14 rounded-[24px] items-center justify-center"
          >
            <Text className="text-foreground font-bold text-sm text-center px-4">
              {t("buttonSetup.openWifiSettings")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <CustomDialog
        visible={state.step === "error"}
        title={t("common.error")}
        message={state.errorMessage}
        type="error"
        confirmLabel={t("qrScanner.ok")}
        onConfirm={() => {
          if (state.masaId) {
            setStep("scanQr");
          } else if (state.selectedSsid) {
            setStep("scanQr");
          } else {
            setStep("connectAp");
          }
        }}
      />
    </SafeAreaView>
  );
}
