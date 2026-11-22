/** The addresses of the home footer's links, which both apps show. No DOM. */
import manifest from '../models/manifest.json';

export const LINKS = {
  contact: 'mailto:rodrigo_quelhas@outlook.pt',
  github: 'https://github.com/RomarQ/wall-ball-judge',
  huggingFace: `https://huggingface.co/${manifest.repo}`,
} as const;
