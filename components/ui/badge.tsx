import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-zinc-700 text-zinc-200",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-zinc-700 text-zinc-300",
        emerald: "border-emerald-500/30 bg-emerald-500/20 text-emerald-400",
        amber: "border-amber-500/30 bg-amber-500/20 text-amber-400",
        rose: "border-rose-500/30 bg-rose-500/20 text-rose-400",
        violet: "border-violet-500/30 bg-violet-500/20 text-violet-400",
        zinc: "border-zinc-600/30 bg-zinc-700/40 text-zinc-400",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
