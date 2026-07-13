import { Loader2 } from "lucide-react";

export function PosLoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" aria-hidden />
        <span className="font-medium text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
