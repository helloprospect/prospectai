interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
}

export default function StatCard({ label, value, sub, trend }: StatCardProps) {
  return (
    <div className="bg-[#111113] border border-[#27272a] rounded-xl p-5 hover:border-[#3f3f46] transition-colors duration-150">
      <p className="text-[11px] font-medium text-[#71717a] uppercase tracking-widest mb-3">{label}</p>
      <p className="text-2xl font-semibold text-[#fafafa] tabular-nums">{value}</p>
      {sub && (
        <p
          className={`text-xs mt-1.5 flex items-center gap-1 ${
            trend === "up"
              ? "text-emerald-400"
              : trend === "down"
              ? "text-red-400"
              : "text-[#71717a]"
          }`}
        >
          {trend === "up" && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 2l4 5H1l4-5z" fill="currentColor" />
            </svg>
          )}
          {trend === "down" && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 8L1 3h8L5 8z" fill="currentColor" />
            </svg>
          )}
          {sub}
        </p>
      )}
    </div>
  );
}
