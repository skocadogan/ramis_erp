import { ChefHat } from "lucide-react";

export function EmptyState({ stationColor }: { stationColor: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <div
        className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl"
        style={{ backgroundColor: `${stationColor}20`, color: stationColor }}
      >
        <ChefHat size={40} />
      </div>
      <p className="text-2xl font-bold">
        Hazırlık görevi yok
      </p>
      <p className="mt-2">
        Bu istasyon için aktif görev bulunmuyor.
      </p>
    </div>
  );
}
