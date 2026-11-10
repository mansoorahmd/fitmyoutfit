import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminLoginMessage,
  hostAndPort,
  servicesToCheck,
  unreachableMessage,
} from "./setup-checks.mjs";

test("adminLoginMessage names the email and where the password is set, never the password", () => {
  const message = adminLoginMessage({
    MEDUSA_ADMIN_EMAIL: "admin@fitmyoutfit.local",
    MEDUSA_ADMIN_PASSWORD: "dev-admin-password",
  });
  assert.match(message, /admin@fitmyoutfit\.local/);
  assert.match(message, /MEDUSA_ADMIN_PASSWORD in backend\/\.env/);
  assert.doesNotMatch(message, /dev-admin-password/);
});

test("adminLoginMessage explains how to get an admin when none is configured", () => {
  assert.match(adminLoginMessage({}), /set MEDUSA_ADMIN_EMAIL and MEDUSA_ADMIN_PASSWORD/);
});

test("servicesToCheck always checks PostgreSQL, and Redis only when REDIS_URL is set", () => {
  const withRedis = servicesToCheck({
    DATABASE_URL: "postgres://medusa:medusa@localhost:5433/medusa",
    REDIS_URL: "redis://localhost:6379",
  });
  assert.deepEqual(withRedis.problems, []);
  assert.deepEqual(
    withRedis.services.map((s) => [s.name, s.host, s.port]),
    [
      ["PostgreSQL", "localhost", 5433],
      ["Redis", "localhost", 6379],
    ],
  );
  const withoutRedis = servicesToCheck({ DATABASE_URL: "postgres://h/db", REDIS_URL: "" });
  assert.deepEqual(
    withoutRedis.services.map((s) => [s.name, s.port]),
    [["PostgreSQL", 5432]],
  );
});

test("servicesToCheck reports a missing or malformed DATABASE_URL and a malformed REDIS_URL", () => {
  assert.deepEqual(servicesToCheck({}).problems, ["DATABASE_URL is not set in backend/.env"]);
  assert.deepEqual(servicesToCheck({ DATABASE_URL: "not a url", REDIS_URL: "::" }).problems, [
    "DATABASE_URL in backend/.env is not a valid URL",
    "REDIS_URL in backend/.env is not a valid URL",
  ]);
});

test("unreachableMessage says which service, where, and what to do", () => {
  const redis = unreachableMessage({ name: "Redis", variable: "REDIS_URL", host: "localhost", port: 6379 });
  assert.match(redis, /Cannot reach Redis at localhost:6379 \(REDIS_URL in backend\/\.env\)/);
  assert.match(redis, /docker compose up -d/);
  assert.match(redis, /remove REDIS_URL/);
  const pg = unreachableMessage({ name: "PostgreSQL", variable: "DATABASE_URL", host: "db", port: 5433 });
  assert.match(pg, /Cannot reach PostgreSQL at db:5433/);
  assert.doesNotMatch(pg, /REDIS_URL/);
});

test("hostAndPort falls back to the default port and returns null for a bad URL", () => {
  assert.deepEqual(hostAndPort("redis://cache", 6379), { host: "cache", port: 6379 });
  assert.equal(hostAndPort("nope", 1), null);
});
