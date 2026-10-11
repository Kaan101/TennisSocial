import { getCheckInLeadHours } from "./courts/service";
import { refreshFlowLimits } from "./matchOfferFlow";
import { prisma } from "../lib/prisma";

const SPECS = [
  { key: "matchWindowDays", label: "Defi penceresi (gün)", min: 1, max: 90 },
  { key: "scheduleHours", label: "Maç tarihi süresi (saat)", min: 1, max: 336 },
  { key: "cooldownDays", label: "Yeniden defi bekleme (gün)", min: 1, max: 90 },
  { key: "checkInLeadHours", label: "Kort giriş süresi (saat)", min: 0, max: 72 },
] as const;

type ParameterKey = (typeof SPECS)[number]["key"];

export async function readAdminParameters() {
  const flow = await refreshFlowLimits();
  const lead = await getCheckInLeadHours();
  const values: Record<ParameterKey, number> = {
    matchWindowDays: flow.matchWindowDays,
    scheduleHours: flow.scheduleHours,
    cooldownDays: flow.cooldownDays,
    checkInLeadHours: lead,
  };
  return {
    parameters: SPECS.map((spec) => ({
      key: spec.key,
      label: spec.label,
      min: spec.min,
      max: spec.max,
      value: values[spec.key],
    })),
  };
}

export async function writeAdminParameters(input: Partial<Record<ParameterKey, number>>) {
  const entries = SPECS.flatMap((spec) => {
    const value = input[spec.key];
    if (value === undefined) return [];
    return [{ key: spec.key, value: String(value) }];
  });
  if (entries.length > 0) {
    await prisma.$transaction(
      entries.map((entry) =>
        prisma.systemParameter.upsert({
          where: { key: entry.key },
          create: { key: entry.key, value: entry.value },
          update: { value: entry.value },
        }),
      ),
    );
  }
  return readAdminParameters();
}
