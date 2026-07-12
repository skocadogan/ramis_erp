"use client";

import { AlertCircle, Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RootErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: RootErrorProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" aria-hidden />
        <div className="space-y-2">
          <h1 className="text-xl font-ui-bold text-foreground">Bir hata oluştu</h1>
          <p className="text-ui-sm text-muted-foreground">
            Beklenmeyen bir sorun oluştu. Lütfen tekrar deneyin.
          </p>
          {error.digest ? (
            <p className="text-2xs text-muted-foreground/60">
              Hata kodu: {error.digest}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={reset} className="gap-2">
          <RotateCcw className="h-3.5 w-3.5" />
          Tekrar Dene
        </Button>
        <Link
          href="/"
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-4 py-2 text-ui-sm font-ui-medium",
            "bg-primary text-primary-foreground shadow-xs",
            "transition-colors hover:bg-primary/90",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Home className="h-3.5 w-3.5" />
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
