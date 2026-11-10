const { MetadataStorage } = require("@medusajs/framework/mikro-orm/core")

MetadataStorage.clear()

// Defaults for the PostgreSQL server the integration tests use to create their temporary
// databases: the docker-compose one (host port 5433). CI overrides these with real env vars
// pointing at its service container. The tests never touch the `medusa` development database.
process.env.DB_HOST ??= "localhost"
process.env.DB_PORT ??= "5433"
process.env.DB_USERNAME ??= "medusa"
process.env.DB_PASSWORD ??= "medusa"
