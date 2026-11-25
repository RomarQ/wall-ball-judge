/** The addresses that both apps' home screens open. No DOM. */
import manifest from '../models/manifest.json';

export const LINKS = {
  contact: 'mailto:rodrigo_quelhas@outlook.pt',
  github: 'https://github.com/RomarQ/wall-ball-judge',
  huggingFace: `https://huggingface.co/${manifest.repo}`,
} as const;

/** The site that serves the PWA. */
export const SITE = 'https://wallballs.app';

/** The how-to video that both apps' home screens offer: its path on the site, and its length as a player shows it. */
export const HOW_TO = { path: '/media/how-to-en.mp4', length: '1:47' } as const;
