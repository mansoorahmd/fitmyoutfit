import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  connectionStringLogin,
  databaseHostProblem,
  databaseUrlReadings,
  effectiveDatabaseLogin,
  medusaClientUrl,
} from "../database-login"

/** QA, fourth review: accepted by the check, and Medusa then logged in as medusa / medusa. */
const QA_SSL_MODE_URL = "postgres://medusa:real@localhost:5433/db?ssl_mode=disable#&password=medusa"

describe("connectionStringLogin", () => {
  it("reads the user and password before the @, percent-decoded", () => {
    expect(connectionStringLogin("postgres://medusa:%6Dedusa@db:5432/x")).toEqual({
      user: "medusa",
      password: "medusa",
    })
  })

  it("lets the user and password query parameters win, the last one when repeated", () => {
    expect(connectionStringLogin("postgres://medusa@localhost:5433/db?password=medusa")).toEqual({
      user: "medusa",
      password: "medusa",
    })
    expect(connectionStringLogin("postgres://a:b@db/x?user=medusa&password=medusa")).toEqual({
      user: "medusa",
      password: "medusa",
    })
    expect(connectionStringLogin("postgres://db/x?password=real&password=medusa")?.password).toBe(
      "medusa"
    )
  })

  it("reads a URL with an empty host, as pg does with its dummy host", () => {
    expect(connectionStringLogin("postgres://medusa:medusa@/db")).toEqual({
      user: "medusa",
      password: "medusa",
    })
  })

  it("finds no login in a socket path or a string that is not a URL", () => {
    expect(connectionStringLogin("/var/run/postgresql medusa")).toEqual({ user: "", password: "" })
    expect(connectionStringLogin("not a url")).toEqual({ user: "", password: "" })
    expect(connectionStringLogin("host=db user=medusa password=medusa")).toEqual({
      user: "",
      password: "",
    })
  })

  it("returns null for a string pg cannot read at all", () => {
    expect(connectionStringLogin("postgres://[bad")).toBeNull()
  })

  // QA's tenth review, M5: an empty host with a port. pg itself cannot read it (checked against
  // the installed pg-connection-string), so there is no login either.
  it("returns null for an empty host with a port, as pg cannot read it", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parse } = require("pg-connection-string") as { parse: (url: string) => unknown }
    for (const url of ["postgres://u:p@:5433/db", "postgresql://u:p@:5433", "postgres://u:p@:5433/db?ssl_mode=disable"]) {
      expect(() => parse(url)).toThrow()
      expect(connectionStringLogin(url)).toBeNull()
    }
  })
})

describe("effectiveDatabaseLogin", () => {
  it("falls back to PGUSER and PGPASSWORD for the parts the string does not give", () => {
    expect(
      effectiveDatabaseLogin("postgres://medusa@localhost:5433/db", { PGPASSWORD: "medusa" })
    ).toEqual({ user: "medusa", password: "medusa" })
    expect(
      effectiveDatabaseLogin("postgres://localhost/db", { PGUSER: "medusa", PGPASSWORD: "medusa" })
    ).toEqual({ user: "medusa", password: "medusa" })
    expect(effectiveDatabaseLogin(undefined, { PGUSER: "u", PGPASSWORD: "p" })).toEqual({
      user: "u",
      password: "p",
    })
  })

  it("does not let PGUSER / PGPASSWORD replace what the string gives", () => {
    expect(
      effectiveDatabaseLogin("postgres://real:secret@db/x", { PGUSER: "medusa", PGPASSWORD: "medusa" })
    ).toEqual({ user: "real", password: "secret" })
  })

  it("uses the operating-system user last: USERNAME on Windows, USER elsewhere", () => {
    const env = { USERNAME: "win-user", USER: "unix-user" }
    expect(effectiveDatabaseLogin("postgres://db/x", env, "win32")?.user).toBe("win-user")
    expect(effectiveDatabaseLogin("postgres://db/x", env, "linux")?.user).toBe("unix-user")
    expect(effectiveDatabaseLogin("postgres://db/x", {}, "linux")).toEqual({
      user: undefined,
      password: undefined,
    })
  })

  it("returns null when pg could not read the connection string", () => {
    expect(effectiveDatabaseLogin("postgres://[bad", { PGPASSWORD: "medusa" })).toBeNull()
  })
})

