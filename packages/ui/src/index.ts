export const brand = {
  name: "Kort",
  tagline: "Kulübün kortu",
  locale: "tr-TR",
} as const;

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
