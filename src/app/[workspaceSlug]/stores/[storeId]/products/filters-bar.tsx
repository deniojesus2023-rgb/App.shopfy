import type { ProductStatusFilter } from "@/modules/catalog/service";

const FILTERS: { value: ProductStatusFilter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "ACTIVE", label: "Ativos" },
  { value: "DRAFT", label: "Rascunho" },
  { value: "ARCHIVED", label: "Arquivados" },
];

export function FiltersBar({
  basePath,
  search,
  status,
}: {
  basePath: string;
  search: string;
  status: ProductStatusFilter;
}) {
  return (
    <form action={basePath} method="GET" className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        name="search"
        defaultValue={search}
        placeholder="Buscar por título ou SKU"
        className="h-9 w-64 rounded-md border border-neutral-300 bg-white px-3 text-sm"
      />
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="submit"
            name="status"
            value={f.value}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status === f.value
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </form>
  );
}
