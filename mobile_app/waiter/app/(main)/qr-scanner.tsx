import React, { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions, ActivityIndicator } from "react-native";
import { CameraView, Camera } from "expo-camera";
import { useRouter } from "expo-router";
import { ChevronLeft, QrCode } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "../../src/i18n";
import { useAuthStore } from "../../src/store/useAuthStore";
import { usePosStore } from "../../src/store/usePosStore";
import { effectiveBranchId } from "../../src/utils/branchScope";
import { fetchTables } from "../../src/api/waiterApi";
import { CustomDialog } from "../../src/components/CustomDialog";

const { width } = Dimensions.get("window");
const SCANNER_SIZE = width * 0.7;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function QRScannerScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const router = useRouter();
  const { t } = useI18n();

  const user = useAuthStore((s) => s.user);
  const activeBranchId = usePosStore((s) => s.activeBranchId);
  const branchId = effectiveBranchId(user?.branchId, activeBranchId);

  // Özel Dialog (Modal) State'leri
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<{
    title: string;
    message: string;
    type: "info" | "success" | "error" | "warning" | "confirm";
    onConfirm: () => void;
  }>({
    title: "",
    message: "",
    type: "info",
    onConfirm: () => {},
  });

  // Garsona atanan masaları çek (önbellekten veya API'den)
  const { data: tables = [], isLoading: tablesLoading } = useQuery({
    queryKey: ["tables", branchId] as const,
    queryFn: () => fetchTables(branchId!),
    enabled: !!branchId,
  });

  const askForPermission = async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    } catch (err) {
      console.error("Kamera izni istenirken hata oluştu:", err);
      setHasPermission(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Camera.getCameraPermissionsAsync();
        if (status === "granted") {
          setHasPermission(true);
        } else {
          const { status: askStatus } = await Camera.requestCameraPermissionsAsync();
          setHasPermission(askStatus === "granted");
        }
      } catch (err) {
        console.error("Kamera izinleri sorgulanırken hata oluştu:", err);
        setHasPermission(false);
      }
    })();
  }, []);

  const handleBarcodeScanned = ({ data }: { type: string; data: string }) => {
    if (scanned || tablesLoading || dialogVisible) return;
    
    const cleanData = data.trim();
    
    // Basit UUID kontrolü
    if (UUID_REGEX.test(cleanData)) {
      setScanned(true);

      // Garsona atanan masalar arasında bu ID'ye sahip masa var mı?
      const hasTable = tables.some(
        (tbl: any) => String(tbl.id).toLowerCase() === cleanData.toLowerCase()
      );

      if (hasTable) {
        // Garson bu masadan sorumlu, sipariş ekranına yönlendir
        router.replace(`/(main)/table/${cleanData}`);
      } else {
        // Garson bu masadan sorumlu değil, uyarı diyalogunu aç ve onayda ana sayfaya dön
        setDialogConfig({
          title: t("qrScanner.authorityLimit"),
          message: t("qrScanner.notYourTable"),
          type: "warning",
          onConfirm: () => {
            setDialogVisible(false);
            router.replace("/(main)");
          },
        });
        setDialogVisible(true);
      }
    } else {
      setScanned(true);
      setDialogConfig({
        title: t("common.error"),
        message: t("qrScanner.invalidQrCode"),
        type: "error",
        onConfirm: () => {
          setDialogVisible(false);
          setScanned(false);
        },
      });
      setDialogVisible(true);
    }
  };

  if (hasPermission === null) {
    return (
      <View className="flex-1 bg-[#090D16] justify-center items-center">
        <ActivityIndicator size="large" color="#1E2A4A" />
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView className="flex-1 bg-[#090D16] justify-center items-center px-6">
        <View className="bg-primary/10 p-6 rounded-full mb-6">
          <QrCode size={50} color="#1E2A4A" />
        </View>
        <Text className="text-white text-xl font-bold text-center mb-3">
          {t("qrScanner.cameraPermissionRequired")}
        </Text>
        <Text className="text-gray-400 text-center mb-8 leading-5">
          {t("qrScanner.cameraPermissionDesc")}
        </Text>
        <Pressable
          onPress={askForPermission}
          className="bg-primary px-8 py-3.5 rounded-xl active:opacity-85 shadow-lg shadow-primary/20"
        >
          <Text className="text-white font-bold text-base">{t("qrScanner.grantPermission")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-[#090D16]">
      <CameraView
        style={StyleSheet.absoluteFill}
        onBarcodeScanned={scanned || tablesLoading || dialogVisible ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
      />

      {/* Masked Overlay (Center Transparent Square, Around Semi-Transparent Black) */}
      <View style={StyleSheet.absoluteFill} className="justify-between">
        {/* Top Dark Bar */}
        <View className="bg-black/60 flex-1 justify-center" />

        {/* Center Scanner Row */}
        <View className="flex-row h-[280px]">
          {/* Left Dark Block */}
          <View className="bg-black/60 flex-1" />

          {/* Transparent Camera Area with Custom Corners */}
          <View style={{ width: SCANNER_SIZE, height: SCANNER_SIZE }} className="relative justify-center items-center">
            {/* Edge Corner Markers */}
            {/* Top-Left */}
            <View className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
            {/* Top-Right */}
            <View className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
            {/* Bottom-Left */}
            <View className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
            {/* Bottom-Right */}
            <View className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />

            {/* Scanning Line Animation Effect */}
            <View className="w-full h-[2px] bg-primary/70 shadow-lg shadow-primary" />

            {/* Tables Loading Overlay */}
            {tablesLoading && (
              <View style={StyleSheet.absoluteFill} className="bg-black/40 justify-center items-center rounded-xl">
                <ActivityIndicator size="small" color="#1E2A4A" />
                <Text className="text-white text-xs mt-2 font-medium">{t("qrScanner.loadingTables")}</Text>
              </View>
            )}
          </View>

          {/* Right Dark Block */}
          <View className="bg-black/60 flex-1" />
        </View>

        {/* Bottom Dark Bar */}
        <View className="bg-black/60 flex-1 items-center px-6 pt-8">
          <Text className="text-white/95 text-center font-semibold text-sm mb-2">
            {t("qrScanner.alignQrCode")}
          </Text>
          <Text className="text-white/60 text-center text-xs leading-relaxed max-w-[240px]">
            {t("qrScanner.alignQrCodeDesc")}
          </Text>
        </View>
      </View>

      {/* Header Overlay */}
      <SafeAreaView className="absolute top-0 left-0 right-0" edges={["top"]}>
        <View className="px-4 py-3 flex-row justify-between items-center">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 bg-black/40 rounded-full justify-center items-center active:opacity-80"
          >
            <ChevronLeft size={24} color="#1E2A4A" />
          </Pressable>
          <Text className="text-white text-lg font-bold">{t("qrScanner.title")}</Text>
          <View className="w-10 h-10" />
        </View>
      </SafeAreaView>

      {/* Custom Dialog (Alert Yerine Özel Modal) */}
      <CustomDialog
        visible={dialogVisible}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        confirmLabel={t("qrScanner.ok")}
        onConfirm={dialogConfig.onConfirm}
      />
    </View>
  );
}
