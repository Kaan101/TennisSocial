const url = process.env.TEST_DATABASE_URL ?? "postgresql://tennis:tennis@localhost:5432/tennisclub_test";
if (!url.includes("test")) {
  throw new Error(`Refusing to run tests against a non-test database: ${url}`);
}
process.env.TEST_DATABASE_URL = url;
process.env.DATABASE_URL = url;
process.env.NODE_ENV = "test";
process.env.ACCESS_TOKEN_SECRET ??= "test-access-secret-which-is-long-enough";
process.env.WEB_ORIGIN ??= "http://localhost:43123";
process.env.API_PUBLIC_URL ??= "http://127.0.0.1:43124";
