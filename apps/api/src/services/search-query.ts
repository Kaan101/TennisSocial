import type { BackhandType, OverallLevel } from "@club/shared";

export type ParsedQuery = {
  text: string;
  overallLevel?: OverallLevel;
  forehandMin?: number;
  backhandMin?: number;
  serveMin?: number;
  backhandType?: BackhandType;
  availableToday?: boolean;
  availableWeekend?: boolean;
};

const LEVELS: [string, OverallLevel][] = [
  ["turnuva oyuncusu", "TOURNAMENT"],
  ["baslangic+", "BEGINNER_PLUS"],
  ["baslangic", "BEGINNER"],
  ["orta+", "INTERMEDIATE_PLUS"],
  ["orta", "INTERMEDIATE"],
  ["ileri+", "ADVANCED_PLUS"],
  ["ileri", "ADVANCED"],
];

export function foldTr(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c");
}

export function parseSearchQuery(raw: string | undefined): ParsedQuery {
  if (!raw?.trim()) return { text: "" };
  let text = ` ${foldTr(raw)} `;
  const parsed: ParsedQuery = { text: "" };

  const drop = (phrase: string) => {
    if (text.includes(phrase)) {
      text = text.replaceAll(phrase, " ");
      return true;
    }
    return false;
  };

  if (drop("bugun musait")) parsed.availableToday = true;
  if (drop("hafta sonu musait") || drop("haftasonu musait") || drop("haftasonu")) parsed.availableWeekend = true;
  if (drop("tek elli backhand") || drop("tek el backhand")) parsed.backhandType = "ONE_HANDED";
  if (drop("cift elli backhand") || drop("cift el backhand")) parsed.backhandType = "TWO_HANDED";

  text = text.replace(/(forehand|backhand|servis|serve)\s*(\d+(?:[.,]\d+)?)\s*\+?/g, (_all, skill: string, amount: string) => {
    const value = Number(amount.replace(",", "."));
    if (skill === "forehand") parsed.forehandMin = value;
    else if (skill === "backhand") parsed.backhandMin = value;
    else parsed.serveMin = value;
    return " ";
  });

  for (const [phrase, level] of LEVELS) {
    if (drop(phrase)) {
      parsed.overallLevel = level;
      break;
    }
  }

  parsed.text = text.replace(/\s+/g, " ").trim();
  return parsed;
}
