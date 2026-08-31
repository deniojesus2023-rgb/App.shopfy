export function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Etapa ${current} de ${total}`}
      className="h-1.5 w-full overflow-hidden rounded-full bg-black/10"
    >
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${percent}%`, background: "var(--storefront-primary)" }}
      />
    </div>
  );
}
