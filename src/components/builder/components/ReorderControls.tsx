import { Button } from "@/components/ui/button";

export function ReorderControls({
  label,
  disableUp,
  disableDown,
  onMoveUp,
  onMoveDown,
}: {
  label: string;
  disableUp: boolean;
  disableDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="flex flex-col">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-5 w-6"
        disabled={disableUp}
        onClick={onMoveUp}
        aria-label={`Mover ${label} para cima`}
      >
        ▲
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-5 w-6"
        disabled={disableDown}
        onClick={onMoveDown}
        aria-label={`Mover ${label} para baixo`}
      >
        ▼
      </Button>
    </div>
  );
}
