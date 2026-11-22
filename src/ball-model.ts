/**
 * The ball check's model in a revision of the trained detectors, at the input size the settings chose.
 *
 * A revision names its default ball model in `ball`, and in `balls` the ball models a person may choose from, each at
 * its own input size. The PWA and the Android app both take their ball model from here.
 */

/** A revision's ball models, as models/manifest.json lists them. */
export interface BallModels {
  files: Record<string, { input?: number }>;
  /** The ball model a revision runs when the settings choose none, or a size it does not offer. */
  ball: string;
  /** The ball models a person may choose from, `ball` among them; a revision without the list offers `ball` alone. */
  balls?: string[];
}

/** The input sizes `revision` offers for the ball check, in pixels, the smallest first. */
export function ballInputs(revision: BallModels): number[] {
  return (revision.balls ?? [revision.ball])
    .map((file) => revision.files[file]?.input)
    .filter((input) => input !== undefined)
    .sort((a, b) => a - b);
}

/** The file of the ball model in `revision` at `input` pixels, or the revision's default when it offers no such size. */
export function ballFileAt(revision: BallModels, input: number | null): string {
  return (revision.balls ?? []).find((file) => revision.files[file]?.input === input) ?? revision.ball;
}
