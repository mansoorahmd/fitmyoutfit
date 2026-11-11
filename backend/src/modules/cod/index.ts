import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import CashOnDeliveryProviderService from "./service"

/** Cash-on-delivery payment provider (provider id `pp_cod_cod`). See service.ts. */
export default ModuleProvider(Modules.PAYMENT, {
  services: [CashOnDeliveryProviderService],
})
