import React from "react";
import { Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { cn } from "@/utils/cn";

export interface HorizontalStatusTimelineProps {
  flow: readonly string[];
  current: number;
  getLabel: (status: string) => string;
}

export function HorizontalStatusTimeline({ flow, current, getLabel }: HorizontalStatusTimelineProps) {
  return (
    <View className="flex-row items-center justify-between">
      {flow.map((status, idx) => {
        const isPast = idx < current;
        const isCurrent = idx === current;
        return (
          <React.Fragment key={status}>
            <View className="items-center" style={{ minWidth: 56 }}>
              <View
                className={cn(
                  "h-8 w-8 items-center justify-center rounded-full",
                  isCurrent
                    ? "bg-primary"
                    : isPast
                    ? "bg-primary/30"
                    : "bg-muted"
                )}
              >
                {isCurrent ? (
                  <Check size={16} color="#FFFFFF" />
                ) : isPast ? (
                  <Check size={16} color="#1E40AF" />
                ) : (
                  <View className="h-2 w-2 rounded-full bg-muted-foreground" />
                )}
              </View>
              <Text
                className={cn(
                  "mt-1 text-[10px] text-center",
                  isCurrent
                    ? "text-primary font-bold"
                    : isPast
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
                numberOfLines={2}
              >
                {getLabel(status)}
              </Text>
            </View>
            {idx < flow.length - 1 ? (
              <View
                className={cn(
                  "flex-1 h-0.5 mx-1",
                  idx < current ? "bg-primary/40" : "bg-muted"
                )}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

