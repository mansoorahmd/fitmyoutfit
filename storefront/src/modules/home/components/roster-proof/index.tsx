import { clx } from "@medusajs/ui"
import Image from "next/image"

import { homeContent } from "@content/home"
import LineIcon from "@modules/home/components/line-icon"

/**
 * "The roster proof" (docs/design/03-direction.md, "Home page" 5): the
 * heading and three points, each a white tile with a tick. There is no
 * picture of a proof page yet, so the tiles carry the block: three across
 * from 768 px. With an image (data, optional) the points stack beside it
 * from 1024 px.
 */
const RosterProof = () => {
  const { title, points, image } = homeContent.rosterProof

  return (
    <section
      className="bg-brand-surface-alt"
      aria-labelledby="roster-proof-heading"
      data-testid="roster-proof"
    >
      <div
        className={clx(
          "content-container flex flex-col gap-6 py-12 md:gap-8 xl:py-24",
          image && "lg:grid lg:grid-cols-12 lg:items-center lg:gap-8"
        )}
      >
        <div className={clx("flex flex-col gap-6 md:gap-8", image && "lg:col-span-6")}>
          <h2 id="roster-proof-heading" className="type-h2 text-brand-ink">
            {title}
          </h2>
          <ul
            className={clx(
              "grid grid-cols-1 gap-4 md:gap-6",
              !image && "md:grid-cols-3"
            )}
          >
            {points.map((point) => (
              <li
                key={point}
                className="flex gap-3 rounded-card bg-brand-surface p-4 md:flex-col md:p-6"
                data-testid="roster-proof-point"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-inverse text-brand-on-inverse">
                  <LineIcon name="check" />
                </span>
                <p className="type-body-lg text-brand-ink">{point}</p>
              </li>
            ))}
          </ul>
        </div>
        {image && (
          <div
            className="relative aspect-[4/3] overflow-hidden rounded-card bg-brand-surface lg:col-span-6"
            data-testid="roster-proof-image"
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(min-width: 1024px) 600px, 100vw"
              className="object-contain"
            />
          </div>
        )}
      </div>
    </section>
  )
}

export default RosterProof
