import { formatMoneyForDisplay } from "@/modules/shared/money";

export function PriceDisplay({
  price,
  compareAtPrice,
  currency,
  size = "md",
}: {
  price: number;
  compareAtPrice?: number | null;
  currency: string;
  size?: "md" | "lg";
}) {
  const showCompare = compareAtPrice != null && compareAtPrice > price;

  return (
    <div className="flex items-baseline gap-2">
      <span className={size === "lg" ? "text-2xl font-bold" : "text-lg font-semibold"}>
        {formatMoneyForDisplay(price, currency)}
      </span>
      {showCompare && (
        <span className="text-sm line-through opacity-50">{formatMoneyForDisplay(compareAtPrice, currency)}</span>
      )}
    </div>
  );
}
