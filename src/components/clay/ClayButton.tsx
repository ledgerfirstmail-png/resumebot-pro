import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "soft" | "ghost";
type Size = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<Variant, string> = {
  primary: "clay-button",
  soft: "clay-button-soft",
  ghost: "clay-button-ghost",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-4 text-sm font-semibold",
  md: "h-11 px-6 text-sm font-semibold",
  lg: "h-13 px-8 text-base font-bold",
  icon: "size-11 p-0",
};

export interface ClayButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** Squishy clay button used across the app. */
export function ClayButton({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ClayButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap transition-all outline-none focus-visible:ring-4 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
