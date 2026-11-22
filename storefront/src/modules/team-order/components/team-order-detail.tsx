import Image from "next/image"

import { teamOrderContent } from "@content/team-order"
import { designOrderPath } from "@lib/editor/designer-context"
import type { TeamOrderView } from "@lib/team-order/types"
import { isDraft, scheduleSentence, statusWords } from "@lib/team-order/words"
import { ButtonLink } from "@modules/common/components/button"

import DeleteOrder from "./delete-order"
import ListSummary from "./list-summary"
import NeedByForm from "./need-by-form"
import RenameForm from "./rename-form"
import TeamOrderStatusChip from "./team-order-status"

const words = teamOrderContent.order

export type DetailProduct = {
  name: string
  /** The product's picture (the editor cannot give a picture of the design cheaply; see the note under it). */
  thumbnail: string | null
  /** The designer's handle, when the product has a designer. */
  designerHandle: string | null
}

/**
 * One team order (account/team-orders/[id]): the team name (rename while a draft), the product with its
 * picture, the status in plain words, the team list's state, the need-by date with what the backend says
 * about it, the button back into the designer, "Delete" for a draft, and in one line what comes next. The
 * proof is the next step and is not open: there is no button for it, so no dead button.
 */
export default function TeamOrderDetail({ order, product }: { order: TeamOrderView; product: DetailProduct }) {
  const draft = isDraft(order.status)
  const schedule = scheduleSentence(order.schedule)
  // the date changes while a draft or while the proof is out (contract section 2); fixed from the signature
  const dateEditable = order.status === "draft" || order.status === "proof_sent"

  return (
    <div className="flex flex-col gap-8" data-testid="team-order-page" data-status={order.status}>
      <header className="flex gap-4">
        {product.thumbnail && (
          <div className="flex shrink-0 flex-col gap-1">
            <span className="relative block h-[96px] w-[76px] overflow-hidden rounded-control bg-brand-surface-alt" data-testid="team-order-picture">
              <Image src={product.thumbnail} alt="" fill sizes="76px" quality={75} className="object-contain" />
            </span>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <RenameForm orderId={order.id} teamName={order.teamName} editable={draft} />
          <p className="type-body text-brand-ink-muted" dir="auto" data-testid="team-order-product">
            <bdi>{product.name}</bdi>
          </p>
          <TeamOrderStatusChip status={order.status} />
          <p className="type-small text-brand-ink-muted" data-testid="team-order-status-text">
            {statusWords(order.status).text}
          </p>
        </div>
      </header>
      {product.thumbnail && <p className="-mt-6 type-small text-brand-ink-muted">{words.pictureNote}</p>}

      <section className="flex flex-col gap-3" aria-labelledby="team-order-list-title">
        <h2 id="team-order-list-title" className="type-h2">
          {words.list.title}
        </h2>
        <ListSummary order={order} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="team-order-need-by-title">
        <h2 id="team-order-need-by-title" className="type-h2">
          {words.needBy.title}
        </h2>
        <NeedByForm
          key={`${order.needByDate ?? "none"}-${order.rushRequested}-${order.schedule.state}`}
          orderId={order.id}
          needByDate={order.needByDate}
          rushRequested={order.rushRequested}
          state={order.schedule.state}
          sentence={schedule?.text ?? null}
          editable={dateEditable}
        />
      </section>

      <section className="flex flex-col gap-4" aria-label={words.actions.edit}>
        {draft && (
          <p className="type-body" data-testid="team-order-next">
            {words.next.draft}
          </p>
        )}
        {product.designerHandle && (
          <ButtonLink
            href={designOrderPath(product.designerHandle, order.id)}
            fullWidth
            className="md:w-auto md:self-start"
            data-testid="team-order-edit"
          >
            {draft ? words.actions.edit : words.actions.view}
          </ButtonLink>
        )}
        {draft && (
          <div>
            <DeleteOrder orderId={order.id} />
          </div>
        )}
      </section>
    </div>
  )
}
