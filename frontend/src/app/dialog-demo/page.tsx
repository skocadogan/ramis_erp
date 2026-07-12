"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DemoVariant = "basic" | "form" | "large" | null;

const DEMO_ITEMS = [
  {
    id: "basic" as const,
    title: "Temel Dialog",
    description: "Başlık, açıklama ve footer ile standart sm:max-w-lg boyutu.",
    buttonLabel: "Temel dialog aç",
  },
  {
    id: "form" as const,
    title: "Form Dialog",
    description: "Form alanları içeren sm:max-w-lg dialog örneği.",
    buttonLabel: "Form dialog aç",
  },
  {
    id: "large" as const,
    title: "Büyük Dialog",
    description: "Geniş içerik alanı için sm:max-w-3xl boyutu.",
    buttonLabel: "Büyük dialog aç",
  },
] satisfies Array<{
  id: Exclude<DemoVariant, null>;
  title: string;
  description: string;
  buttonLabel: string;
}>;

export default function DialogDemoPage() {
  const [activeDialog, setActiveDialog] = useState<DemoVariant>(null);

  const closeDialog = () => setActiveDialog(null);

  return (
    <div className="min-h-dvh bg-background px-4 py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Dialog Demo
          </h1>
          <p className="text-sm text-muted-foreground">
            Dialog bileşeninin tasarım ve genişletme çalışmaları için test
            sayfası.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          {DEMO_ITEMS.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto pt-0">
                <Button
                  className="w-full"
                  onClick={() => setActiveDialog(item.id)}
                >
                  {item.buttonLabel}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog
        open={activeDialog === "basic"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Temel Dialog</DialogTitle>
            <DialogDescription>
              Bu dummy dialog, standart başlık ve açıklama yapısını gösterir.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Dialog içeriği burada yer alır. Kapatmak için sağ üstteki X
            düğmesini, dışarı tıklamayı veya footer butonlarını
            kullanabilirsiniz.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              İptal
            </Button>
            <Button onClick={closeDialog}>Onayla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeDialog === "form"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Form Dialog</DialogTitle>
            <DialogDescription>
              Form alanları içeren dialog örneği.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="demo-name">Ad Soyad</Label>
              <Input id="demo-name" placeholder="Örn. Ayşe Yılmaz" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="demo-email">E-posta</Label>
              <Input
                id="demo-email"
                type="email"
                placeholder="ornek@firma.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="demo-note">Not</Label>
              <Input id="demo-note" placeholder="Kısa bir açıklama" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              İptal
            </Button>
            <Button onClick={closeDialog}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeDialog === "large"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent size="3xl">
          <DialogHeader>
            <DialogTitle>Büyük Dialog</DialogTitle>
            <DialogDescription>
              Geniş içerik alanı gerektiren senaryolar için sm:max-w-3xl
              boyutu.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Sol panel
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Bu alan tablo, liste veya özet bilgiler için kullanılabilir.
                Dummy metin: stok kalemleri, sipariş satırları veya rapor
                özetleri burada gösterilebilir.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Sağ panel
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                İkinci sütun detay formu, filtreler veya ek aksiyonlar için
                ayrılabilir. Dialog genişletme çalışmalarında bu layout
                referans alınabilir.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Kapat
            </Button>
            <Button onClick={closeDialog}>Uygula</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
