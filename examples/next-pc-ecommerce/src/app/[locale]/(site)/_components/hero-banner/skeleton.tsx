export function HeroBannerSkeleton() {
  return (
    <section className="border-b border-(--border)">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div className="space-y-4">
          <span className="block h-5 w-40 animate-pulse rounded-full bg-white/5" />
          <span className="block h-24 w-full animate-pulse rounded-2xl bg-white/5" />
          <span className="block h-5 w-2/3 animate-pulse rounded-full bg-white/5" />
        </div>
        <span className="block aspect-[4/3] animate-pulse rounded-[1.5rem] bg-white/5" />
      </div>
    </section>
  );
}
