import type { Metadata } from "next";
import { VoiceView } from "@/components/voice-view";
import { getLatestProfile } from "@/lib/profile";
import { getSampleCounts, listSamples } from "@/lib/samples";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your voice",
};

export default async function VoicePage({
  searchParams,
}: {
  searchParams: Promise<{ import?: string }>;
}) {
  const params = await searchParams;
  const { samples, total } = listSamples({ limit: 30 });
  const settings = getSettings();

  return (
    <VoiceView
      initialProfile={getLatestProfile()}
      initialSamples={samples}
      initialTotal={total}
      initialCounts={getSampleCounts()}
      personName={settings.person.name}
      autoImport={params.import === "1"}
    />
  );
}
