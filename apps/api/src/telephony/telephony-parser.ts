/**
 * ATS (IP-telefoniya) webhook ma'lumotini bitta tuzilmaga keltiradi. Turli ATS'lar (Asterisk/FreePBX CDR,
 * Zadarma, OnlinePBX, Binotel va boshqalar) maydon nomlari har xil, shuning uchun keng tarqalgan nomlar
 * ro'yxati ishlatiladi. Hech biri topilmasa - raqam yo'q deb rad etiladi va asl ma'lumot saqlanadi.
 */
export type CallDirection = "IN" | "OUT";
export type CallStatus = "ANSWERED" | "MISSED" | "BUSY" | "FAILED";

export interface ParsedCall {
  externalId: string;
  direction: CallDirection;
  status: CallStatus;
  phone: string;
  ourNumber: string | null;
  extension: string | null;
  startedAt: Date;
  durationSec: number;
  recordingUrl: string | null;
}

const pick = (o: Record<string, any>, keys: string[]): string | null => {
  const lower: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) lower[k.toLowerCase()] = v;
  for (const k of keys) {
    const v = lower[k];
    if (v !== undefined && v !== null && String(v).trim() !== "" && typeof v !== "object") return String(v).trim();
  }
  return null;
};

/** Raqamni +998XXXXXXXXX ko'rinishiga keltiradi; ichki (qisqa) raqamlar o'zgarishsiz qoladi. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith("998")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+998${digits.slice(1)}`;
  return digits.length >= 10 ? `+${digits}` : digits;
}

/** Ikki raqam bir xilmi (oxirgi 9 raqam bo'yicha). */
export function samePhone(a?: string | null, b?: string | null): boolean {
  const x = (a ?? "").replace(/\D/g, ""), y = (b ?? "").replace(/\D/g, "");
  if (x.length < 7 || y.length < 7) return false;
  return x.slice(-9) === y.slice(-9);
}

const isExternal = (n: string | null) => !!n && n.replace(/\D/g, "").length >= 7;

function parseDate(v: string | null): Date | null {
  if (!v) return null;
  if (/^\d{9,13}$/.test(v)) {
    const n = Number(v);
    return new Date(v.length >= 12 ? n : n * 1000);
  }
  // "2026-11-05 14:30:00" (UTC+5 - ATS odatda mahalliy vaqt yuboradi, zona bo'lmasa Toshkent deb olamiz)
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 5, +m[5], +m[6]));
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function parseCall(body: Record<string, any>): ParsedCall | null {
  // Ba'zi ATS'lar ma'lumotni ichki "data"/"call" obyektiga o'raydi
  const flat: Record<string, any> = { ...body };
  for (const key of ["data", "call", "payload", "callDetails", "calldetails"]) {
    const inner = (body as any)[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) Object.assign(flat, inner);
  }

  const caller = pick(flat, ["caller", "caller_id", "callerid", "callerid_num", "from", "src", "calling", "clid", "number_from", "externalnumber", "customer_phone", "phone", "number", "abonent"]);
  const callee = pick(flat, ["callee", "called", "called_did", "destination", "dst", "to", "callee_number", "number_to", "did", "called_number"]);

  const dirRaw = (pick(flat, ["direction", "call_direction", "calltype", "call_type", "type", "callflow", "call_flow", "event_direction"]) ?? "").toLowerCase();
  let direction: CallDirection;
  if (/out|chiquv|исход|^2$/.test(dirRaw)) direction = "OUT";
  else if (/in|kiruv|входящ|^1$/.test(dirRaw)) direction = "IN";
  else direction = !isExternal(caller) && isExternal(callee) ? "OUT" : "IN"; // yo'nalish berilmasa: ichki raqamdan tashqariga - chiquvchi

  const phoneRaw = direction === "IN" ? caller : callee;
  const ourRaw = direction === "IN" ? callee : caller;
  const phone = normalizePhone(phoneRaw);
  if (!phone) return null;

  const durationSec = Math.max(0, Math.round(Number(pick(flat, ["billsec", "duration", "call_duration", "talk_time", "talktime", "duration_sec", "seconds"]) ?? 0)) || 0);

  const stRaw = (pick(flat, ["disposition", "status", "call_status", "callstatus", "result", "state", "hangup_cause", "event"]) ?? "").toLowerCase();
  let status: CallStatus;
  if (/busy|band/.test(stRaw)) status = "BUSY";
  else if (/no.?answer|missed|unanswered|cancel|timeout|javobsiz/.test(stRaw)) status = "MISSED";
  else if (/fail|error|congest|chanunavail|reject/.test(stRaw)) status = "FAILED";
  else if (durationSec > 0 || /answer|success|completed|connected|normal/.test(stRaw)) status = "ANSWERED";
  else status = "MISSED";

  const startedAt = parseDate(pick(flat, ["start", "start_time", "starttime", "calldate", "call_start", "call_start_time", "date", "datetime", "time", "timestamp", "created", "created_at", "begin"])) ?? new Date();
  const recordingUrl = pick(flat, ["recording", "recordingfile", "recording_file", "record_file", "record", "record_url", "recording_url", "recordingurl", "call_record", "recordfile", "recording_link", "link", "audio"]);
  const extension = pick(flat, ["extension", "ext", "agent", "operator", "operator_ext", "internal", "dst_ext", "user", "employee", "worker"]);

  const idRaw = pick(flat, ["uniqueid", "call_id", "callid", "pbx_call_id", "uuid", "linkedid", "call_uuid", "id", "generalcallid", "sessionid", "call_session_id"]);
  const externalId = idRaw ?? `gen:${startedAt.getTime()}:${phone}:${direction}`;

  return {
    externalId, direction, status, phone,
    ourNumber: normalizePhone(ourRaw) ?? ourRaw,
    extension,
    startedAt, durationSec,
    recordingUrl: recordingUrl && /^https?:\/\//i.test(recordingUrl) ? recordingUrl : null,
  };
}
