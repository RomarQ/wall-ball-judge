/**
 * The banner a verdict shows on the board: what it holds, and how it reads.
 */
import type { Flash } from './board';
import { decimal, t } from './i18n';

/** The banner's two lines: the rep or the no-rep, then why. */
export function flashText(flash: Flash): { title: string; detail: string } {
  const depth = t('overlay.depth')(decimal(Math.abs(flash.maxDepth), 1), flash.maxDepth >= 0);
  if (flash.valid) return { title: t('overlay.rep')(flash.count), detail: depth };
  if (flash.reason === 'target') {
    let detail = t('overlay.noHit');
    if (flash.target === 'lower') detail = t('overlay.hitWomens');
    else if (!flash.ballSeen) detail = t('overlay.ballNotSeen');
    return { title: t('overlay.noRep'), detail };
  }
  return { title: t('overlay.noRep'), detail: depth };
}
