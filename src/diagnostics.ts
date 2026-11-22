/**
 * What this browser can do. The home view reads it to say why the camera cannot run.
 */
import { t } from './i18n';

/** Why the camera cannot run on this page, in words for the person, or null when it can. */
export function cameraBlocker(): string | null {
  if (!window.isSecureContext) {
    return t('camera.notHttps');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return t('camera.none');
  }
  return null;
}
