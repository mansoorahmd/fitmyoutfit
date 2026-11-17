import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buildModules, buildNotificationModules } from "../build-config"
import { EMAIL_CHANNEL, emailDelivery, mayLogResetLink } from "../email-delivery"

function channelsOf(env: Record<string, string | undefined>): string[] {
  const notification = buildNotificationModules(env).find(
    (m) => m.resolve === "@medusajs/medusa/notification"
  )
  const providers = (notification?.options?.providers ?? []) as {
    resolve: string
    id: string
    options: { channels: string[] }
  }[]
  expect(providers.map((p) => p.resolve)).toEqual(["@medusajs/medusa/notification-local"])
  return providers[0].options.channels
}

describe("may a reset link be logged here?", () => {
  it.each(["development", "test", " development ", "\ttest\n"])(
    "yes when NODE_ENV, trimmed, is exactly development or test (NODE_ENV=%j)",
    (NODE_ENV) => {
      expect(emailDelivery({ NODE_ENV })).toBe("log")
      expect(mayLogResetLink({ NODE_ENV })).toBe(true)
    }
  )

  it.each([
    undefined,
    "",
    " ",
    "   ",
    "Development",
    " Development ",
    "TEST",
    "production",
    "Production",
    "prod",
    "PRODUCTION",
    "staging",
    "qa",
    "developmen",
    "development test",
  ])(
    "never anywhere else, unset and blank included (NODE_ENV=%j)",
    (NODE_ENV) => {
      expect(emailDelivery({ NODE_ENV })).toBe("none")
      expect(mayLogResetLink({ NODE_ENV })).toBe(false)
    }
  )

  it("keeps development and the tests on the logging side: medusa develop and Jest set NODE_ENV", () => {
    const develop = readFileSync(
      join(__dirname, "..", "..", "..", "..", "node_modules/@medusajs/medusa/dist/commands/develop.js"),
      "utf8"
    )
    expect(develop).toContain('NODE_ENV: "development",')
    expect(process.env.NODE_ENV).toBe("test")
  })

  it("does not change its answer for settings that look like an email provider", () => {
    expect(mayLogResetLink({ NODE_ENV: "production", RESEND_API_KEY: "re_123" })).toBe(false)
  })
})

describe("buildNotificationModules", () => {
  it("gives the local provider the email channel in development and test", () => {
    expect(EMAIL_CHANNEL).toBe("email")
    for (const NODE_ENV of ["development", "test"]) {
      expect(channelsOf({ NODE_ENV })).toEqual(["feed", "email"])
    }
  })

  it("keeps the email channel away from the local provider (the log) everywhere else", () => {
    for (const NODE_ENV of [undefined, "", " ", "Development", "production", "prod", "staging"]) {
      expect(channelsOf({ NODE_ENV })).toEqual(["feed"])
    }
  })

  it("is part of the modules Medusa gets", () => {
    expect(buildModules({}).map((m) => m.resolve)).toContain("@medusajs/medusa/notification")
  })
})
