import React, { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { CheckCircle2 } from "lucide-react-native";
import apiClient from "../api/client";
import { usePosStore } from "../store/usePosStore";
import { useI18n } from "../i18n";

export interface PosTerminalDto {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  has_open_shift_at_terminal?: boolean;
}

type Props = {
  branchId: string;
  /** Örn. useFocusEffect ile artırılarak liste yenilenir */
  refreshKey?: number;
  onTerminalPersisted?: () => void;
};

export function PosTerminalList({ branchId, refreshKey = 0, onTerminalPersisted }: Props) {
  const { t } = useI18n();
  const posTerminalUuid = usePosStore((s) => s.posTerminalUuid);
  const persistTerminalSelection = usePosStore((s) => s.persistTerminalSelection);

  const [terminals, setTerminals] = useState<PosTerminalDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetchTerminals = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get("/pos-display/terminals/", {
        params: { branch_id: branchId },
      });
      const data = Array.isArray(response.data) ? response.data : response.data.results || [];
      setTerminals(data.filter((term: PosTerminalDto) => term.is_active));
    } catch (error) {
      console.error("Fetch terminals failed:", error);
      Alert.alert(t("terminalSelect.errorTitle"), t("terminalSelect.errorFetch"));
    } finally {
      setIsLoading(false);
    }
  }, [branchId, t]);

  useEffect(() => {
    void fetchTerminals();
  }, [fetchTerminals, refreshKey]);

  const handleSelect = async (terminal: PosTerminalDto) => {
    try {
      setBusy(true);
      await persistTerminalSelection(terminal.code, terminal.id);
      onTerminalPersisted?.();
    } catch {
      Alert.alert(t("terminalSelect.errorTitle"), t("terminalSelect.errorSelect"));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading && terminals.length === 0) {
    return <ActivityIndicator size="large" color="#1E2A4A" className="mt-8" />;
  }

  return (
    <View className="gap-4">
      {terminals.map((terminal) => (
        <Pressable
          key={terminal.id}
          disabled={busy}
          onPress={() => handleSelect(terminal)}
          className={`active:opacity-80 p-6 rounded-[24px] border flex-row items-center justify-between ${
            posTerminalUuid === terminal.id
              ? "bg-primary border-primary"
              : "bg-secondary border-border"
          }`}
        >
          <View className="flex-1">
            <Text
              className={`font-bold text-lg ${posTerminalUuid === terminal.id ? "text-white" : "text-foreground"}`}
            >
              {terminal.name}
            </Text>
            <View className="flex-row items-center mt-1">
              <View
                className={`w-2 h-2 rounded-full mr-2 ${
                  terminal.has_open_shift_at_terminal ? "bg-green-500" : "bg-muted"
                }`}
              />
              <Text
                className={`text-xs ${posTerminalUuid === terminal.id ? "text-white/80" : "text-muted-foreground"}`}
              >
                {terminal.has_open_shift_at_terminal
                  ? t("terminalSelect.shiftOpen")
                  : t("terminalSelect.shiftClosed")}
              </Text>
            </View>
          </View>
          {posTerminalUuid === terminal.id ? <CheckCircle2 size={24} color="#ffffff" /> : null}
        </Pressable>
      ))}

      {terminals.length === 0 ? (
        <View className="items-center justify-center py-12">
          <Text className="text-muted-foreground">{t("terminalSelect.noTerminal")}</Text>
        </View>
      ) : null}
    </View>
  );
}
