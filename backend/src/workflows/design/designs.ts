/**
 * Saved designs, as the store routes use them: Medusa glue around the design module. The rules
 * (what a version may hold) are in lib/rules/design-input.ts. A customer sees and changes only
 * their own designs; another customer's design is "not found", never "forbidden".
 *
 * Nothing is ever overwritten: a save adds a version.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { badRequest, notFound } from "../../lib/http/refusal"
import { checkDesignJson, readDesignName } from "../../lib/rules/design-input"
import { DESIGN_MODULE } from "../../modules/design/constants"
import type DesignModuleService from "../../modules/design/service"

export type DesignRow = { id: string; customer_id: string; name: string; created_at: Date | string }
export type VersionRow = {
  id: string
  design_id: string
  version: number
  product_id: string
  schema_version: number
  data: Record<string, unknown>
  created_at: Date | string
}

const service = (container: MedusaContainer) => container.resolve<DesignModuleService>(DESIGN_MODULE)

/** What a route answers for a design. */
export function designToApi(design: DesignRow, latest?: Omit<VersionRow, "data"> | null) {
  return {
    id: design.id,
    name: design.name,
    created_at: design.created_at,
    latest_version: latest ? latest.version : null,
    product_id: latest ? latest.product_id : null,
  }
}

/** What a route answers for a version; `data` only when `withDesign` (a version's own route). */
export function versionToApi(version: VersionRow, withDesign: boolean) {
  const { data, ...rest } = version
  return {
    id: rest.id,
    design_id: rest.design_id,
    version: rest.version,
    product_id: rest.product_id,
    schema_version: rest.schema_version,
    created_at: rest.created_at,
    ...(withDesign ? { design: data } : {}),
  }
}

/** The design, if it is the customer's own; else throws not found. */
export async function loadOwnDesign(container: MedusaContainer, customerId: string, designId: string): Promise<DesignRow> {
  const found = (await service(container).listDesigns({ id: designId, customer_id: customerId })) as DesignRow[]
  if (found.length === 0) {
    throw notFound("design_not_found", `Design ${designId} was not found.`)
  }
  return found[0]!
}

/** The Medusa product must exist and be a garment (the fit kit and rush are not designed). */
async function assertProduct(container: MedusaContainer, productId: unknown): Promise<string> {
  if (typeof productId !== "string" || productId === "") {
    throw badRequest("product_id_required", "`product_id` must be the id of a product.")
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: ["id", "metadata"], filters: { id: productId } })
  const product = (data as unknown as { id: string; metadata?: Record<string, unknown> | null }[])[0]
  if (!product) {
    throw badRequest("product_not_found", `Product ${productId} was not found.`)
  }
  const kind = product.metadata?.kind
  if (kind === "fit_kit" || kind === "rush_add_on") {
    throw badRequest("product_not_designable", `Product ${productId} is not a garment that can be designed.`)
  }
  return product.id
}

function checkedDesign(input: unknown) {
  const checked = checkDesignJson(input)
  if (!checked.ok) {
    throw badRequest(checked.code, checked.message)
  }
  return checked.schemaVersion
}

/** The most recent versions of the designs, without their JSON (one per design, the highest number). */
async function latestVersions(container: MedusaContainer, designIds: string[]): Promise<Map<string, Omit<VersionRow, "data">>> {
  const latest = new Map<string, Omit<VersionRow, "data">>()
  if (designIds.length === 0) return latest
  const rows = (await service(container).listDesignVersions(
    { design_id: designIds },
    { select: ["id", "design_id", "version", "product_id", "schema_version", "created_at"], order: { version: "ASC" } }
  )) as Omit<VersionRow, "data">[]
  for (const row of rows) latest.set(row.design_id, row)
  return latest
}

function isUniqueViolation(error: unknown): boolean {
  // Medusa turns the database's unique violation into a MedusaError of type "duplicate_error".
  const e = error as { code?: unknown; type?: unknown; message?: unknown; name?: unknown } | null
  return (
    e?.type === "duplicate_error" ||
    e?.code === "23505" ||
    e?.name === "UniqueConstraintViolationException" ||
    /unique|already exists/i.test(String(e?.message ?? ""))
  )
}

