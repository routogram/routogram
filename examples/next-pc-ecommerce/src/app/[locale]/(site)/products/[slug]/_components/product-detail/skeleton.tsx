export function ProductDetailSkeleton() {
  return (
    <section className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2">
      <div className="aspect-[4/3] animate-pulse rounded-3xl border border-(--border) bg-white/5" />
      <div className="space-y-4">
        <div className="h-3 w-32 animate-pulse rounded bg-white/5" />
        <div className="h-9 w-3/4 animate-pulse rounded bg-white/5" />
        <div className="h-24 animate-pulse rounded-xl bg-white/5" />
        <div className="h-40 animate-pulse rounded-2xl border border-(--border) bg-white/5" />
      </div>
    </section>
  );
}
