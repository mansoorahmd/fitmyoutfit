import { connectionStringLogin, effectiveDatabaseLogin } from "../database-login"

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
