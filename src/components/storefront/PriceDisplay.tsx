import { formatPrice } from "@/modules/funnels/runtime/pricing";

export function PriceDisplay({
  price,
  compareAtPrice,
  size = "md",
}: {
  price: number;
  compareAtPrice?: number | null;
  size?: "md" | "lg";
}) {
  const showCompare = compareAtPrice != null && compareAtPrice > price;

  return (
    <div className="flex items-baseline gap-2">
      <span className={size === "lg" ? "text-2xl font-bold" : "text-lg font-semibold"}>
        {formatPrice(price)}
      </span>
      {showCompare && (
        <span className="text-sm line-through opacity-50">{formatPrice(compareAtPrice)}</span>
      )}
    </div>
  );
}
