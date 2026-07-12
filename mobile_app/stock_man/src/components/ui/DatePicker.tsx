import React, { useState } from "react";
import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import DateTimePicker, {
  type DateTimePickerChangeEvent,
} from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import { useFormatters } from "@/hooks/useFormatters";
import { useI18n } from "@/i18n";

interface DatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  label?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}

export function DatePicker({
  value,
  onChange,
  label,
  minimumDate,
  maximumDate,
}: DatePickerProps) {
  const [show, setShow] = useState(false);
  const { date: formatDate } = useFormatters();
  const { t } = useI18n();

  const handleValueChange = (
    _event: DateTimePickerChangeEvent,
    selectedDate: Date
  ) => {
    if (Platform.OS === "android") {
      setShow(false);
    }
    if (Number.isNaN(selectedDate.getTime())) {
      return;
    }
    onChange(selectedDate);
  };

  const handleDismiss = () => {
    setShow(false);
  };

  const togglePicker = () => {
    setShow((prev) => !prev);
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      
      <Pressable
        onPress={togglePicker}
        style={styles.pickerButton}
        accessibilityRole="button"
        accessibilityLabel={label || t("common.selectDate")}
      >
        <Text style={styles.valueText}>{formatDate(value)}</Text>
        <Calendar size={18} color="#64748B" />
      </Pressable>

      {show && (
        <DateTimePicker
          value={value}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onValueChange={handleValueChange}
          onDismiss={handleDismiss}
          onNeutralButtonPress={handleDismiss}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    width: "100%",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 4,
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    minHeight: 44,
  },
  valueText: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
  },
});