/**
 * The same cases through the pg that Medusa uses (backend/node_modules/pg, via knex), so a pg
 * upgrade that changes the rules fails here. pg reads PGUSER / PGPASSWORD from process.env when it
 * builds the parameters, so each case sets them for the moment it runs.
 */
describe("effectiveDatabaseLogin agrees with the installed pg", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ConnectionParameters = require("pg/lib/connection-parameters")
  const saved = { PGUSER: process.env.PGUSER, PGPASSWORD: process.env.PGPASSWORD }
  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  it.each([
    ["postgres://medusa:medusa@localhost:5433/medusa", {}],
    ["postgres://medusa@localhost:5433/db?password=medusa", {}],
    ["postgres://a:b@db/x?user=medusa&password=medusa", {}],
    ["postgres://db/x?password=real&password=medusa", {}],
    ["postgres://medusa:%6Dedusa@db/x?sslmode=disable", {}],
    ["postgres://medusa:medusa@/db", {}],
    ["postgres://medusa@localhost:5433/db", { PGPASSWORD: "medusa" }],
    ["postgres://localhost/db", { PGUSER: "medusa", PGPASSWORD: "medusa" }],
    ["postgres://real:secret@db/x", { PGUSER: "medusa", PGPASSWORD: "medusa" }],
    ["postgres://us er:pa%zzss@db/x", {}],
    ["not a url", { PGPASSWORD: "p" }],
    ["/var/run/postgresql medusa", { PGUSER: "medusa" }],
  ] as [string, Record<string, string>][])("%s with %j", (url, pgEnv) => {
    delete process.env.PGUSER
    delete process.env.PGPASSWORD
    Object.assign(process.env, pgEnv)
    const pg = new ConnectionParameters({ connectionString: url })
    const ours = effectiveDatabaseLogin(url, { ...process.env })
    expect(ours).toEqual({
      user: pg.user || undefined,
      password: pg.password || undefined,
    })
  })
})

describe("databaseHostProblem", () => {
  it("accepts a URL with a host after the @ and no host parameter", () => {
    for (const url of [
      "postgres://u:p@db/x",
      "postgresql://u:p@db.example.com:6543/x?sslmode=require",
      "postgres://u:p@127.0.0.1/x",
      "postgres://u:p@[2001:db8::1]:5432/x",
      "postgres://db/x",
    ]) {
      expect({ url, problem: databaseHostProblem(url) }).toEqual({ url, problem: undefined })
    }
  })

  it("finds a missing host, a host parameter and a string that is not a URL", () => {
    expect(databaseHostProblem("postgres://u:p@/x")).toBe("no_host")
    // QA's tenth review, M5: an empty host with a port is a missing host, not "not a URL".
    expect(databaseHostProblem("postgres://u:p@:5433/db")).toBe("no_host")
    expect(databaseHostProblem("postgresql://u:p@:5433")).toBe("no_host")
    expect(databaseHostProblem("postgres://u:p@?sslmode=require")).toBe("no_host")
    expect(databaseHostProblem("mysql://u:p@:5433/db")).toBe("not_a_url")
    expect(databaseHostProblem("postgres://u:p@%2Ftmp/x")).toBe("no_host")
    expect(databaseHostProblem("postgres://u:p@db/x?host=other")).toBe("host_parameter")
    expect(databaseHostProblem("postgres://u:p@db/x?Hostaddr=10.0.0.1")).toBe("host_parameter")
    expect(databaseHostProblem("/var/run/postgresql x")).toBe("not_a_url")
    expect(databaseHostProblem("host=db user=u")).toBe("not_a_url")
    expect(databaseHostProblem("http://u:p@db/x")).toBe("not_a_url")
    expect(databaseHostProblem("postgres://[bad")).toBe("not_a_url")
  })

  it("looks at every reading: a host parameter that only Medusa's rewrite brings into the query", () => {
    // As given, `&host=` sits in the fragment; after Medusa removes ssl_mode it is in the query.
    expect(databaseHostProblem("postgres://u:p@db/x?ssl_mode=1#&host=evil")).toBe("host_parameter")
    expect(databaseHostProblem("postgres://u:p@db/x?ssl_mode=1&host=evil")).toBe("host_parameter")
  })
})

