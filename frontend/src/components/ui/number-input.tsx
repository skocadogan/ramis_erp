import { type InputHTMLAttributes, forwardRef } from "react"
import { Plus, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string | number
  onChange: (value: string) => void
  containerClassName?: string
  suffix?: string
  /** compact: dar tablo hücreleri — sağ hizalı, küçük stepper */
  variant?: "default" | "compact"
}

const stepperButtonClass =
  "z-10 flex shrink-0 items-center justify-center rounded-md border transition-colors bg-muted/70 text-foreground/70 border-border/60 hover:bg-accent hover:text-foreground hover:border-border disabled:pointer-events-none disabled:opacity-30 dark:bg-muted/80 dark:text-foreground/75 dark:border-border/70 dark:hover:bg-accent"

const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      step = "1",
      min,
      max,
      className,
      containerClassName,
      suffix,
      readOnly,
      variant = "default",
      ...props
    },
    ref,
  ) => {
    const isCompact = variant === "compact"
    const iconSize = isCompact ? 12 : 14
    const btnSize = isCompact ? "h-5 w-5" : "h-7 w-7"
    const btnInset = isCompact ? "left-0.5" : "left-1"
    const btnRightInset = isCompact ? "right-0.5" : "right-1"

    const adjustValue = (direction: 1 | -1) => {
      const currentVal = parseFloat(value.toString().replace(",", ".")) || 0
      const stepVal = parseFloat(step.toString()) || 1
      const precision = step.toString().includes(".") ? step.toString().split(".")[1].length : 0
      const newVal = (currentVal + stepVal * direction).toFixed(precision)

      if (min !== undefined && parseFloat(newVal) < parseFloat(min.toString())) return
      if (max !== undefined && parseFloat(newVal) > parseFloat(max.toString())) return

      onChange(newVal)
    }

    return (
      <div
        className={cn(
          "relative flex w-full items-center",
          isCompact ? "min-w-0" : "min-w-[7rem]",
          containerClassName,
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          disabled={readOnly}
          onClick={() => {
            if (!readOnly) adjustValue(-1)
          }}
          className={cn("absolute", btnInset, stepperButtonClass, btnSize)}
        >
          <Minus size={iconSize} />
        </button>

        <input
          {...props}
          ref={ref}
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-input bg-background text-sm font-semibold transition-all outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            isCompact
              ? "h-8 px-6 text-right tabular-nums sm:text-sm"
              : "h-9 px-9 text-center sm:text-sm",
            className,
          )}
        />

        <div className={cn("absolute flex items-center gap-1", btnRightInset)}>
          {suffix && (
            <span className="mr-1 select-none text-2xs font-bold uppercase text-muted-foreground">
              {suffix}
            </span>
          )}
          <button
            type="button"
            tabIndex={-1}
            disabled={readOnly}
            onClick={() => {
              if (!readOnly) adjustValue(1)
            }}
            className={cn(stepperButtonClass, btnSize)}
          >
            <Plus size={iconSize} />
          </button>
        </div>
      </div>
    )
  },
)

NumberInput.displayName = "NumberInput"

export { NumberInput }
