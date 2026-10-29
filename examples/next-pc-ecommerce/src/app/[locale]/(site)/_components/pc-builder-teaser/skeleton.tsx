export function PcBuilderTeaserSkeleton() {
  return (
    <section className="border-y border-(--border) bg-(--surface)/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="h-3 w-32 animate-pulse rounded bg-white/5" />
          <div className="h-8 w-64 animate-pulse rounded bg-white/5" />
        </div>
        <div className="h-56 animate-pulse rounded-2xl border border-(--border) bg-white/5" />
      </div>
    </section>
  );
}
