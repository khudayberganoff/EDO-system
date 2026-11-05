import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Phone, X } from "lucide-react";
import clsx from "clsx";
import { fetchCalendar, type CalendarEvent, type CalendarEventType } from "../../api/calls";

const TYPES: Record<CalendarEventType, { label: string; chip: string; dot: string }> = {
  MEETING: { label: "Uchrashuv", chip: "bg-sky-100 text-sky-800", dot: "bg-sky-500" },
  LEAD_CALLBACK: { label: "Qayta bog'lanish", chip: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
};
const WEEKDAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];

const p2 = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

/** Voqealarni .ics (iCalendar) faylga aylantiradi - Google/Outlook/telefon kalendariga qo'shish uchun. */
function buildIcs(events: CalendarEvent[]): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const utc = (d: Date) => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WAFA//EDO Call-markaz//UZ", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    const at = new Date(e.at);
    lines.push("BEGIN:VEVENT", `UID:${e.id}@edo.wafagroup.uz`, `DTSTAMP:${utc(new Date())}`);
    if (e.allDay) {
      const next = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${at.getFullYear()}${p2(at.getMonth() + 1)}${p2(at.getDate())}`, `DTEND;VALUE=DATE:${next.getFullYear()}${p2(next.getMonth() + 1)}${p2(next.getDate())}`);
    } else {
      lines.push(`DTSTART:${utc(at)}`, `DTEND:${utc(new Date(at.getTime() + 30 * 60_000))}`);
    }
    lines.push(`SUMMARY:${esc(`${TYPES[e.type].label}: ${e.title}`)}`);
    const desc = [e.subtitle, e.phone].filter(Boolean).join("\n");
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** Kalendar: lidlarning uchrashuvi va qayta bog'lanishi. */
export function CallCalendar({ onOpen }: { onOpen: (e: CalendarEvent) => void }) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [dayView, setDayView] = useState<string | null>(null);

  const gridStart = useMemo(() => {
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }, [cursor]);
  const gridEnd = useMemo(() => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 42), [gridStart]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)), [gridStart]);

  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["calls", "calendar", gridStart.toISOString()],
    queryFn: () => fetchCalendar(gridStart, gridEnd),
  });
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = dayKey(new Date(e.at));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return m;
  }, [events]);

  function exportIcs() {
    const blob = new Blob([buildIcs(events)], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kalendar-${cursor.getFullYear()}-${p2(cursor.getMonth() + 1)}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const todayKey = dayKey(today);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><ChevronLeft size={16} /></button>
          <div className="w-44 text-center text-base font-semibold text-slate-900">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</div>
          <button onClick={() => shift(1)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><ChevronRight size={16} /></button>
          <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))} className="ml-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Bugun</button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(Object.keys(TYPES) as CalendarEventType[]).map((t) => (
            <span key={t} className="flex items-center gap-1.5 text-xs text-slate-500"><span className={clsx("h-2.5 w-2.5 rounded-full", TYPES[t].dot)} />{TYPES[t].label}</span>
          ))}
          <button onClick={exportIcs} disabled={!events.length} title="Google/Outlook/telefon kalendariga qo'shish uchun .ics fayl" className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Download size={14} /> .ics</button>
        </div>
      </div>
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Kalendarni yuklab bo'lmadi.</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
          {WEEKDAYS.map((w) => <div key={w} className="py-2">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const inMonth = d.getMonth() === cursor.getMonth();
            return (
              <div key={k} className={clsx("min-h-[112px] border-b border-r border-slate-100 p-1.5", !inMonth && "bg-slate-50/60", i % 7 === 6 && "border-r-0")}>
                <div className={clsx("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", k === todayKey ? "bg-brand-800 font-semibold text-white" : inMonth ? "text-slate-700" : "text-slate-300")}>{d.getDate()}</div>
                <div className="space-y-1">
                  {list.slice(0, 3).map((e) => (
                    <button key={e.id} onClick={() => setSelected(e)} className={clsx("block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium", TYPES[e.type].chip)} title={`${TYPES[e.type].label}: ${e.title}`}>
                      {!e.allDay && <span className="mr-1 opacity-70">{timeOf(e.at)}</span>}{e.title}
                    </button>
                  ))}
                  {list.length > 3 && <button onClick={() => setDayView(k)} className="block w-full text-left text-[11px] text-slate-400 hover:text-slate-700">+{list.length - 3} yana</button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {isLoading && <p className="mt-2 text-xs text-slate-400">Yuklanmoqda...</p>}
      {!isLoading && events.length === 0 && <p className="mt-3 text-sm text-slate-400">Bu oyda rejalashtirilgan uchrashuv, qayta bog'lanish yoki to'lov va'dasi yo'q.</p>}

      {dayView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setDayView(null)}>
          <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-900">{new Date(dayView).toLocaleDateString("uz-UZ", { dateStyle: "long" })}</h3><button onClick={() => setDayView(null)} className="text-slate-400"><X size={18} /></button></div>
            <div className="space-y-2">
              {(byDay.get(dayView) ?? []).map((e) => (
                <button key={e.id} onClick={() => { setDayView(null); setSelected(e); }} className={clsx("block w-full rounded-lg px-3 py-2 text-left text-sm", TYPES[e.type].chip)}>
                  {!e.allDay && <span className="mr-1.5 opacity-70">{timeOf(e.at)}</span>}{e.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", TYPES[selected.type].chip)}>{TYPES[selected.type].label}</span>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">{selected.title}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <p className="text-sm text-slate-600">{new Date(selected.at).toLocaleDateString("uz-UZ", { dateStyle: "full" })}{selected.allDay ? "" : `, ${timeOf(selected.at)}`}</p>
            {selected.subtitle && <p className="mt-1 text-sm text-slate-500">{selected.subtitle}</p>}
            {selected.phone && <a href={telHref(selected.phone)} className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><Phone size={15} /> {selected.phone}</a>}
            <button onClick={() => { onOpen(selected); setSelected(null); }} className="mt-2 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Lidlar bo'limida ochish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
