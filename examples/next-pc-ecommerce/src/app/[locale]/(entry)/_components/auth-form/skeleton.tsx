export function AuthFormSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
      <div className="h-8 w-2/3 animate-pulse rounded bg-white/5" />
      <div className="h-28 animate-pulse rounded-xl border border-(--border) bg-white/5" />
      <div className="h-10 animate-pulse rounded-xl bg-white/5" />
    </div>
  );
}
