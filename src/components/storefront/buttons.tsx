import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** theme.buttonStyle === "SOFT" — fundo tingido em vez de cor sólida. */
  soft?: boolean;
};

export function PrimaryButton({ className, soft, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-[var(--storefront-radius)] px-6 py-3.5 text-center text-base font-semibold",
        "shadow-[0_2px_10px_rgba(0,0,0,0.08)] transition-transform duration-150 active:scale-[0.98]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100",
        soft ? "" : "text-white",
        className
      )}
      style={
        soft
          ? {
              background: "color-mix(in srgb, var(--storefront-primary) 14%, white)",
              color: "var(--storefront-primary)",
              outlineColor: "var(--storefront-primary)",
            }
          : { background: "var(--storefront-primary)", outlineColor: "var(--storefront-primary)" }
      }
      {...props}
    />
  );
}

export function SecondaryButton({ className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-[var(--storefront-radius)] border px-6 py-3 text-center text-sm font-medium",
        "transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      style={{
        borderColor: "var(--storefront-muted)",
        color: "var(--storefront-text)",
        outlineColor: "var(--storefront-primary)",
      }}
      {...props}
    />
  );
}
