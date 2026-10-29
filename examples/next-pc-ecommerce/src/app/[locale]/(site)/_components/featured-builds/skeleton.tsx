export function FeaturedBuildsSkeleton() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="h-7 w-52 animate-pulse rounded-lg bg-white/5" />
      <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="overflow-hidden rounded-2xl border border-(--border)">
            <div className="aspect-[4/3] animate-pulse bg-white/5" />
            <div className="space-y-3 p-4">
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/5" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
