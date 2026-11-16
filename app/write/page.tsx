import type { Metadata } from "next";
import { WriteWorkspace } from "@/components/write-workspace";
import { getLatestProfile } from "@/lib/profile";
import { countSamples } from "@/lib/samples";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Write",
};

export default function WritePage() {
  const settings = getSettings();
  return (
    <WriteWorkspace
      initialProfile={getLatestProfile()}
      sampleCount={countSamples()}
      personName={settings.person.name}
    />
  );
}
