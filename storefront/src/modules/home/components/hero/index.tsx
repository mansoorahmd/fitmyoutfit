import { Button, Heading } from "@medusajs/ui"

import { homeContent } from "@content/home"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const Hero = () => {
  return (
    <div className="h-[75vh] w-full border-b border-ui-border-base relative bg-ui-bg-subtle">
      <div className="absolute inset-0 z-10 flex flex-col justify-center items-center text-center px-6 small:p-32 gap-6">
        <span className="flex flex-col gap-y-4 max-w-2xl">
          <Heading
            level="h1"
            className="text-3xl leading-10 text-ui-fg-base font-normal break-words"
          >
            {homeContent.headline}
          </Heading>
          <p className="text-base leading-6 text-ui-fg-subtle font-normal">
            {homeContent.subline}
          </p>
        </span>
        <LocalizedClientLink href={homeContent.button.href}>
          <Button variant="secondary">{homeContent.button.label}</Button>
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default Hero
