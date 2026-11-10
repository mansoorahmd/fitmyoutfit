import { Text } from "@medusajs/ui"

/**
 * Shown by the product listings when there is nothing to list, for example
 * when the backend has no `garments` collection yet. Placeholder wording:
 * customer-facing copy is a founder decision.
 */
const EmptyProducts = () => {
  return (
    <div
      className="content-container py-12 text-center"
      data-testid="empty-products"
    >
      <Text className="text-ui-fg-subtle">No products yet.</Text>
    </div>
  )
}

export default EmptyProducts
