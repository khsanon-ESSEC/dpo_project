import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Pilotage des projets", template: "%s · Pilotage des projets" },
  description: "Division des Projets Organisationnels — UNIBANK",
  applicationName: "Pilotage DPO",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icone.svg", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Pilotage DPO", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#142458",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("dpo_theme")?.value;
  const dataTheme = theme === "clair" || theme === "sombre" ? theme : "auto";
  return (
    <html lang="fr" data-theme={dataTheme}>
      <body>{children}</body>
    </html>
  );
}