/**
 * Why those are refused, against the installed pg: for every URL databaseHostProblem accepts, pg
 * connects to the host after the @ whatever PGHOST says; for each refused one, PGHOST or a
 * parameter chooses the server.
 */
describe("databaseHostProblem agrees with the installed pg", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ConnectionParameters = require("pg/lib/connection-parameters")
  const saved = process.env.PGHOST
  beforeAll(() => {
    process.env.PGHOST = "pghost.example"
  })
  afterAll(() => {
    if (saved === undefined) {
      delete process.env.PGHOST
    } else {
      process.env.PGHOST = saved
    }
  })
  const pgHost = (url: string) => new ConnectionParameters({ connectionString: url }).host

  it.each([
    ["postgres://u:p@db/x", "db"],
    ["postgresql://u:p@db.example.com:6543/x?sslmode=require", "db.example.com"],
    ["postgres://u:p@[2001:db8::1]:5432/x", "2001:db8::1"],
  ])("accepted %s: pg connects to %s", (url, host) => {
    expect(databaseHostProblem(url)).toBeUndefined()
    expect(pgHost(url)).toBe(host)
  })

  it.each([
    ["postgres://u:p@/x", "pghost.example"],
    ["postgres://u:p@db/x?host=evil.example", "evil.example"],
    ["/var/run/postgresql x", "/var/run/postgresql"],
    ["postgres://u:p@%2Ftmp/x", "/tmp"],
  ])("refused %s: pg would connect to %s, not a host after the @", (url, host) => {
    expect(databaseHostProblem(url)).toBeDefined()
    expect(pgHost(url)).toBe(host)
  })
})

describe("medusaClientUrl (Medusa's ssl_mode rewrite)", () => {
  it.each([
    ["postgres://u:p@db/x?ssl_mode=disable", "postgres://u:p@db/x"],
    ["postgres://u:p@db/x?ssl_mode=disable&a=1", "postgres://u:p@db/x?a=1"],
    ["postgres://u:p@db/x?a=1&ssl_mode=require", "postgres://u:p@db/x?a=1"],
    ["postgres://u:p@db/x?a=1&SSL_MODE=x&b=2", "postgres://u:p@db/x?a=1&b=2"],
    ["postgres://u:p@db/x?sslmode=require", "postgres://u:p@db/x?sslmode=require"],
    // The `[^&]*` eats the `#`, so what was the fragment becomes the query.
    [QA_SSL_MODE_URL, "postgres://medusa:real@localhost:5433/db?password=medusa"],
  ])("%s becomes %s", (url, expected) => {
    expect(medusaClientUrl(url)).toBe(expected)
  })

  it("is why QA's URL logs in as medusa / medusa: pg reads the fragment as given, the query after", () => {
    expect(effectiveDatabaseLogin(QA_SSL_MODE_URL, {})?.password).toBe("real")
    expect(effectiveDatabaseLogin(medusaClientUrl(QA_SSL_MODE_URL), {})).toEqual({
      user: "medusa",
      password: "medusa",
    })
  })

  it("databaseUrlReadings: as given, trimmed, and both after the rewrite, without repeats", () => {
    expect(databaseUrlReadings(undefined)).toEqual([undefined])
    expect(databaseUrlReadings("postgres://db/x")).toEqual(["postgres://db/x"])
    expect(databaseUrlReadings(" postgres://db/x?ssl_mode=1 ")).toEqual([
      " postgres://db/x?ssl_mode=1 ",
      "postgres://db/x?ssl_mode=1",
      // The rewrite's `[^&]*` eats the trailing space too.
      " postgres://db/x",
      "postgres://db/x",
    ])
  })
})

