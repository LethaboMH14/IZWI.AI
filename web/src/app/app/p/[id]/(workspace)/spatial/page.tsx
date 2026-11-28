import { SpatialView } from "@/components/workspace/SpatialView";
import { spatialRestoreEnabled } from "@/server/flags";

export default function Page() {
  return <SpatialView restoreEnabled={spatialRestoreEnabled()} />;
}
