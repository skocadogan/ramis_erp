import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions, ActivityIndicator } from "react-native";
import { CameraView, Camera } from "expo-camera";
import { ChevronLeft, QrCode } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useI18n } from "../../i18n";

const { width } = Dimensions.get("window");
const SCANNER_SIZE = width * 0.7;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ButtonSetupQrViewProps {
  onScan: (masaId: string) => void;
  onBack: () => void;
  onInvalidQr: () => void;
}

export function ButtonSetupQrView({ onScan, onBack, onInvalidQr }: ButtonSetupQrViewProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const { t } = useI18n();

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
    if (scanned) return;
    const cleanData = data.trim();
    if (UUID_REGEX.test(cleanData)) {
      setScanned(true);
      onScan(cleanData);
    } else {
      setScanned(true);
      onInvalidQr();
      setTimeout(() => setScanned(false), 800);
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
          className="bg-primary px-8 py-3.5 rounded-full active:opacity-85"
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
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      />

      <View style={StyleSheet.absoluteFill} className="justify-between">
        <View className="bg-black/60 flex-1" />
        <View className="flex-row h-[280px]">
          <View className="bg-black/60 flex-1" />
          <View style={{ width: SCANNER_SIZE, height: SCANNER_SIZE }} className="relative">
            <View className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
            <View className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
            <View className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
            <View className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
          </View>
          <View className="bg-black/60 flex-1" />
        </View>
        <View className="bg-black/60 flex-1 items-center px-6 pt-8">
          <Text className="text-white/95 text-center font-semibold text-sm mb-2">
            {t("buttonSetup.scanQrTitle")}
          </Text>
          <Text className="text-white/60 text-center text-xs leading-relaxed max-w-[260px]">
            {t("buttonSetup.scanQrDesc")}
          </Text>
        </View>
      </View>

      <SafeAreaView className="absolute top-0 left-0 right-0" edges={["top"]}>
        <View className="px-4 py-3 flex-row justify-between items-center">
          <Pressable
            onPress={onBack}
            className="w-10 h-10 bg-black/40 rounded-full justify-center items-center active:opacity-80"
          >
            <ChevronLeft size={24} color="#1E2A4A" />
          </Pressable>
          <Text className="text-white text-lg font-bold">{t("buttonSetup.title")}</Text>
          <View className="w-10 h-10" />
        </View>
      </SafeAreaView>
    </View>
  );
}
