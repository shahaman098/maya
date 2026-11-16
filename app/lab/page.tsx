import type { Metadata } from "next";
import { LabView } from "@/components/lab-view";
import { activeWriter } from "@/lib/connections";
import { listEvalCases, listEvalRuns } from "@/lib/eval";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lab",
};

export default function LabPage() {
  const settings = getSettings();
  return (
    <LabView
      initialCases={listEvalCases()}
      initialRuns={listEvalRuns()}
      baselineEnabled={settings.baseline.enabled}
      writerModel={activeWriter(settings).model}
    />
  );
}
