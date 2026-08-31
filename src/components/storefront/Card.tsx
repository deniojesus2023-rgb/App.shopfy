import { cn } from "@/lib/utils";

export function StorefrontCard({
  className,
  selected,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { selected?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--storefront-radius)] border bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors",
        className
      )}
      style={{
        borderColor: selected ? "var(--storefront-primary)" : "rgba(0,0,0,0.08)",
        borderWidth: selected ? 2 : 1,
      }}
      {...props}
    />
  );
}
