import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-line bg-panel-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-dim",
        className,
      )}
      {...props}
    />
  );
}
