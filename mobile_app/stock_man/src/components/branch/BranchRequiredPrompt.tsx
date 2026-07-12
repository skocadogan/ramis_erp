import React from "react";
import { View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { BranchSelectorBar } from "./BranchSelectorBar";
import { useI18n } from "@/i18n";

export interface BranchRequiredPromptProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
}

/** Shown when no branch is selected; includes the branch picker bar. */
export function BranchRequiredPrompt({
  title,
  subtitle,
  icon,
}: BranchRequiredPromptProps) {
  const { t } = useI18n();
  return (
    <Screen padded>
      <Header title={title} subtitle={subtitle} />
      <View className="mt-4">
        <BranchSelectorBar />
        <Card className="mt-3">
          <EmptyState
            icon={icon}
            title={t("branches.select")}
            description={t("branches.selectHelper")}
          />
        </Card>
      </View>
    </Screen>
  );
}

