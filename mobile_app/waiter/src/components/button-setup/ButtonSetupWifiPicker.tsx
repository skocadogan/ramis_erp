import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RefreshCw, Lock, Wifi } from "lucide-react-native";
import { useI18n } from "../../i18n";
import { scanWifiNetworks, mergeWifiNetworks } from "../../features/button-setup/wifiScanner";
import type { ScannedWifiNetwork } from "../../features/button-setup/types";
import { WifiSignalIndicator } from "./WifiSignalIndicator";

interface ButtonSetupWifiPickerProps {
  cachedNetworks: ScannedWifiNetwork[];
  suggestedSsid?: string | null;
  selectedSsid: string;
  password: string;
  onSelectSsid: (ssid: string) => void;
  onPasswordChange: (password: string) => void;
  onContinue: () => void;
}

export function ButtonSetupWifiPicker({
  cachedNetworks,
  suggestedSsid,
  selectedSsid,
  password,
  onSelectSsid,
  onPasswordChange,
  onContinue,
}: ButtonSetupWifiPickerProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 16);
  const [liveNetworks, setLiveNetworks] = useState<ScannedWifiNetwork[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const networks = useMemo(
    () => mergeWifiNetworks(cachedNetworks, liveNetworks, suggestedSsid),
    [cachedNetworks, liveNetworks, suggestedSsid]
  );

  const manualFallback = networks.length === 0;

  useEffect(() => {
    if (suggestedSsid && !selectedSsid) {
      onSelectSsid(suggestedSsid);
    }
  }, [suggestedSsid, selectedSsid, onSelectSsid]);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await scanWifiNetworks({ forceRescan: true, timeoutMs: 8000 });
      setLiveNetworks(list);
    } catch (err) {
      const code = err instanceof Error ? err.message : "scan_failed";
      setError(code);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectedNetwork = networks.find((n) => n.ssid === selectedSsid);
  const canContinue =
    selectedSsid.trim().length > 0 && (!(selectedNetwork?.secure ?? true) || password.length > 0);

  return (
    <View className="flex-1 bg-background px-6 pt-4">
      <Text className="text-foreground text-2xl font-bold mb-1">
        {t("buttonSetup.targetWifiTitle")}
      </Text>
      <Text className="text-muted-foreground text-sm mb-2">{t("buttonSetup.targetWifiDesc")}</Text>
      {cachedNetworks.length > 0 ? (
        <Text className="text-muted-foreground text-xs mb-4">
          {t("buttonSetup.cachedNetworksHint")}
        </Text>
      ) : (
        <View className="mb-4" />
      )}

      <Pressable
        onPress={() => void scan()}
        disabled={loading}
        className="active:opacity-80 flex-row items-center justify-center bg-secondary/60 h-12 rounded-2xl mb-4"
      >
        {loading ? (
          <ActivityIndicator size="small" color="#1E2A4A" />
        ) : (
          <RefreshCw size={18} color="#1E2A4A" />
        )}
        <Text className="text-primary font-bold ml-2">
          {loading ? t("buttonSetup.scanning") : t("buttonSetup.refreshNetworks")}
        </Text>
      </Pressable>

      {error === "location_denied" ? (
        <Text className="text-destructive text-xs font-bold mb-3">
          {t("buttonSetup.errors.locationDenied")}
        </Text>
      ) : null}

      {manualFallback ? (
        <View className="mb-4">
          <Text className="text-amber-600 text-xs font-bold mb-2">
            {t("buttonSetup.manualSsidHint")}
          </Text>
          <Text className="text-muted-foreground text-xs mb-2">{t("buttonSetup.ssidLabel")}</Text>
          <TextInput
            value={selectedSsid}
            onChangeText={onSelectSsid}
            placeholder={t("buttonSetup.ssidPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            className="bg-white border border-border rounded-2xl px-4 h-14 text-foreground font-medium"
          />
        </View>
      ) : null}

      {selectedSsid ? (
        <View className="mb-4">
          <Text className="text-muted-foreground text-xs mb-2 font-bold uppercase tracking-wide">
            {t("buttonSetup.passwordLabel")}
          </Text>
          <TextInput
            value={password}
            onChangeText={onPasswordChange}
            placeholder={t("buttonSetup.passwordPlaceholder")}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            className="bg-white border border-border rounded-2xl px-4 h-14 text-foreground font-medium"
          />
        </View>
      ) : null}

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 8 }}
      >
        {networks.map((network: ScannedWifiNetwork) => {
          const selected = network.ssid === selectedSsid;
          const isSuggested = network.ssid === suggestedSsid;
          return (
            <Pressable
              key={network.ssid}
              onPress={() => onSelectSsid(network.ssid)}
              className={`active:opacity-80 flex-row items-center p-4 rounded-2xl mb-3 ${
                selected ? "bg-primary" : "bg-secondary/50"
              }`}
            >
              <View className="w-10 h-10 bg-white rounded-full items-center justify-center mr-3">
                {network.secure ? (
                  <Lock size={18} color={selected ? "#1E2A4A" : "#64748B"} />
                ) : (
                  <Wifi size={18} color={selected ? "#1E2A4A" : "#64748B"} />
                )}
              </View>
              <View className="flex-1 mr-3 min-w-0">
                <Text
                  className={`font-bold ${selected ? "text-white" : "text-foreground"}`}
                  numberOfLines={1}
                >
                  {network.ssid}
                  {isSuggested ? ` (${t("buttonSetup.suggestedNetwork")})` : ""}
                </Text>
              </View>
              <WifiSignalIndicator
                level={network.level}
                activeColor={selected ? "#ffffff" : "#1E2A4A"}
                inactiveColor={selected ? "rgba(255,255,255,0.35)" : "#D1D5DB"}
              />
            </Pressable>
          );
        })}

        {!loading && networks.length === 0 ? (
          <Text className="text-muted-foreground text-center py-8">
            {t("buttonSetup.noNetworksFound")}
          </Text>
        ) : null}
      </ScrollView>

      <View style={{ paddingBottom: bottomInset }}>
        <Pressable
          onPress={onContinue}
          disabled={!canContinue}
          className={`h-14 rounded-[24px] items-center justify-center ${
            canContinue ? "bg-primary active:opacity-80" : "bg-muted"
          }`}
        >
          <Text
            className={`font-bold text-base ${canContinue ? "text-white" : "text-muted-foreground"}`}
          >
            {t("buttonSetup.continue")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
