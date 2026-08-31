export function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex flex-col gap-1.5 text-center">
      <h1 className="text-xl font-bold text-balance">{title}</h1>
      {subtitle && <p className="text-sm text-balance opacity-70">{subtitle}</p>}
    </header>
  );
}
