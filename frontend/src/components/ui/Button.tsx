import type { ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

const variantClass = {
  primary: "border-ink bg-ink text-white shadow-action hover:bg-ink/90",
  secondary: "border-mint bg-mint text-white shadow-action hover:bg-mint/90",
  ghost: "border-transparent bg-transparent text-ink hover:border-line hover:bg-white"
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variantClass;
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "lx-button inline-flex h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-sky/30 disabled:cursor-not-allowed disabled:opacity-55",
        variantClass[variant],
        className
      )}
      {...props}
    />
  );
}
