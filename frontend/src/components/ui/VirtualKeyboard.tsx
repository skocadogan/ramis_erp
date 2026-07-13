"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Delete, CornerDownLeft, Undo2, Keyboard } from "lucide-react";

/** Türkçe Q fiziksel klavye harf sırası (rakam sırası yok). */
const TR_Q_ROWS: string[][] = [
  ["q", "w", "e", "r", "t", "y", "u", "ı", "o", "p", "ğ", "ü"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ş", "i"],
  ["z", "x", "c", "v", "b", "n", "m", "ö", "ç"],
];

const NUMERIC_KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3"] as const;

export type VirtualKeyboardMode = "alpha" | "numeric";

export type VirtualKeyboardProps = {
  value: string;
  onChange: (next: string) => void;
  /** Kontrollü mod için; verilmezse iç state kullanılır */
  mode?: VirtualKeyboardMode;
  defaultMode?: VirtualKeyboardMode;
  onModeChange?: (mode: VirtualKeyboardMode) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  /** 123 / ABC geçişini göster */
  showModeToggle?: boolean;
  className?: string;
};

function trLocaleUpperChar(ch: string): string {
  if (ch.length !== 1) return ch;
  return ch.toLocaleUpperCase("tr-TR");
}

interface KeyButtonProps {
  children: ReactNode;
  className?: string;
  label: string;
  onPress: (val?: string) => void;
  variant?: "default" | "accent" | "wide" | "danger";
  value?: string;
  /** Arrow key navigasyon grid indeksi (verilmezse Tab sırasında kalır) */
  keyIndex?: number;
  /** Bu tuş şu anda arrow key ile odaklanmış mı? */
  isFocused?: boolean;
  /** Arrow key odak değişimini üst bileşene bildirir */
  onKeyFocus?: (index: number) => void;
}

/** 
 * Memoize edilmiş tuş bileşeni. 
 * Her harf basışında tüm klavyenin re-render olmasını engeller.
 */
const KeyButton = memo(function KeyButton({
  children,
  className,
  label,
  onPress,
  variant = "default",
  value,
  keyIndex,
  isFocused = false,
  onKeyFocus,
}: KeyButtonProps) {
  const handlePress = useCallback(() => {
    onPress(value);
  }, [onPress, value]);

  const handleFocus = useCallback(() => {
    if (keyIndex !== undefined && onKeyFocus) {
      onKeyFocus(keyIndex);
    }
  }, [keyIndex, onKeyFocus]);

  return (
    <button
      type="button"
      aria-label={label}
      data-key-index={keyIndex}
      tabIndex={keyIndex !== undefined ? -1 : undefined}
      onClick={handlePress}
      onFocus={handleFocus}
      className={cn(
        "inline-flex min-h-[48px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border px-2 py-2 text-base font-semibold transition-[transform,background-color] select-none touch-manipulation active:scale-[0.97] focus:outline-none",
        "border-border bg-card text-foreground hover:bg-muted",
        variant === "accent" &&
          "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 dark:border-primary/50 dark:bg-primary/10 dark:text-primary dark:hover:bg-primary/15",
        variant === "danger" &&
          "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 dark:border-destructive/50 dark:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/15",
        variant === "wide" && "min-w-0 flex-1 px-3",
        isFocused && "ring-2 ring-primary ring-offset-1 ring-offset-muted/70",
        className,
      )}
    >
      {children}
    </button>
  );
});

export function VirtualKeyboard({
  value,
  onChange,
  mode: modeProp,
  defaultMode = "numeric",
  onModeChange,
  onSubmit,
  onCancel,
  showModeToggle = true,
  className,
}: VirtualKeyboardProps) {
  const t = useTranslations("common.virtualKeyboard");
  const [internalMode, setInternalMode] = useState<VirtualKeyboardMode>(defaultMode);
  const mode = modeProp ?? internalMode;
  const shiftOnceRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedKeyIndex, setFocusedKeyIndex] = useState<number>(0);

  // --- Arrow key grid haritası ---
  // Her mod için 2B grid: satır → o satırdaki tuş indeksleri
  const keyGrid = useMemo((): number[][] => {
    if (mode === "numeric") {
      return [
        [0, 1, 2, 3],      // 7 8 9 ⌫
        [4, 5, 6, 7],      // 4 5 6 +
        [8, 9, 10, 11],    // 1 2 3 −
        [12, 13, 14, 15],  // . 0 iptal enter
      ];
    }
    // alpha: 4 satır, farklı sütun sayıları
    return [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],           // q..ü (12 sütun)
      [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],      // a..i (11 sütun)
      [23, 24, 25, 26, 27, 28, 29, 30, 31, 32],          // ⇧ z..ç (10 sütun)
      [33, 34, 35, 36],                                    // iptal boşluk ⌫ enter (4 sütun)
    ];
  }, [mode]);

  // Grid içinde indeksin satır/sütun konumunu bul
  const findKeyPosition = useCallback(
    (idx: number): [number, number] | null => {
      for (let r = 0; r < keyGrid.length; r++) {
        for (let c = 0; c < keyGrid[r].length; c++) {
          if (keyGrid[r][c] === idx) return [r, c];
        }
      }
      return null;
    },
    [keyGrid],
  );

  // Tuşu DOM'dan bulup odakla
  const focusKey = useCallback((index: number) => {
    const el = containerRef.current?.querySelector(
      `[data-key-index="${index}"]`,
    ) as HTMLElement | null;
    el?.focus();
  }, []);

  // Arrow key / Enter / Space yönetimi (container üzerinde event delegation)
  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Mod değiştirme butonları veya başka elemanlardan gelen event'leri yoksay
      const target = e.target as HTMLElement;
      if (!target?.getAttribute?.("data-key-index")) {
        // Eğer odak grid dışı bir elemandaysa, ilk grid tuşuna dön
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          focusKey(keyGrid[0][0]);
          setFocusedKeyIndex(keyGrid[0][0]);
        }
        return;
      }

      const pos = findKeyPosition(focusedKeyIndex);
      if (!pos) {
        // Pozisyon bulunamazsa ilk tuşa dön
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          focusKey(keyGrid[0][0]);
          setFocusedKeyIndex(keyGrid[0][0]);
        }
        return;
      }

      const [row, col] = pos;
      let newRow = row;
      let newCol = col;

      switch (e.key) {
        case "ArrowUp":
          newRow = Math.max(0, row - 1);
          break;
        case "ArrowDown":
          newRow = Math.min(keyGrid.length - 1, row + 1);
          break;
        case "ArrowLeft":
          newCol = Math.max(0, col - 1);
          break;
        case "ArrowRight":
          newCol = Math.min(keyGrid[row].length - 1, col + 1);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          target.click();
          return;
        default:
          return; // İlgilenmediğimiz tuş, event'in doğal akışına bırak
      }

      e.preventDefault();

      // Farklı sütun sayılı satırlar arasında oransal sütun eşleme
      if (newRow !== row) {
        const srcCols = keyGrid[row].length;
        const dstCols = keyGrid[newRow].length;
        if (srcCols !== dstCols) {
          newCol = Math.round(
            col * (dstCols - 1) / Math.max(1, srcCols - 1),
          );
        }
      }
      newCol = Math.max(0, Math.min(keyGrid[newRow].length - 1, newCol));

      const newIndex = keyGrid[newRow][newCol];
      setFocusedKeyIndex(newIndex);
      focusKey(newIndex);
    },
    [focusedKeyIndex, keyGrid, findKeyPosition, focusKey],
  );

  // Container Tab ile odaklandığında aktif tuşu odakla
  const handleContainerFocus = useCallback(() => {
    focusKey(focusedKeyIndex);
  }, [focusedKeyIndex, focusKey]);

  // Mod değişince grid değişir, odak indeksini sıfırla
  useEffect(() => {
    setFocusedKeyIndex(0);
  }, [mode]);

  // --- Handlers ---
  
  const setMode = useCallback(
    (next: VirtualKeyboardMode) => {
      if (modeProp === undefined) setInternalMode(next);
      onModeChange?.(next);
      shiftOnceRef.current = false;
    },
    [modeProp, onModeChange],
  );

  const append = useCallback(
    (chunk: string | undefined) => {
      if (typeof chunk === "string") {
        onChange(value + chunk);
      }
    },
    [onChange, value],
  );

  const backspace = useCallback(() => {
    onChange(value.slice(0, -1));
  }, [onChange, value]);

  const onLetter = useCallback(
    (ch: string | undefined) => {
      if (!ch) return;
      const out = shiftOnceRef.current ? trLocaleUpperChar(ch) : ch;
      shiftOnceRef.current = false;
      onChange(value + out);
    },
    [onChange, value],
  );

  const onShiftTap = useCallback(() => {
    shiftOnceRef.current = true;
  }, []);

  const handleNumericMode = useCallback(() => setMode("numeric"), [setMode]);
  const handleAlphaMode = useCallback(() => setMode("alpha"), [setMode]);
  const handleCancel = useCallback(() => onCancel?.(), [onCancel]);
  const handleSubmitInternal = useCallback(() => onSubmit?.(), [onSubmit]);

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={t("ariaGroup")}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      onFocus={handleContainerFocus}
      className={cn(
        "rounded-2xl border border-border bg-muted/70 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      {showModeToggle && (
        <div className="mb-3 flex gap-2">
          <KeyButton
            label={t("numericMode")}
            variant={mode === "numeric" ? "accent" : "default"}
            className="flex-1 gap-2 text-sm"
            onPress={handleNumericMode}
          >
            <span className="font-mono">123</span>
            <span className="text-xs font-normal text-muted-foreground">{t("numericShort")}</span>
          </KeyButton>
          <KeyButton
            label={t("alphaMode")}
            variant={mode === "alpha" ? "accent" : "default"}
            className="flex-1 gap-2 text-sm"
            onPress={handleAlphaMode}
          >
            <Keyboard className="size-4 shrink-0 opacity-80" aria-hidden />
            <span className="text-xs font-normal text-muted-foreground">{t("alphaShort")}</span>
          </KeyButton>
        </div>
      )}

      {mode === "numeric" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {NUMERIC_KEYS.slice(0, 3).map((d, i) => (
              <KeyButton
                key={d}
                label={t("digit", { n: d })}
                value={d}
                onPress={append}
                keyIndex={i}
                isFocused={focusedKeyIndex === i}
                onKeyFocus={setFocusedKeyIndex}
              >
                {d}
              </KeyButton>
            ))}
            <KeyButton
              label={t("backspace")}
              onPress={backspace}
              keyIndex={3}
              isFocused={focusedKeyIndex === 3}
              onKeyFocus={setFocusedKeyIndex}
            >
              <Delete className="size-5" aria-hidden />
            </KeyButton>
            {NUMERIC_KEYS.slice(3, 6).map((d, i) => (
              <KeyButton
                key={d}
                label={t("digit", { n: d })}
                value={d}
                onPress={append}
                keyIndex={4 + i}
                isFocused={focusedKeyIndex === 4 + i}
                onKeyFocus={setFocusedKeyIndex}
              >
                {d}
              </KeyButton>
            ))}
            <KeyButton
              label={t("plus")}
              value="+"
              onPress={append}
              keyIndex={7}
              isFocused={focusedKeyIndex === 7}
              onKeyFocus={setFocusedKeyIndex}
            >
              +
            </KeyButton>
            {NUMERIC_KEYS.slice(6, 9).map((d, i) => (
              <KeyButton
                key={d}
                label={t("digit", { n: d })}
                value={d}
                onPress={append}
                keyIndex={8 + i}
                isFocused={focusedKeyIndex === 8 + i}
                onKeyFocus={setFocusedKeyIndex}
              >
                {d}
              </KeyButton>
            ))}
            <KeyButton
              label={t("minus")}
              value="-"
              onPress={append}
              keyIndex={11}
              isFocused={focusedKeyIndex === 11}
              onKeyFocus={setFocusedKeyIndex}
            >
              −
            </KeyButton>
            <KeyButton
              label={t("decimalSeparator")}
              value="."
              onPress={append}
              keyIndex={12}
              isFocused={focusedKeyIndex === 12}
              onKeyFocus={setFocusedKeyIndex}
            >
              .
            </KeyButton>
            <KeyButton
              label={t("digit0")}
              className="col-span-1"
              value="0"
              onPress={append}
              keyIndex={13}
              isFocused={focusedKeyIndex === 13}
              onKeyFocus={setFocusedKeyIndex}
            >
              0
            </KeyButton>
            <KeyButton
              label={t("cancel")}
              variant="danger"
              onPress={handleCancel}
              keyIndex={14}
              isFocused={focusedKeyIndex === 14}
              onKeyFocus={setFocusedKeyIndex}
            >
              <span className="flex flex-col items-center gap-0.5 text-xs leading-tight">
                <Undo2 className="size-4" aria-hidden />
                {t("cancel")}
              </span>
            </KeyButton>
            <KeyButton
              label={t("enter")}
              variant="accent"
              onPress={handleSubmitInternal}
              keyIndex={15}
              isFocused={focusedKeyIndex === 15}
              onKeyFocus={setFocusedKeyIndex}
            >
              <span className="flex flex-col items-center gap-0.5 text-xs leading-tight">
                <CornerDownLeft className="size-4" aria-hidden />
                {t("enter")}
              </span>
            </KeyButton>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-1.5">
            {TR_Q_ROWS[0].map((ch, i) => (
              <KeyButton
                key={ch}
                label={t("letter", { letter: ch })}
                value={ch}
                className="h-12 min-h-12 w-full min-w-0 px-0 text-ui-md sm:text-base"
                onPress={onLetter}
                keyIndex={i}
                isFocused={focusedKeyIndex === i}
                onKeyFocus={setFocusedKeyIndex}
              >
                {ch}
              </KeyButton>
            ))}
          </div>
          <div className="mx-auto grid max-w-full grid-cols-11 gap-1.5">
            {TR_Q_ROWS[1].map((ch, i) => (
              <KeyButton
                key={ch}
                label={t("letter", { letter: ch })}
                value={ch}
                className="h-12 min-h-12 w-full min-w-0 px-0 text-ui-md sm:text-base"
                onPress={onLetter}
                keyIndex={12 + i}
                isFocused={focusedKeyIndex === 12 + i}
                onKeyFocus={setFocusedKeyIndex}
              >
                {ch}
              </KeyButton>
            ))}
          </div>
          <div className="flex items-stretch justify-center gap-1.5">
            <KeyButton
              label={t("shiftOnce")}
              className="h-12 w-[52px] shrink-0 px-0 sm:w-14"
              onPress={onShiftTap}
              keyIndex={23}
              isFocused={focusedKeyIndex === 23}
              onKeyFocus={setFocusedKeyIndex}
            >
              ⇧
            </KeyButton>
            <div className="grid flex-1 grid-cols-9 gap-1.5">
              {TR_Q_ROWS[2].map((ch, i) => (
                <KeyButton
                  key={ch}
                  label={t("letter", { letter: ch })}
                  value={ch}
                  className="h-12 min-h-12 w-full min-w-0 px-0 text-ui-md sm:text-base"
                  onPress={onLetter}
                  keyIndex={24 + i}
                  isFocused={focusedKeyIndex === 24 + i}
                  onKeyFocus={setFocusedKeyIndex}
                >
                  {ch}
                </KeyButton>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-stretch justify-center gap-2">
            <KeyButton
              label={t("cancel")}
              variant="danger"
              className="min-w-[72px]"
              onPress={handleCancel}
              keyIndex={33}
              isFocused={focusedKeyIndex === 33}
              onKeyFocus={setFocusedKeyIndex}
            >
              <span className="flex flex-col items-center gap-0.5 text-xs leading-tight">
                <Undo2 className="size-4" aria-hidden />
                {t("escape")}
              </span>
            </KeyButton>
            <KeyButton
              label={t("space")}
              variant="wide"
              value=" "
              className="min-h-[48px] flex-[2]"
              onPress={append}
              keyIndex={34}
              isFocused={focusedKeyIndex === 34}
              onKeyFocus={setFocusedKeyIndex}
            >
              {t("space")}
            </KeyButton>
            <KeyButton
              label={t("backspace")}
              className="min-w-[72px]"
              onPress={backspace}
              keyIndex={35}
              isFocused={focusedKeyIndex === 35}
              onKeyFocus={setFocusedKeyIndex}
            >
              <Delete className="size-5" aria-hidden />
            </KeyButton>
            <KeyButton
              label={t("enter")}
              variant="accent"
              className="min-w-[88px]"
              onPress={handleSubmitInternal}
              keyIndex={36}
              isFocused={focusedKeyIndex === 36}
              onKeyFocus={setFocusedKeyIndex}
            >
              <span className="flex flex-col items-center gap-0.5 text-xs leading-tight">
                <CornerDownLeft className="size-4" aria-hidden />
                {t("enter")}
              </span>
            </KeyButton>
          </div>
        </div>
      )}
    </div>
  );
}
