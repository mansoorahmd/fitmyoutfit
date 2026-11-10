import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
// Booting the app and migrating a fresh database can take minutes on a busy machine.
jest.setTimeout(300 * 1000)

medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ api }) => {
    describe("Ping", () => {
      it("ping the server health endpoint", async () => {
        const response = await api.get('/health')
        expect(response.status).toEqual(200)
      })
    })
  },
})