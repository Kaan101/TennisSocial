import { prisma } from "../lib/prisma";

export async function promoteConfiguredAdmins(): Promise<void> {
  // ADMIN_EMAILS: comma-separated emails promoted to ADMIN when the API starts.
  const raw = process.env.ADMIN_EMAILS ?? "";
  const emails = [
    ...new Set(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .flatMap((item) => [item, item.toLocaleLowerCase("tr-TR"), item.toLowerCase()]),
    ),
  ];
  if (emails.length === 0) return;
  await prisma.user.updateMany({
    where: { email: { in: emails }, deletedAt: null },
    data: { accountRole: "ADMIN" },
  });
}
