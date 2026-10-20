import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-accent text-canvas hover:bg-accent-dim",
        secondary: "bg-panel-2 text-ink border border-line hover:bg-line-soft",
        ghost: "text-ink-dim hover:text-ink hover:bg-panel-2",
        danger: "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
        outline: "border border-line text-ink hover:bg-panel-2",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2.5 text-xs",
        lg: "h-10 px-5",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
