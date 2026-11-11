/**
 * Loads a page afresh, after signing in or out: every server-rendered part
 * (the header's account link and cart count, the cart, the checkout) then
 * shows the new customer, with nothing kept from before.
 */
export const loadPage = (href: string) => {
  window.location.assign(href)
}
