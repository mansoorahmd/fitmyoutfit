const { MetadataStorage } = require("@medusajs/framework/mikro-orm/core")

MetadataStorage.clear()

// Defaults for the PostgreSQL server the integration tests use to create their temporary
// databases: the docker-compose one (host port 5433). CI overrides these with real env vars
// pointing at its service container. The tests never touch the `medusa` development database.
process.env.DB_HOST ??= "localhost"
process.env.DB_PORT ??= "5433"
process.env.DB_USERNAME ??= "medusa"
process.env.DB_PASSWORD ??= "medusa"

// Each test file's backend listens on a free port of its own, whatever PORT says in backend/.env
// or the shell: Medusa's test runner uses PORT when it is set, so the tests failed with
// EADDRINUSE while a dev backend held that port. The port is chosen here, by the operating system
// (listen on port 0), because the runner loads backend/.env again (through medusa-config.ts) just
// before it reads PORT: an unset or empty PORT is filled in from the file then, a set one is kept.
// (setupFiles cannot wait for a promise, hence the short child process.)
const { execFileSync } = require("node:child_process")
process.env.PORT = execFileSync(process.execPath, [
  "-e",
  "const s = require('net').createServer(); s.listen(0, () => { process.stdout.write(String(s.address().port)); s.close() })",
])
  .toString()
  .trim()
