import type { ButtonHTMLAttributes } from "react";

type ButtonVariant =
  | "primary" /* tinted green — Export, Accept rewrite */
  | "neutral" /* tinted gray — Decline */
  | "judgment" /* tinted amber — Accept as-is anyway */
  | "judgment-outline" /* white + amber border — Move to Out of Scope */
  | "solid"; /* solid green — Post, Send */

type ButtonSize =
  | "xs" /* flag actions, Export */
  | "post" /* comment-well Post */
  | "send" /* chat panel Send */
  | "cta"; /* page-level primary action, e.g. Start drafting */

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "text-accent bg-accent-tint border border-accent-line hover:bg-accent-tint-strong",
  neutral: "text-ink-600 bg-line-100 border border-line-600 hover:bg-line-200",
  judgment:
    "text-judgment bg-judgment-tint border border-judgment-line hover:bg-judgment-tint-strong",
  "judgment-outline":
    "text-judgment bg-white border border-judgment-line hover:bg-judgment-well",
  solid: "text-white bg-accent hover:bg-accent-strong",
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: "text-[11px] rounded px-2.5 py-1",
  post: "text-[10.5px] rounded-[5px] px-2.5 py-[5px]",
  send: "text-[11px] rounded-md px-3 py-[7px]",
  cta: "text-[12.5px] rounded-md px-4 py-2",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "xs",
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`cursor-pointer font-mono font-semibold disabled:pointer-events-none disabled:opacity-45 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...rest}
    />
  );
}
