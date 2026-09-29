import { Suspense } from "react";
import { LoadingBlock } from "@/components/states";
import { CourtWeekView } from "./view";

export default function CourtWeekPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Kort haftası yükleniyor" />}>
      <CourtWeekView />
    </Suspense>
  );
}
