export function FlashSaleCountdownSkeleton() {
  return (
    <div className="flex gap-2">
      {[0, 1, 2, 3].map((item) => (
        <span key={item} className="h-16 w-14 animate-pulse rounded-xl bg-amber-400/10" />
      ))}
    </div>
  );
}
