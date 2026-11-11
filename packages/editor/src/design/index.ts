/**
 * Entry point `@fitmyoutfit/editor/design`: the design document format and
 * its plain functions. No React, no Three.js, no DOM. Safe on a server: the
 * backend can validate designs and run the same upload checks on the same bytes.
 */
export * from "./jersey-number-rules.js";
export * from "./jersey-number.js";
export * from "./schema.js";
export * from "./text.js";
export * from "./create.js";
export * from "./edit.js";
export * from "./validate.js";
export * from "./json-schema.js";
export * from "./svg-path.js";
export * from "./pattern.js";
export * from "./font-catalog.js";
export * from "./image-file.js";
export * from "./upload-checks.js";
