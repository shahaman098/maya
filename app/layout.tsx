import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Maya — your voice, on the page",
    template: "%s — Maya",
  },
  description:
    "A private writing studio that learns how you write and edits drafts in your own voice.",
};

export const viewport: Viewport = {
  themeColor: "#f5f0e6",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
