// Şube / masa seçim modalı (profile ekranından ayrıldı)

import {
  View,
  Text,
  Modal,
  FlatList,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { MapPin, ChevronRight, XCircle, RefreshCw } from "lucide-react-native";
import { useTheme } from "@/hooks/useTheme";
import type { Language, Table } from "@/types";
import type { BranchOption, SelectedTable } from "@/store/table-store";

export interface ProfileBranchTableModalProps {
  visible: boolean;
  onClose: () => void;
  step: "branch" | "table";
  onStepChange: (step: "branch" | "table") => void;
  language: Language;
  selectedBranch: BranchOption | null;
  selectedTable: SelectedTable | null;
  availableBranches: BranchOption[];
  availableTables: Table[];
  isLoadingBranches: boolean;
  isLoadingTables: boolean;
  branchesError: string | null;
  tablesError: string | null;
  onRefreshBranches: () => void;
  onRefreshTables: (branchId: string) => void;
  onSelectBranch: (branch: BranchOption) => void;
  onSelectTable: (tableId: string, tableName: string, zoneName: string) => void;
}

export function ProfileBranchTableModal({
  visible,
  onClose,
  step,
  onStepChange,
  language,
  selectedBranch,
  selectedTable,
  availableBranches,
  availableTables,
  isLoadingBranches,
  isLoadingTables,
  branchesError,
  tablesError,
  onRefreshBranches,
  onRefreshTables,
  onSelectBranch,
  onSelectTable,
}: ProfileBranchTableModalProps) {
  const { colors } = useTheme();

  const handleClose = () => {
    onClose();
    onStepChange("branch");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      >
        <View
          className="rounded-t-3xl px-6 pt-6 pb-10 max-h-[75%]"
          style={{ backgroundColor: colors.background }}
        >
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center gap-3">
              {step === "table" && selectedBranch ? (
                <Pressable
                  onPress={() => onStepChange("branch")}

                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: colors.muted }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    language === "tr"
                      ? "Şube seçimine dön"
                      : "Back to branch selection"
                  }
                >
                  <ChevronRight
                    size={20}
                    color={colors.icon}
                    strokeWidth={1.8}
                    style={{ transform: [{ rotate: "180deg" }] }}
                  />
                </Pressable>
              ) : null}
              <View>
                <Text
                  className="text-xl font-extrabold"
                  style={{ color: colors.foreground }}
                >
                  {step === "branch"
                    ? language === "tr"
                      ? "Şube Seçimi"
                      : "Branch Selection"
                    : language === "tr"
                      ? "Masa Seçimi"
                      : "Table Selection"}
                </Text>
                <Text
                  className="text-sm"
                  style={{ color: colors.mutedForeground }}
                >
                  {step === "branch"
                    ? language === "tr"
                      ? "Önce bir şube seçin"
                      : "Select a branch first"
                    : language === "tr"
                      ? "Sipariş göndermek için bir masa seçin"
                      : "Select a table to place orders"}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={handleClose}

              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.muted }}
              accessibilityRole="button"
              accessibilityLabel={language === "tr" ? "Kapat" : "Close"}
            >
              <XCircle size={22} color={colors.icon} strokeWidth={1.8} />
            </Pressable>
          </View>

          {step === "branch" ? (
            <>
              <Pressable
                onPress={onRefreshBranches}

                className="flex-row items-center gap-2 mb-4"
                accessibilityRole="button"
                accessibilityLabel={
                  language === "tr" ? "Şubeleri yenile" : "Refresh branches"
                }
              >
                <RefreshCw size={16} color={colors.primary} strokeWidth={1.8} />
                <Text
                  className="text-xs font-bold"
                  style={{ color: colors.primary }}
                >
                  {language === "tr" ? "Şubeleri Yenile" : "Refresh Branches"}
                </Text>
              </Pressable>

              {isLoadingBranches ? (
                <View className="py-10 items-center">
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text
                    className="text-sm font-medium mt-4"
                    style={{ color: colors.mutedForeground }}
                  >
                    {language === "tr"
                      ? "Şubeler yükleniyor..."
                      : "Loading branches..."}
                  </Text>
                </View>
              ) : null}

              {branchesError && !isLoadingBranches ? (
                <View
                  className="border rounded-xl px-4 py-3 mb-4"
                  style={{
                    backgroundColor: `${colors.destructive}1A`,
                    borderColor: colors.destructive,
                  }}
                >
                  <Text
                    className="text-sm font-medium"
                    style={{ color: colors.destructive }}
                  >
                    {branchesError}
                  </Text>
                </View>
              ) : null}

              {!isLoadingBranches ? (
                availableBranches.length === 0 ? (
                  <View className="py-10 items-center">
                    <MapPin size={40} color={colors.icon} strokeWidth={1.5} />
                    <Text
                      className="text-base font-medium mt-4"
                      style={{ color: colors.mutedForeground }}
                    >
                      {language === "tr"
                        ? "Şube bulunamadı"
                        : "No branches found"}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={availableBranches}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8 }}
                    renderItem={({ item }) => {
                      const isSelected = selectedBranch?.id === item.id;
                      return (
                        <Pressable
                          onPress={() => onSelectBranch(item)}

                          className="flex-row items-center gap-4 px-4 py-4 rounded-2xl border-2"
                          style={{
                            backgroundColor: isSelected
                              ? `${colors.primary}1A`
                              : colors.card,
                            borderColor: isSelected
                              ? colors.primary
                              : colors.border,
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={item.name}
                          accessibilityState={{ selected: isSelected }}
                        >
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
                          <View className="flex-1">
                            <Text
                              className="text-base font-bold"
                              style={{ color: colors.foreground }}
                            >
                              {item.name}
                            </Text>
                            {item.code ? (
                              <Text
                                className="text-xs"
                                style={{ color: colors.mutedForeground }}
                              >
                                {item.code}
                              </Text>
                            ) : null}
                          </View>
                          <ChevronRight
                            size={20}
                            color={colors.icon}
                            strokeWidth={1.8}
                          />
                        </Pressable>
                      );
                    }}
                  />
                )
              ) : null}
            </>
          ) : (
            <>
              {selectedBranch ? (
                <View
                  className="flex-row items-center gap-2 px-4 py-2.5 rounded-2xl mb-4"
                  style={{ backgroundColor: colors.muted }}
                >
                  <MapPin
                    size={16}
                    color={colors.mutedForeground}
                    strokeWidth={1.5}
                  />
                  <Text
                    className="text-sm font-medium flex-1"
                    style={{ color: colors.mutedForeground }}
                  >
                    {selectedBranch.name}
                  </Text>
                  <Pressable
                    onPress={() => onStepChange("branch")}

                    accessibilityRole="button"
                    accessibilityLabel={
                      language === "tr" ? "Şube değiştir" : "Change branch"
                    }
                  >
                    <Text
                      className="text-xs font-bold"
                      style={{ color: colors.primary }}
                    >
                      {language === "tr" ? "Değiştir" : "Change"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                onPress={() => onRefreshTables(selectedBranch?.id || "")}

                className="flex-row items-center gap-2 mb-4"
                accessibilityRole="button"
                accessibilityLabel={
                  language === "tr" ? "Masaları yenile" : "Refresh tables"
                }
              >
                <RefreshCw size={16} color={colors.primary} strokeWidth={1.8} />
                <Text
                  className="text-xs font-bold"
                  style={{ color: colors.primary }}
                >
                  {language === "tr" ? "Masaları Yenile" : "Refresh Tables"}
                </Text>
              </Pressable>

              {isLoadingTables ? (
                <View className="py-10 items-center">
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text
                    className="text-sm font-medium mt-4"
                    style={{ color: colors.mutedForeground }}
                  >
                    {language === "tr"
                      ? "Masalar yükleniyor..."
                      : "Loading tables..."}
                  </Text>
                </View>
              ) : null}

              {tablesError && !isLoadingTables ? (
                <View
                  className="border rounded-xl px-4 py-3 mb-4"
                  style={{
                    backgroundColor: `${colors.destructive}1A`,
                    borderColor: colors.destructive,
                  }}
                >
                  <Text
                    className="text-sm font-medium"
                    style={{ color: colors.destructive }}
                  >
                    {tablesError}
                  </Text>
                </View>
              ) : null}

              {!isLoadingTables ? (
                availableTables.length === 0 ? (
                  <View className="py-10 items-center">
                    <MapPin size={40} color={colors.icon} strokeWidth={1.5} />
                    <Text
                      className="text-base font-medium mt-4"
                      style={{ color: colors.mutedForeground }}
                    >
                      {language === "tr"
                        ? "Masa bulunamadı"
                        : "No tables found"}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={availableTables}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8 }}
                    renderItem={({ item }) => {
                      const isSelected = selectedTable?.id === item.id;
                      const isFree =
                        item.status === "FREE" || item.status === "RESERVED";

                      return (
                        <Pressable
                          onPress={() =>
                            onSelectTable(item.id, item.name, item.zoneName)
                          }

                          disabled={!isFree}
                          className={`flex-row items-center gap-4 px-4 py-4 rounded-2xl border-2 ${!isFree ? "opacity-50" : ""}`}
                          style={{
                            backgroundColor: isSelected
                              ? `${colors.primary}1A`
                              : isFree
                                ? colors.card
                                : `${colors.muted}80`,
                            borderColor: isSelected
                              ? colors.primary
                              : isFree
                                ? colors.border
                                : `${colors.border}80`,
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={item.name}
                          accessibilityState={{
                            selected: isSelected,
                            disabled: !isFree,
                          }}
                        >
                          <View
                            className="w-10 h-10 rounded-full items-center justify-center"
                            style={{
                              backgroundColor:
                                item.status === "FREE"
                                  ? `${colors.success}33`
                                  : item.status === "OCCUPIED"
                                    ? `${colors.primary}33`
                                    : item.status === "RESERVED"
                                      ? `${colors.warning}33`
                                      : `${colors.mutedForeground}33`,
                            }}
                          >
                            <Text
                              className="text-base font-extrabold"
                              style={{
                                color:
                                  item.status === "FREE"
                                    ? colors.success
                                    : item.status === "OCCUPIED"
                                      ? colors.primary
                                      : item.status === "RESERVED"
                                        ? colors.warning
                                        : colors.mutedForeground,
                              }}
                            >
                              {item.name.replace(/[^0-9]/g, "")}
                            </Text>
                          </View>
                          <View className="flex-1">
                            <Text
                              className="text-base font-bold"
                              style={{ color: colors.foreground }}
                            >
                              {item.name}
                            </Text>
                            <Text
                              className="text-xs"
                              style={{ color: colors.mutedForeground }}
                            >
                              {item.zoneName}
                              {" · "}
                              {item.capacity}{" "}
                              {language === "tr" ? "kişilik" : "persons"}
                              {" · "}
                              {item.status === "FREE"
                                ? language === "tr"
                                  ? "Boş"
                                  : "Free"
                                : item.status === "OCCUPIED"
                                  ? language === "tr"
                                    ? "Dolu"
                                    : "Occupied"
                                  : item.status === "RESERVED"
                                    ? language === "tr"
                                      ? "Rezerve"
                                      : "Reserved"
                                    : language === "tr"
                                      ? "Dışarıda"
                                      : "Out of Service"}
                            </Text>
                          </View>
                          {isSelected ? (
                            <View
                              className="w-8 h-8 rounded-full items-center justify-center"
                              style={{ backgroundColor: colors.primary }}
                            >
                              <Text
                                style={{
                                  color: colors.primaryForeground,
                                  fontSize: 14,
                                  fontWeight: "bold",
                                }}
                              >
                                ✓
                              </Text>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    }}
                  />
                )
              ) : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
