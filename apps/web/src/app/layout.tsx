import type { Metadata } from "next";
import { Newsreader, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
const ui = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-ui" });
const display = Newsreader({ subsets: ["latin"], variable: "--font-display" });
export const metadata: Metadata = { title: "Nexo Assist", description: "Service desk de TI da Nexo" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${ui.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
