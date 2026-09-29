import { beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";

beforeEach(async () => {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("test")) throw new Error("Refusing to truncate a non-test database");
  await prisma.$executeRawUnsafe(`
    DO $$ DECLARE r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations') LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
});
