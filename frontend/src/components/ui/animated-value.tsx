"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Değer değiştiğinde fade-in + hafif slide-up animasyonu oynatan sarıcı.
 *
 * WebSocket / polling ile sık güncellenen KPI kartlarında sayıların
 * aniden değişmesini yumuşatır.
 */
export function AnimatedValue({
  value,
  format,
  className,
}: {
  value: number | string;
  format?: (v: number) => string;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const [animKey, setAnimKey] = useState(0);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      setDisplayValue(value);
      setAnimKey((k) => k + 1);
    }
  }, [value]);

  const rendered =
    typeof displayValue === "number" && format
      ? format(displayValue)
      : displayValue;

  return (
    <span
      key={animKey}
      className={className}
      style={{
        animation: animKey > 0 ? "kpi-change 0.35s ease-out" : "none",
      }}
    >
      {rendered}
    </span>
  );
}
