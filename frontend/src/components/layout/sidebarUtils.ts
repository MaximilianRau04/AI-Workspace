import type { Session } from "../../types";

export function formatDate(isoStr: string): string {
  if (!isoStr) return "";
  const d = new Date(isoStr + "Z");
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en", { weekday: "short" });
  return d.toLocaleDateString("en", { day: "numeric", month: "short" });
}

export function groupSessions(
  sessions: Session[],
): { label: string; items: Session[] }[] {
  const now = Date.now();
  const buckets: [string, Session[]][] = [
    ["Today", []],
    ["Yesterday", []],
    ["Previous 7 days", []],
    ["Previous 30 days", []],
    ["Older", []],
  ];
  for (const s of sessions) {
    const diff = Math.floor(
      (now - new Date(s.updated_at + "Z").getTime()) / 86400000,
    );
    if (diff < 1) buckets[0][1].push(s);
    else if (diff < 2) buckets[1][1].push(s);
    else if (diff < 7) buckets[2][1].push(s);
    else if (diff < 30) buckets[3][1].push(s);
    else buckets[4][1].push(s);
  }
  return buckets
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}
