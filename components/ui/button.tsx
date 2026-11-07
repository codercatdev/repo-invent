import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-2xl border-2 text-sm font-extrabold tracking-tight whitespace-nowrap transition-all outline-none select-none cursor-pointer focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-[3px] active:shadow-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground shadow-tactile-primary hover:brightness-105",
        outline:
          "border-border bg-card text-foreground shadow-tactile hover:bg-muted/60",
        secondary:
          "border-secondary bg-secondary text-secondary-foreground shadow-tactile-secondary hover:brightness-105",
        ghost:
          "border-transparent bg-transparent shadow-none hover:bg-muted hover:text-foreground active:translate-y-0",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground shadow-tactile-destructive hover:brightness-105",
        link: "border-transparent text-primary underline-offset-4 shadow-none hover:underline active:translate-y-0",
      },
      size: {
        default: "h-10 gap-2 px-4",
        xs: "h-7 gap-1 rounded-xl px-2.5 text-xs",
        sm: "h-9 gap-1.5 rounded-xl px-3.5 text-xs",
        lg: "h-12 gap-2 rounded-2xl px-6 text-base",
        icon: "size-10 rounded-2xl",
        "icon-xs": "size-7 rounded-xl",
        "icon-sm": "size-9 rounded-xl",
        "icon-lg": "size-12 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
