import Image from "next/image";

export function ProductImage({
  src,
  alt,
  size = "large",
}: {
  src: string | null;
  alt: string;
  size?: "large" | "small";
}) {
  const dimension = size === "large" ? 320 : 64;

  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-[var(--storefront-radius)] bg-black/5"
      style={{ width: "100%", aspectRatio: size === "large" ? "1 / 1" : undefined, height: size === "small" ? dimension : undefined }}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={dimension}
          height={dimension}
          className="h-full w-full object-cover"
          unoptimized
          priority={size === "large"}
        />
      ) : (
        <span className="p-4 text-center text-xs opacity-50">Imagem indisponível</span>
      )}
    </div>
  );
}
