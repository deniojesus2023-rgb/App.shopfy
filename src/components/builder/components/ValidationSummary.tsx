import type { SemanticValidationError } from "@/modules/funnels/config/semantic-validation";

export function ValidationSummary({ errors }: { errors: SemanticValidationError[] }) {
  if (errors.length === 0) return null;

  return (
    <div
      role="alert"
      className="flex flex-col gap-1.5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      <p className="font-medium">
        {errors.length === 1
          ? "1 problema impede a publicação:"
          : `${errors.length} problemas impedem a publicação:`}
      </p>
      <ul className="list-inside list-disc">
        {errors.map((error, i) => (
          <li key={i}>{error.message}</li>
        ))}
      </ul>
    </div>
  );
}
