import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-violet-500/20 text-violet-300 border-violet-500/30",
        secondary: "bg-zinc-700/40 text-zinc-300 border-zinc-600/30",
        destructive: "bg-rose-500/20 text-rose-300 border-rose-500/30",
        success: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        warning: "bg-amber-500/20 text-amber-300 border-amber-500/30",
        outline: "border-zinc-700 text-zinc-300",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
