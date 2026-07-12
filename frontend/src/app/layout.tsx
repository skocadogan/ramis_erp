import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { SerwistProvider } from "@/components/pwa/SerwistProvider";
/*import { rtlLocales, type Locale } from "@/i18n/config";*/
import "./globals.css";
import { Providers } from "./providers";
import {
  getServerRuntimeConfig,
  resolveAppOriginFromRequestHeaders,
} from "@/lib/runtimeConfig.server";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#171717" },
  ],
};

export const metadata: Metadata = {
  title: "Ramis ERP",
  description: "Restoran ve Kafeler İçin Modern Yönetim Sistemi",
  applicationName: "Ramis ERP",
  appleWebApp: {
    capable: true,
    title: "Ramis ERP",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Layout her istekte çalışır — bağımsız await'leri paralel yaparak TTFB düşer.
  // `getLocale` yalnızca cookies'e, `resolveAppOriginFromRequestHeaders` yalnızca headers'a bakar.
  const [locale, appOrigin] = await Promise.all([
    getLocale(),
    resolveAppOriginFromRequestHeaders(),
  ]);
  const messages = await getMessages();
  const initialRuntimeConfig = getServerRuntimeConfig(appOrigin);
  /*const dir = rtlLocales.includes(locale as Locale) ? "rtl" : "ltr";*/

  return (
    <html
      lang={locale}
      /*dir={dir}*/
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground" suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <Providers initialRuntimeConfig={initialRuntimeConfig}>
            <SerwistProvider
              swUrl="/serwist/sw.js"
              disable={process.env.NODE_ENV === "development"}
              reloadOnOnline
            >
              {children}
            </SerwistProvider>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
