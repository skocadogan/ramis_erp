import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { CheckCircle, AlertTriangle, XCircle, Info } from "lucide-react-native";

interface CustomDialogProps {
  visible: boolean;
  title: string;
  message: string;
  type?: "info" | "success" | "error" | "warning" | "confirm";
  confirmLabel?: string;
  cancelLabel?: string;
  /** Birincil butonun altında (ör. çıkış) */
  secondaryLabel?: string;
  onSecondary?: () => void;
  onConfirm: () => void;
  onCancel?: () => void;
}

export const CustomDialog: React.FC<CustomDialogProps> = ({
  visible,
  title,
  message,
  type = "info",
  confirmLabel = "Tamam",
  cancelLabel = "İptal",
  secondaryLabel,
  onSecondary,
  onConfirm,
  onCancel,
}) => {
  const getIcon = () => {
    switch (type) {
      case "success":
        return (
          <View className="w-14 h-14 bg-primary/10 dark:bg-primary/20 rounded-full items-center justify-center border border-primary/20">
            <CheckCircle size={28} color="#1E2A4A" />
          </View>
        );
      case "error":
        return (
          <View className="w-14 h-14 bg-destructive/10 dark:bg-destructive/20 rounded-full items-center justify-center border border-destructive/20">
            <XCircle size={28} color="#C53030" />
          </View>
        );
      case "warning":
      case "confirm":
        return (
          <View className="w-14 h-14 bg-amber-50 dark:bg-amber-950/20 rounded-full items-center justify-center border border-amber-100/30">
            <AlertTriangle size={28} color="#F59E0B" />
          </View>
        );
      default:
        return (
          <View className="w-14 h-14 bg-blue-50 dark:bg-blue-950/20 rounded-full items-center justify-center border border-blue-100/30">
            <Info size={28} color="#3B82F6" />
          </View>
        );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 bg-black/60 justify-center items-center px-6">
        <View className="bg-card rounded-2xl p-6 w-full max-w-[320px] items-center shadow-2xl border border-border">
          {getIcon()}

          <Text className="text-foreground font-black text-lg text-center mt-4 tracking-tight">
            {title}
          </Text>

          <Text className="text-muted-foreground text-xs text-center font-bold mt-2.5 px-2 leading-relaxed">
            {message}
          </Text>

          <View className="w-full mt-6 gap-2.5 flex-col">
            <Pressable
              onPress={onConfirm}
              className="active:scale-[0.98] transition-all bg-primary h-14 rounded-xl items-center justify-center shadow-md shadow-primary/15"
            >
              <Text className="text-white font-black text-base">{confirmLabel}</Text>
            </Pressable>

            {type === "confirm" && onCancel ? (
              <Pressable
                onPress={onCancel}
                className="active:scale-[0.98] transition-all bg-secondary h-14 rounded-xl items-center justify-center border border-border/80"
              >
                <Text className="text-foreground/80 font-black text-base">{cancelLabel}</Text>
              </Pressable>
            ) : null}

            {secondaryLabel && onSecondary ? (
              <Pressable
                onPress={onSecondary}
                className="active:scale-[0.98] transition-all h-12 rounded-xl items-center justify-center border border-rose-200/80 dark:border-rose-900/40"
              >
                <Text className="text-destructive font-bold text-base">{secondaryLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
};
export default CustomDialog;