/**
 * Medusa rewrites DATABASE_URL in two places before pg sees it. These tests read the rewrite out of
 * the installed files and run it against medusaClientUrl, so a Medusa upgrade that changes or moves
 * it fails here instead of silently reopening QA's bypass. If one fails: read the new Medusa code,
 * update medusaClientUrl (and databaseUrlReadings if the URL now changes elsewhere), then this test.
 */
describe("medusaClientUrl agrees with the rewrite in the installed Medusa", () => {
  const PATTERN = "/(\\?|&)ssl_mode=[^&]*(&|$)/gi"
  const frameworkDatabaseDir = dirname(require.resolve("@medusajs/framework/database"))
  const utilsDist = dirname(require.resolve("@medusajs/utils", { paths: [frameworkDatabaseDir] }))
  const files = {
    "@medusajs/framework database/pg-connection-loader.js": {
      path: join(frameworkDatabaseDir, "pg-connection-loader.js"),
      // The rewritten URL is what the shared connection is created with.
      appliedTo: /const clientUrl = connectionString\?\.replace\(/,
      usedBy: /createPgConnection\(\{\s*clientUrl,/,
    },
    "@medusajs/utils modules-sdk/load-module-database-config.js": {
      path: join(utilsDist, "modules-sdk", "load-module-database-config.js"),
      appliedTo: /database\.clientUrl = database\.clientUrl\?\.replace\(/,
      usedBy: /return database;/,
    },
  }

  /** The `.replace(...)` call in `source` whose pattern is about ssl_mode, as text. */
  function extractRewrite(source: string): string {
    const start = source.indexOf(".replace(/(\\?|&)ssl_mode=")
    expect(start).toBeGreaterThan(-1)
    let depth = 0
    for (let i = start + ".replace".length; i < source.length; i++) {
      if (source[i] === "(") {
        depth++
      } else if (source[i] === ")") {
        depth--
        if (depth === 0) {
          return source.slice(start, i + 1)
        }
      }
    }
    throw new Error("unbalanced .replace( call")
  }

  const samples = [
    QA_SSL_MODE_URL,
    "postgres://real:real@localhost:5433/db?ssl_mode=x#&user=medusa&password=medusa",
    "postgres://u:p@db/x?ssl_mode=disable",
    "postgres://u:p@db/x?ssl_mode=disable&password=medusa",
    "postgres://u:p@db/x?a=1&ssl_mode=require&b=2",
    "postgres://u:p@db/x?a=1&Ssl_Mode=require",
    "postgres://u:p@db/x?ssl_mode=a&ssl_mode=b&c=d",
    "postgres://u:p@db/x?sslmode=require&x_ssl_mode=1",
    " postgres://medusa:medusa@db/x ",
    "postgres://u:p@db/x#ssl_mode=1&password=medusa",
  ]

  it.each(Object.entries(files))("%s", (_name, file) => {
    const source = readFileSync(file.path, "utf8")
    // Exactly one rewrite, applied to the URL that is then used.
    expect(source.match(/ssl_mode=\[\^&\]\*/g)).toHaveLength(1)
    expect(source).toMatch(file.appliedTo)
    expect(source).toMatch(file.usedBy)
    const call = extractRewrite(source)
    expect(call.startsWith(`.replace(${PATTERN},`)).toBe(true)
    // Run Medusa's own call on the samples. (This evaluates code from the installed package, which
    // the backend runs anyway.)
    const theirs = new Function("url", `return url${call}`) as (url: string) => string
    for (const url of samples) {
      expect([url, theirs(url)]).toEqual([url, medusaClientUrl(url)])
    }
  })
})
