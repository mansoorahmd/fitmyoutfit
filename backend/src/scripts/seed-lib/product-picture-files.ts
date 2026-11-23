/**
 * Reads our own product picture files (packages/editor/samples/pictures/products/) for the seed.
 * Only reads: the seed uploads them through Medusa's File Module, never by writing into a folder.
 * A backend deployed without `packages/` finds none of them; the caller then warns and goes on.
 */
import { readFile } from "node:fs/promises"
import path from "node:path"

const PICTURES_DIR = ["packages", "editor", "samples", "pictures", "products"]

/**
 * Where the pictures may be, from the directory the backend runs in: `backend/` (development,
 * tests, `medusa exec`) or `backend/.medusa/server/` (after `medusa build`), both inside the repo.
 */
export function pictureDirectories(cwd: string = process.cwd()): string[] {
  return [path.resolve(cwd, "..", ...PICTURES_DIR), path.resolve(cwd, "..", "..", "..", ...PICTURES_DIR)]
}

export type PictureFiles = {
  /** File name to content. */
  found: Map<string, Buffer>
  /** Names that could not be read, in the order asked. */
  unreadable: string[]
}

export async function readPictureFiles(
  names: readonly string[],
  directories: readonly string[] = pictureDirectories()
): Promise<PictureFiles> {
  const found = new Map<string, Buffer>()
  const unreadable: string[] = []
  for (const name of names) {
    let content: Buffer | undefined
    for (const directory of directories) {
      try {
        content = await readFile(path.join(directory, name))
        break
      } catch {
        // try the next place
      }
    }
    if (content && content.length > 0) {
      found.set(name, content)
    } else {
      unreadable.push(name)
    }
  }
  return { found, unreadable }
}

/** The MIME type of a picture file, from its extension. */
export function pictureMimeType(file: string): string {
  const extension = path.extname(file).toLowerCase()
  if (extension === ".png") return "image/png"
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg"
  return "image/webp"
}
