import type { InputHTMLAttributes } from "react";
import { clsx } from "clsx";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function Input({ className, label, id, ...props }: InputProps) {
  const inputId = id ?? props.name;

  return (
    <label className="grid gap-2 text-sm font-semibold text-ink" htmlFor={inputId}>
      <span className="flex items-center justify-between">{label}</span>
      <input
        id={inputId}
        className={clsx(
          "lx-field h-11 rounded-md border border-line bg-white px-3 text-sm outline-none placeholder:text-ink/35 focus:border-sky focus:ring-2 focus:ring-sky/15 disabled:cursor-not-allowed disabled:bg-paper disabled:text-ink/45",
          className
        )}
        {...props}
      />
    </label>
  );
}
