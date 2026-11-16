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
  it.each([undefined, "", "development", "test", " Development ", "TEST"])(
    "yes in development and test (NODE_ENV=%j)",
    (NODE_ENV) => {
      expect(emailDelivery({ NODE_ENV })).toBe("log")
      expect(mayLogResetLink({ NODE_ENV })).toBe(true)
    }
  )

  it.each(["production", "prod", "PRODUCTION", "staging", "qa", "developmen"])(
    "never anywhere else (NODE_ENV=%j)",
    (NODE_ENV) => {
      expect(emailDelivery({ NODE_ENV })).toBe("none")
      expect(mayLogResetLink({ NODE_ENV })).toBe(false)
    }
  )

  it("does not change its answer for settings that look like an email provider", () => {
    expect(mayLogResetLink({ NODE_ENV: "production", RESEND_API_KEY: "re_123" })).toBe(false)
  })
})

describe("buildNotificationModules", () => {
  it("gives the local provider the email channel in development and test", () => {
    expect(EMAIL_CHANNEL).toBe("email")
    for (const NODE_ENV of [undefined, "development", "test"]) {
      expect(channelsOf({ NODE_ENV })).toEqual(["feed", "email"])
    }
  })

  it("keeps the email channel away from the local provider (the log) everywhere else", () => {
    for (const NODE_ENV of ["production", "prod", "staging"]) {
      expect(channelsOf({ NODE_ENV })).toEqual(["feed"])
    }
  })

  it("is part of the modules Medusa gets", () => {
    expect(buildModules({}).map((m) => m.resolve)).toContain("@medusajs/medusa/notification")
  })
})
