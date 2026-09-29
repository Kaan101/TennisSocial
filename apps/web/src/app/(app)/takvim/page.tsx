import { Suspense } from "react";
import { LoadingBlock } from "@/components/states";
import { TakvimView } from "./view";

export default function TakvimPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Takvim yükleniyor" />}>
      <TakvimView />
    </Suspense>
  );
}
