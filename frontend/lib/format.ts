export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return formatClock(iso);
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear
    ? `${d.getMonth() + 1}月${d.getDate()}日 ${formatClock(iso)}`
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${formatClock(iso)}`;
}

export function bucketFor(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "更早";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "今天";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  )
    return "昨天";
  const ms = now.getTime() - d.getTime();
  if (ms < 7 * 24 * 60 * 60 * 1000) return "本周";
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth())
    return "本月";
  return "更早";
}

export const BUCKET_ORDER = ["今天", "昨天", "本周", "本月", "更早"] as const;

export function shouldInsertSeparator(
  prevIso: string | undefined,
  currIso: string,
): boolean {
  if (!prevIso) return false;
  const a = new Date(prevIso).getTime();
  const b = new Date(currIso).getTime();
  if (isNaN(a) || isNaN(b)) return false;
  if (b - a > 30 * 60 * 1000) return true;
  const da = new Date(a);
  const db = new Date(b);
  return da.toDateString() !== db.toDateString();
}

export function initialsOf(
  name: string | null | undefined,
  fallback = "A",
): string {
  if (!name) return fallback;
  const trimmed = name.trim();
  if (!trimmed) return fallback;
  return trimmed[0].toUpperCase();
}
