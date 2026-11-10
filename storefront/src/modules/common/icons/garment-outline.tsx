/**
 * A plain T-shirt outline, shown where a garment has no photo (the product
 * card's placeholder). Decorative; it takes the text colour.
 */
const GarmentOutline = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    className={className}
    data-testid="garment-outline"
  >
    <path d="M24 8l-14 6-6 14 9 4 3-6v30h32V26l3 6 9-4-6-14-14-6c-1 4-4 6-8 6s-7-2-8-6z" />
  </svg>
)

export default GarmentOutline
