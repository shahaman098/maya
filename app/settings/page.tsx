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

export default function SettingsPage() {
  const library = getLibraryStats();

  return (
    <SettingsView
      initialSettings={getSettings()}
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
