import type { Metadata } from "next";
import { SettingsView } from "@/components/settings-view";
import { getDbPath } from "@/lib/db";
import { countRewrites } from "@/lib/rewrites";
import { getLibraryStats } from "@/lib/samples";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ writer?: string }>;
}) {
  const params = await searchParams;
  const library = getLibraryStats();
  const settings = getSettings();
  const initialSettings =
    params.writer === "api" && settings.writer.mode !== "api"
      ? {
          ...settings,
          writer: { ...settings.writer, mode: "api" as const },
        }
      : params.writer === "local" && settings.writer.mode !== "local"
        ? {
            ...settings,
            writer: { ...settings.writer, mode: "local" as const },
          }
        : settings;

  return (
    <SettingsView
      initialSettings={initialSettings}
      counts={{
        samples: library.samples,
        words: library.words,
        redacted: library.redacted,
        rewrites: countRewrites(),
      }}
      database={getDbPath()}
    />
  );
}
