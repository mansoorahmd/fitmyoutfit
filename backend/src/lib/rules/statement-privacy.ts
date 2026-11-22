/**
 * A failed database statement must not carry its values into the log. MikroORM writes the values
 * INTO the statement before it hands it to knex (`insert into "roster_entry" (...) values ('Player
 * A', ...)`), and knex puts that whole statement in front of the database's message
 * (`<statement> - integer out of range`). Medusa's error handler logs the message of every error
 * that ends a request in a 500, in every NODE_ENV. For the team-order module those values are the
 * players' names, numbers and sizes. (Knex's own `compileSqlOnError: false` does not help: the
 * values are already in the text knex receives.)
 *
 * So the services of the team-order and design modules catch what their methods throw and rethrow
 * it with the statement cut down to its verb and table, and the database's own message kept
 * (`insert into "roster_entry" (values not logged) - integer out of range`). This is done
 * everywhere except under NODE_ENV exactly `development` or `test`, where the values help. The
 * database's message can still name the one value it refused (`value "3000000000" is out of range
 * for type integer`); that is the database's text and is kept.
 *
 * Plain TypeScript, no Medusa imports.
 */
import { isExactlyDevelopmentOrTest } from "../config/node-env"

/** What a statement error looks like: the statement, " - ", the database's message. */
const STATEMENT = /^\s*(insert into "?[\w.]+"?|update "?[\w.]+"?|delete from "?[\w.]+"?|select\b|with\b|begin\b|savepoint\b|rollback\b|commit\b)/i

const SCRUBBED = Symbol.for("fitmyoutfit.statement-values-removed")

/** The message without the statement's values, or null when it is not a statement error. */
export function messageWithoutValues(message: string): string | null {
  const match = STATEMENT.exec(message)
  if (!match) return null
  // The database's message follows the LAST " - ": a value may hold " - ", the database's text
  // rarely does, and cutting at the last one can only drop the front of the database's text.
  const cut = message.lastIndexOf(" - ")
  const databaseMessage = cut === -1 ? "" : message.slice(cut + 3)
  return `${match[1]!.trim()} (values not logged)${databaseMessage === "" ? "" : ` - ${databaseMessage}`}`
}

/**
 * Takes the statement's values out of an error's message and stack (the same error object, changed
 * in place: its other properties, such as the database's `code`, stay). Returns the error.
 */
export function removeStatementValues<T>(error: T, nodeEnv: string | undefined = process.env.NODE_ENV): T {
  if (isExactlyDevelopmentOrTest(nodeEnv) || typeof error !== "object" || error === null) {
    return error
  }
  const e = error as { message?: unknown; stack?: unknown; [SCRUBBED]?: true }
  if (e[SCRUBBED] || typeof e.message !== "string") return error
  const clean = messageWithoutValues(e.message)
  if (clean === null) return error
  const original = e.message
  try {
    if (typeof e.stack === "string") e.stack = e.stack.split(original).join(clean)
    e.message = clean
    e[SCRUBBED] = true
  } catch {
    // A frozen error cannot be changed; it is rethrown as it is.
  }
  return error
}

type AnyFunction = (this: unknown, ...args: unknown[]) => unknown

function guarded(original: AnyFunction): AnyFunction {
  return function (this: unknown, ...args: unknown[]): unknown {
    let result: unknown
    try {
      result = original.apply(this, args)
    } catch (error) {
      throw removeStatementValues(error)
    }
    if (typeof (result as { then?: unknown } | null)?.then === "function") {
      return (result as Promise<unknown>).then(undefined, (error: unknown) => {
        throw removeStatementValues(error)
      })
    }
    return result
  }
}

/**
 * Wraps every method of a module service class, the generated ones of Medusa's data service
 * included, so that what it throws goes through `removeStatementValues`. Call it once per class,
 * where the class is exported. Returns the class.
 */
export function protectStatementValues<T extends abstract new (...args: never[]) => object>(serviceClass: T): T {
  for (let proto = serviceClass.prototype as object | null; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === "constructor") continue
      const descriptor = Object.getOwnPropertyDescriptor(proto, name)
      if (!descriptor || typeof descriptor.value !== "function" || !descriptor.writable) continue
      const original = descriptor.value as AnyFunction & { [SCRUBBED]?: true }
      if (original[SCRUBBED]) continue
      const wrapped = guarded(original) as AnyFunction & { [SCRUBBED]?: true }
      wrapped[SCRUBBED] = true
      Object.defineProperty(proto, name, { ...descriptor, value: wrapped })
    }
  }
  return serviceClass
}
