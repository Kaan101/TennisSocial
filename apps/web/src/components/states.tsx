export function LoadingBlock({ label = "Yükleniyor" }: { label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="h-24 animate-pulse rounded-3xl bg-paper-2" />
      <div className="h-24 animate-pulse rounded-3xl bg-paper-2" />
      <div className="h-24 animate-pulse rounded-3xl bg-paper-2" />
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-surface px-5 py-8 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-3xl border border-clay/30 bg-white px-5 py-6" role="alert">
      <p className="font-semibold">Liste yüklenemedi</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-3 text-sm font-semibold text-court">
          Yeniden dene
        </button>
      ) : null}
    </div>
  );
}

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {action}
    </div>
  );
}
