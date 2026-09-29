"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-3xl bg-surface p-6" role="alert">
      <p className="font-semibold">Bir şeyler ters gitti</p>
      <p className="mt-1 text-sm text-muted">Sayfa yüklenirken sorun oldu.</p>
      <button type="button" onClick={reset} className="mt-4 text-sm font-semibold text-court">
        Yeniden dene
      </button>
    </div>
  );
}
