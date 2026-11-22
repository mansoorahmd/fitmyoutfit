import { messageWithoutValues, protectStatementValues, removeStatementValues } from "../statement-privacy"

const INSERT =
  `insert into "roster_entry" ("id", "name", "count") values ('rosent_1', 'Ali - Raza', 3000000000) - integer out of range`

describe("messageWithoutValues", () => {
  it("keeps the verb and table and the database's message, and drops the values, also one holding ' - '", () => {
    expect(messageWithoutValues(INSERT)).toBe(`insert into "roster_entry" (values not logged) - integer out of range`)
    expect(messageWithoutValues(`update team_order set team_name = 'Lions' where id = 'x' - deadlock detected`)).toBe(
      "update team_order (values not logged) - deadlock detected"
    )
    expect(messageWithoutValues(`select "t0".* from "team_order" as "t0" where "t0"."id" = 'a' - connection terminated`)).toBe(
      "select (values not logged) - connection terminated"
    )
  })

  it("leaves a message that is not a statement alone", () => {
    expect(messageWithoutValues("Team order x changed while it was deleted.")).toBeNull()
    expect(messageWithoutValues("")).toBeNull()
  })
})

describe("removeStatementValues", () => {
  const failure = () => Object.assign(new Error(INSERT), { code: "22003" })

  it.each(["production", "prod", "staging", "Development", ""])("cleans the message and the stack under NODE_ENV %j", (nodeEnv) => {
    const error = failure()
    expect(removeStatementValues(error, nodeEnv)).toBe(error)
    expect(error.message).not.toContain("Ali")
    expect(String(error.stack)).not.toContain("Ali - Raza")
    expect(error.message).toContain("integer out of range")
    expect((error as { code?: string }).code).toBe("22003")
  })

  it.each(["development", "test"])("keeps everything under NODE_ENV %j", (nodeEnv) => {
    const error = failure()
    removeStatementValues(error, nodeEnv)
    expect(error.message).toBe(INSERT)
  })

  it("does nothing to other errors, non-errors and an error it cleaned already", () => {
    const other = new Error("boom")
    expect(removeStatementValues(other, "production").message).toBe("boom")
    expect(removeStatementValues("text", "production")).toBe("text")
    expect(removeStatementValues(null, "production")).toBeNull()
    const once = removeStatementValues(failure(), "production")
    const message = once.message
    expect(removeStatementValues(once, "production").message).toBe(message)
  })
})

describe("protectStatementValues", () => {
  class Base {
    async failsInBase(): Promise<never> {
      throw new Error(INSERT)
    }
  }
  class Service extends Base {
    async failsAsync(): Promise<never> {
      throw new Error(INSERT)
    }
    failsSync(): never {
      throw new Error(INSERT)
    }
    sync(value: number): number {
      return value + 1
    }
    async fine(value: number): Promise<number> {
      return value + 1
    }
    other(): Promise<never> {
      return Promise.reject(new Error("not a statement"))
    }
  }
  protectStatementValues(Service)
  const nodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = nodeEnv
  })

  it("cleans what a method throws or rejects with, inherited methods included, outside development and tests", async () => {
    process.env.NODE_ENV = "production"
    const service = new Service()
    await expect(service.failsAsync()).rejects.toThrow('insert into "roster_entry" (values not logged) - integer out of range')
    await expect(service.failsInBase()).rejects.toThrow('insert into "roster_entry" (values not logged)')
    expect(() => service.failsSync()).toThrow('insert into "roster_entry" (values not logged)')
    await expect(service.other()).rejects.toThrow("not a statement")
  })

  it("keeps the statement under test, and changes nothing else about the methods", async () => {
    const service = new Service()
    await expect(service.failsAsync()).rejects.toThrow("Ali - Raza")
    expect(service.sync(1)).toBe(2)
    expect(await service.fine(1)).toBe(2)
  })

  it("wraps a class once: a second call changes nothing", () => {
    const method = Service.prototype.failsAsync
    protectStatementValues(Service)
    expect(Service.prototype.failsAsync).toBe(method)
  })
})
