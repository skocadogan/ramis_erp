// ============================================================
// Smart Table — Global Error Boundary
// Kritik hatalarda uygulamanın çökmesini engeller,
// kullanıcıya yeniden başlatma seçeneği sunar.
// ============================================================

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text, Pressable, Appearance } from "react-native";

interface Props {
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

const lightColors = {
  background: "#FAFAFA",
  foreground: "#1A1A2E",
  primary: "#D94A3D",
  primaryForeground: "#FFFFFF",
  muted: "#F0F0F0",
  mutedForeground: "#6B7280",
};

const darkColors = {
  background: "#0F0F1A",
  foreground: "#EDEDED",
  primary: "#E85D04",
  primaryForeground: "#FFFFFF",
  muted: "#2B2D42",
  mutedForeground: "#9CA3AF",
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const scheme = Appearance.getColorScheme();
    const isDark = scheme === "dark";
    const colors = isDark ? darkColors : lightColors;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: colors.muted,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <Text style={{ fontSize: 40 }}>⚠️</Text>
        </View>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: colors.foreground,
            marginBottom: 12,
            textAlign: "center",
          }}
        >
          Bir sorun oluştu
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: colors.mutedForeground,
            textAlign: "center",
            marginBottom: 32,
            lineHeight: 22,
          }}
        >
          Uygulama beklenmedik bir hatayla karşılaştı. Tekrar denemek için
          aşağıdaki butona basabilirsiniz.
        </Text>
        <Pressable
          onPress={this.handleRetry}
          style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 28,
            paddingVertical: 14,
            borderRadius: 16,
          }}
        >
          <Text
            style={{
              color: colors.primaryForeground,
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            Tekrar Dene
          </Text>
        </Pressable>
      </View>
    );
  }
}
