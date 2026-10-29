export type FlashSaleCountdownTemplateProps = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  label: string;
};

const UNITS = ["days", "hours", "minutes", "seconds"] as const;

export function FlashSaleCountdownTemplate({
  days,
  hours,
  minutes,
  seconds,
  label,
}: FlashSaleCountdownTemplateProps) {
  const values = { days, hours, minutes, seconds };

  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-500">{label}</p>
      <div className="mt-2 flex gap-2">
        {UNITS.map((unit) => (
          <div
            key={unit}
            className="min-w-14 rounded-xl border border-amber-400/20 bg-black/30 px-3 py-2 text-center"
          >
            <p className="font-mono text-xl font-semibold tabular-nums text-amber-100">
              {String(values[unit]).padStart(2, "0")}
            </p>
            <p className="mt-0.5 text-[8px] uppercase tracking-wider text-amber-500/70">{unit}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
