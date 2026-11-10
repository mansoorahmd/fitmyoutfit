// Plain helpers for scripts/setup.mjs: which services to check, the messages it prints.
// No side effects; tested in setup-checks.test.mjs.

/**
 * Host and port of a service URL such as postgres://u:p@localhost:5433/db or redis://localhost:6379.
 * Returns null when the URL cannot be parsed.
 */
export function hostAndPort(url, defaultPort) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return { host: parsed.hostname || "localhost", port: Number(parsed.port || defaultPort) };
}

/**
 * The services setup must reach before it runs migrations, read from backend/.env (or the shell).
 * PostgreSQL is always needed. Redis only when REDIS_URL is set (without it Medusa uses its
 * in-memory modules). Returns { services, problems }: problems are config errors to stop on.
 * `sources` says where each variable's value came from ("backend/.env" when not given), so the
 * messages point at the right place.
 */
export function servicesToCheck(backendEnv, sources = {}) {
  const services = [];
  const problems = [];
  const from = (variable) => sources[variable] ?? "backend/.env";
  if (!backendEnv.DATABASE_URL) {
    problems.push("DATABASE_URL is not set in backend/.env");
  } else {
    const db = hostAndPort(backendEnv.DATABASE_URL, 5432);
    if (!db) problems.push(`DATABASE_URL in ${from("DATABASE_URL")} is not a valid URL`);
    else services.push({ name: "PostgreSQL", variable: "DATABASE_URL", source: from("DATABASE_URL"), ...db });
  }
  if (backendEnv.REDIS_URL) {
    const redis = hostAndPort(backendEnv.REDIS_URL, 6379);
    if (!redis) problems.push(`REDIS_URL in ${from("REDIS_URL")} is not a valid URL`);
    else services.push({ name: "Redis", variable: "REDIS_URL", source: from("REDIS_URL"), ...redis });
  }
  return { services, problems };
}

/** The message for a service that did not answer, with what to do about it. */
export function unreachableMessage(service) {
  const source = service.source ?? "backend/.env";
  const lines = [
    `Cannot reach ${service.name} at ${service.host}:${service.port} (${service.variable} in ${source}).`,
    `Start the services with "docker compose up -d" and wait until "docker compose ps" shows them healthy, then run "npm run setup" again.`,
    `If you changed a host port in the root .env, update ${service.variable} in ${source} to match.`,
  ];
  if (service.name === "Redis") {
    lines.push(`Or remove REDIS_URL from ${source} to use Medusa's in-memory cache, event bus and workflow engine.`);
  }
  return lines.join("\n");
}

/**
 * The closing note about the local admin login. Names the email and where the password is set,
 * never the password itself (setup output ends up in terminals, logs and screenshots).
 */
export function adminLoginMessage(backendEnv, adminUrl = "http://localhost:9000/app") {
  if (!backendEnv.MEDUSA_ADMIN_EMAIL || !backendEnv.MEDUSA_ADMIN_PASSWORD) {
    return "No local admin user: set MEDUSA_ADMIN_EMAIL and MEDUSA_ADMIN_PASSWORD in backend/.env and run setup again.";
  }
  return (
    `Admin login (dev only) at ${adminUrl}: ${backendEnv.MEDUSA_ADMIN_EMAIL}, ` +
    `with the password set as MEDUSA_ADMIN_PASSWORD in backend/.env.`
  );
}
