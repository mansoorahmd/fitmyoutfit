# 008 M1 cart and checkout choices

11 Nov 2026 · coordinator. Choices taken while planning milestone M1, after the designer's page specification ([05-m1-pages.md](../design/05-m1-pages.md)). The founder asked the coordinator to take product and design decisions and report them; prices, payment terms and the wording of promises stay with the founders.

## Context

M1 makes ordering real: cart, checkout, cash on delivery in Pakistan, a minimum quantity in export regions, a delivery date and customer accounts. The specification raised five questions and ten gaps in the backend contract ([m1-checkout.md](../contracts/m1-checkout.md)).

## Decisions

1. **Money is shown with the currency code in every region:** "PKR 3,500", "GBP 22.00", "AED 95.00", "USD 28.00". One format for all four regions, and no "$" that could be read as another dollar.
2. **A phone number is required at checkout in every region.** Couriers call before delivery, and cash on delivery needs a number.
3. **Checkout is two short steps on one page:** contact and address, then delivery and payment with the order check and "Place order". Checkout never requires an account.
4. **The minimum quantity is always shown in the cart and at checkout,** because the backend refuses an order below it. On the product page it is shown behind a content switch that is on in development only, until the founders confirm the number.
5. **What counts toward the minimum:** garment pieces across the whole cart. The fit kit and the rush add-on do not count, and a fit kit can be bought alone in any region.
6. **"Tax not final" is shown in the cart and at checkout, not after the order is placed.** On the order confirmation and account pages the total is what the customer pays. The plan says to mark every price; the founder's instruction of 11 Nov to follow what ordinary retail stores on Shopify do, where the plan has no answer, decided it. The founder was told and can reverse it.
7. **Contract additions for the backend,** to be built after its first M1 task:
   - the promised delivery date is stored on the order when it is placed, so the confirmation and the account can show it;
   - the rules say which delivery date applies (standard or rush);
   - the storefront can tell the duty-paid shipping option from the store API;
   - completing the same cart twice returns the same order.
   - a cash-on-delivery payment is marked as collected in the admin against the order number, with the courier's slip reference kept on the order (founder, 11 Nov);
   - the cash-on-delivery limit is compared with the full order total, including delivery and tax (founder, 11 Nov: as ordinary Shopify stores do).
8. **Password reset is added to M1** as its own task. Without it a customer who forgets a password is locked out. It needs email sending, so in development the reset link goes to a local log; the real provider (decision 002) is wired when its account exists.
9. **Not in M1:** an order confirmation email, and linking a guest's earlier orders to a new account. Both come with the email work in M2.

## Alternatives rejected

- **Currency symbols for GBP and USD, codes for PKR and AED:** two formats to explain and test, and the dollar sign is ambiguous.
- **Phone optional, or required only in Pakistan and the UAE:** saves one field and costs failed deliveries.
- **One long checkout page:** the delivery step has one option per region, so separate steps add nothing, but address and payment on one screen is too long on a phone.
- **Hiding the minimum everywhere until confirmed:** a customer would be refused at the last step with no warning.

## Consequences

- The price helper changes once and every page follows, including the pages redesigned in M0.
- The founders have about 140 draft sentences to confirm before launch (section 11 of the specification); the ones about promises, payment and rules come first.
- The storefront is built against the contract while the backend is still in progress, so contract corrections from the backend may cause small rework.
