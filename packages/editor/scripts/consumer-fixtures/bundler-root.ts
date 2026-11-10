// Bundler-resolution check of the root entry (the React component), as in
// Vite or Next.js. Type-check only: it is never run.
import { DesignCanvas, createDesign } from "@fitmyoutfit/editor";
import type { DesignCanvasProps } from "@fitmyoutfit/editor";

export const component: (props: DesignCanvasProps) => unknown = DesignCanvas;
export const make = createDesign;