/** Adds the next version of a design. Two saves at the same moment get consecutive numbers. */
async function insertVersion(
  container: MedusaContainer,
  designId: string,
  productId: string,
  design: Record<string, unknown>,
  schemaVersion: number
): Promise<VersionRow> {
  const svc = service(container)
  for (let attempt = 0; ; attempt += 1) {
    const [last] = (await svc.listDesignVersions(
      { design_id: designId },
      { select: ["version"], order: { version: "DESC" }, take: 1 }
    )) as { version: number }[]
    try {
      return (await svc.createDesignVersions({
        design_id: designId,
        version: (last?.version ?? 0) + 1,
        product_id: productId,
        schema_version: schemaVersion,
        data: design,
      })) as VersionRow
    } catch (error) {
      if (attempt >= 5 || !isUniqueViolation(error)) throw error
    }
  }
}

export async function createDesign(
  container: MedusaContainer,
  customerId: string,
  body: { name?: unknown; product_id?: unknown; design?: unknown }
) {
  const name = body.name === undefined ? "Untitled design" : readDesignName(body.name)
  if (name === null) {
    throw badRequest("design_name_invalid", "`name` must be text of 1 to 100 characters.")
  }
  const schemaVersion = checkedDesign(body.design)
  const productId = await assertProduct(container, body.product_id)
  const design = (await service(container).createDesigns({ customer_id: customerId, name })) as DesignRow
  const version = await insertVersion(container, design.id, productId, body.design as Record<string, unknown>, schemaVersion)
  return { design: designToApi(design, version), version: versionToApi(version, false) }
}

export async function addDesignVersion(
  container: MedusaContainer,
  customerId: string,
  designId: string,
  body: { product_id?: unknown; design?: unknown }
) {
  const design = await loadOwnDesign(container, customerId, designId)
  const schemaVersion = checkedDesign(body.design)
  let productId: string
  if (body.product_id === undefined) {
    const last = (await latestVersions(container, [design.id])).get(design.id)
    if (!last) throw badRequest("product_id_required", "`product_id` must be the id of a product.")
    productId = last.product_id
  } else {
    productId = await assertProduct(container, body.product_id)
  }
  const version = await insertVersion(container, design.id, productId, body.design as Record<string, unknown>, schemaVersion)
  return { design: designToApi(design, version), version: versionToApi(version, false) }
}

export async function listOwnDesigns(container: MedusaContainer, customerId: string) {
  const designs = (await service(container).listDesigns(
    { customer_id: customerId },
    { order: { created_at: "DESC" } }
  )) as DesignRow[]
  const latest = await latestVersions(container, designs.map((d) => d.id))
  return designs.map((d) => designToApi(d, latest.get(d.id) ?? null))
}

export async function readOwnDesign(container: MedusaContainer, customerId: string, designId: string) {
  const design = await loadOwnDesign(container, customerId, designId)
  const versions = (await service(container).listDesignVersions(
    { design_id: design.id },
    { select: ["id", "design_id", "version", "product_id", "schema_version", "created_at"], order: { version: "ASC" } }
  )) as Omit<VersionRow, "data">[]
  const latest = versions[versions.length - 1] ?? null
  return {
    design: designToApi(design, latest),
    versions: versions.map((v) => versionToApi({ ...v, data: {} }, false)),
  }
}

export async function readOwnVersion(container: MedusaContainer, customerId: string, designId: string, versionNumber: string) {
  const design = await loadOwnDesign(container, customerId, designId)
  const number = /^[1-9]\d{0,8}$/u.test(versionNumber) ? Number(versionNumber) : null
  const found =
    number === null
      ? []
      : ((await service(container).listDesignVersions({ design_id: design.id, version: number })) as VersionRow[])
  if (found.length === 0) {
    throw notFound("design_version_not_found", `Version ${versionNumber} of design ${designId} was not found.`)
  }
  return { version: versionToApi(found[0]!, true) }
}

/**
 * A design version of the customer's own, with its JSON: for a team order. Throws not found for
 * anything else (another customer's version included).
 */
export async function loadOwnVersionById(
  container: MedusaContainer,
  customerId: string,
  versionId: unknown
): Promise<VersionRow> {
  if (typeof versionId !== "string" || versionId === "") {
    throw badRequest("design_version_id_required", "`design_version_id` must be the id of a design version.")
  }
  const [version] = (await service(container).listDesignVersions({ id: versionId })) as VersionRow[]
  if (version) {
    const owned = (await service(container).listDesigns({ id: version.design_id, customer_id: customerId })) as DesignRow[]
    if (owned.length > 0) return version
  }
  throw notFound("design_version_not_found", `Design version ${versionId} was not found.`)
}
