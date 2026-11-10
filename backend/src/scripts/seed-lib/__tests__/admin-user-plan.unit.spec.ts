import { devAdminAllowed, isNoop, planAdminUser } from "../admin-user-plan"

const none = { userId: null, authIdentityId: null, linkedUserId: null }

describe("planAdminUser", () => {
  it("creates user, login and link on an empty store", () => {
    expect(planAdminUser(none, "development")).toEqual({
      skip: null,
      createUser: true,
      createLogin: true,
      link: true,
    })
  })

  it("repairs a user that was created without its login (an interrupted seed)", () => {
    const plan = planAdminUser({ ...none, userId: "user_1" }, "development")
    expect(plan).toEqual({ skip: null, createUser: false, createLogin: true, link: true })
  })

  it("links a login that points at no user, or at another one", () => {
    expect(
      planAdminUser({ userId: "user_1", authIdentityId: "auth_1", linkedUserId: null }, undefined)
    ).toEqual({ skip: null, createUser: false, createLogin: false, link: true })
    expect(
      planAdminUser({ userId: "user_1", authIdentityId: "auth_1", linkedUserId: "user_old" }, "")
    ).toEqual({ skip: null, createUser: false, createLogin: false, link: true })
  })

  it("creates the user for a login whose user is gone, without a second login", () => {
    expect(
      planAdminUser({ userId: null, authIdentityId: "auth_1", linkedUserId: "user_gone" }, "test")
    ).toEqual({ skip: null, createUser: true, createLogin: false, link: true })
  })

  it("does nothing for a complete admin (so a changed password is kept)", () => {
    const plan = planAdminUser(
      { userId: "user_1", authIdentityId: "auth_1", linkedUserId: "user_1" },
      "development"
    )
    expect(isNoop(plan)).toBe(true)
  })

  it("never creates the dev admin when NODE_ENV is production", () => {
    expect(planAdminUser(none, "production")).toEqual({ skip: "production" })
    expect(planAdminUser(none, " production ")).toEqual({ skip: "production" })
    expect(devAdminAllowed("production")).toBe(false)
    expect(devAdminAllowed("development")).toBe(true)
    expect(devAdminAllowed(undefined)).toBe(true)
  })
})
