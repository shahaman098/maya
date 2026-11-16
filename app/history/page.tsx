import type { Metadata } from "next";
import { HistoryView } from "@/components/history-view";
import { listRewrites } from "@/lib/rewrites";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "History",
};

export default function HistoryPage() {
  const { rewrites, total } = listRewrites({ limit: 40 });
  return <HistoryView initialRewrites={rewrites} initialTotal={total} />;
}
