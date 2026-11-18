import { useQuery } from "@tanstack/react-query";
import { fetchDialSettings, type DialSettings } from "../api/calls";

/**
 * Raqamni ATS qabul qiladigan ko'rinishga keltiradi. O'zbekiston raqamlari (998 + 9 raqam):
 *  local (standart) -> 901234567, intl -> 998901234567, plus -> +998901234567. Boshqa davlat raqamlari faqat raqamlar bilan.
 */
export function dialNumber(phone: string, cfg?: Partial<DialSettings>): string {
  let d = phone.replace(/\D/g, "");
  if (d.length === 9) d = `998${d}`;
  const uz = d.length === 12 && d.startsWith("998");
  const format = cfg?.format ?? "local";
  const num = format === "plus" ? `+${d}` : format === "local" && uz ? d.slice(3) : d;
  return `${cfg?.prefix ?? ""}${num}`;
}

/** `tel:` havolasi yasovchi: kompyuterda MicroSIP shu havolalarni ochadi va raqamni teradi. */
export function useTelHref() {
  const { data } = useQuery({ queryKey: ["calls", "dial-settings"], queryFn: fetchDialSettings, staleTime: 5 * 60_000 });
  return (phone: string) => `tel:${dialNumber(phone, data)}`;
}
