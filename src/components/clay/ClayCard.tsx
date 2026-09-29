import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

/** Plush raised clay surface. */
export function ClayCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("clay-card p-6 sm:p-8", className)} {...props} />;
}
