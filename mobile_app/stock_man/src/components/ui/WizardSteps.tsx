import { Text, View } from "react-native";
import { cn } from "@/utils/cn";

type WizardStepDef<K extends number = number> = {
  key: K;
  i18nKey: string;
};

interface WizardStepsProps<K extends number> {
  steps: readonly WizardStepDef<K>[];
  currentStep: K;
  t: (key: string) => string;
}

export function WizardSteps<K extends number>({
  steps,
  currentStep,
  t,
}: WizardStepsProps<K>) {
  const currentIndex = steps.findIndex((s) => s.key === currentStep);
  const currentLabel =
    currentIndex >= 0 ? t(steps[currentIndex]!.i18nKey) : "";

  return (
    <View className="px-4 pt-2 pb-1">
      <View className="flex-row gap-1.5">
        {steps.map((s) => {
          const isCurrent = s.key === currentStep;
          const isPast = s.key < currentStep;
          return (
            <View
              key={s.key}
              className={cn(
                "flex-1 h-1.5 rounded-full",
                isCurrent
                  ? "bg-primary"
                  : isPast
                    ? "bg-primary/40"
                    : "bg-muted"
              )}
            />
          );
        })}
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-caption text-muted-foreground">
          {currentLabel}
        </Text>
      </View>
    </View>
  );
}
