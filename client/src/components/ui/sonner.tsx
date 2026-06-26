import type { CSSProperties } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { cn } from "@/lib/utils";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** CSS variables consumed by Sonner’s injected toast styles — glass / polar HUD aligned. */
const polarToasterStyle: CSSProperties & Record<`--${string}`, string> = {
  "--border-radius": "0",
  "--normal-bg": "hsl(var(--canvas) / 0.48)",
  "--normal-border": "rgba(56, 189, 248, 0.2)",
  "--normal-text": "hsl(var(--foreground))",
  "--normal-bg-hover": "hsl(var(--canvas-elevated) / 0.58)",
  "--normal-border-hover": "rgba(125, 211, 252, 0.32)",
  "--success-bg": "hsl(var(--canvas) / 0.52)",
  "--success-border": "rgba(52, 211, 153, 0.3)",
  "--success-text": "rgb(190 242 212)",
  "--info-bg": "hsl(var(--canvas) / 0.52)",
  "--info-border": "rgba(56, 189, 248, 0.3)",
  "--info-text": "rgb(186 230 253)",
  "--warning-bg": "hsl(var(--canvas) / 0.52)",
  "--warning-border": "rgba(251, 191, 36, 0.3)",
  "--warning-text": "rgb(253 230 138)",
  "--error-bg": "hsl(var(--canvas) / 0.52)",
  "--error-border": "rgba(248, 113, 113, 0.3)",
  "--error-text": "rgb(252 165 165)",
};

const Toaster = ({ className, style, toastOptions, ...props }: ToasterProps) => {
  const mergedToastOptions = {
    ...toastOptions,
    classNames: {
      ...toastOptions?.classNames,
      toast: cn(
        "group toast rounded-none border border-solid backdrop-blur-[10px] shadow-none ring-1 ring-inset ring-white/[0.06]",
        toastOptions?.classNames?.toast,
      ),
      title: cn(
        "font-montreal text-[11px] font-semibold uppercase leading-snug tracking-[0.1em]",
        toastOptions?.classNames?.title,
      ),
      description: cn(
        "font-montreal text-[10px] leading-snug tracking-[0.06em] opacity-80",
        toastOptions?.classNames?.description,
      ),
      actionButton: cn(
        "rounded-none border border-white/18 bg-white/[0.08] px-3 py-1.5 font-montreal text-[10px] font-medium uppercase tracking-[0.08em] text-slate-100 !h-auto hover:bg-white/[0.12]",
        toastOptions?.classNames?.actionButton,
      ),
      cancelButton: cn(
        "rounded-none border border-white/10 bg-white/[0.05] px-3 py-1.5 font-montreal text-[10px] uppercase tracking-[0.08em] text-slate-400 !h-auto hover:bg-white/[0.08] hover:text-slate-200",
        toastOptions?.classNames?.cancelButton,
      ),
      closeButton: cn(
        "rounded-none border border-white/12 !bg-canvas/50 text-slate-400 hover:!bg-canvas/65 hover:text-slate-200",
        toastOptions?.classNames?.closeButton,
      ),
    },
  };

  return (
    <Sonner
      theme="dark"
      richColors
      className={cn("toaster group", className)}
      style={{ ...polarToasterStyle, ...style }}
      toastOptions={mergedToastOptions}
      {...props}
    />
  );
};

export { Toaster, toast };
