import type { Session } from './session';

declare global {
  /** The version this build was compiled with, injected by vite. */
  const __APP_VERSION__: string;

  interface Window {
    /** The running session, for tuning from the browser console. */
    session?: Session;
  }
}

export {};
