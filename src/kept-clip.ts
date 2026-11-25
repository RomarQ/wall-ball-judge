/**
 * A picked clip, copied into the page's own storage at the pick.
 *
 * Brave on Android stops reading a picked file a few minutes after the pick.
 * Every later read of it fails then: the target search's second decoder, and
 * a seek of the board's video past what it holds. A copy in the origin's
 * private file system stays readable.
 */

/** The one clip copy the page keeps: each pick replaces the last. */
const NAME = 'picked-clip';

/** `file`, copied into the origin's private file system, or `file` itself when the browser cannot keep a copy, such as a clip too big for its storage. */
export async function keptClip(file: File): Promise<Blob> {
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(NAME, { create: true });
    await file.stream().pipeTo(await handle.createWritable());
    return new Blob([await handle.getFile()], { type: file.type });
  } catch {
    return file;
  }
}
