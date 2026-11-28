import { notFound } from "next/navigation";
import { designStageEnabled } from "@/server/flags";
import { DesignView } from "@/components/workspace/DesignView";

export const dynamic = "force-dynamic";
export default function Page() {
  if (!designStageEnabled()) notFound();
  return <DesignView />;
}
