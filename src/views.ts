/**
 * The views of the app's page. The address picks the one that shows: the home
 * view with no hash, the judge board at `#judge`, the settings at `#settings`. A reload stays on its view, and Back
 * returns to the view before.
 */
import { $ } from './dom';
import { onLanguage, t } from './i18n';

export type View = 'home' | 'judge' | 'settings';

const TITLES = {
  home: 'title.home',
  judge: 'title.judge',
  settings: 'title.settings',
} as const satisfies Record<View, string>;

const NAMED: readonly View[] = ['judge', 'settings'];
const viewAt = (hash: string): View => NAMED.find((view) => hash === `#${view}`) ?? 'home';

let shown: View | null = null;
let changed: (view: View, from: View | null) => void = () => {};

function show(view: View): void {
  if (view === shown) return;
  const from = shown;
  shown = view;
  for (const name of Object.keys(TITLES)) $(name).hidden = name !== view;
  document.title = t(TITLES[view]);
  window.scrollTo(0, 0);
  // A view opened from another one takes the focus, so a keyboard or a screen reader starts at its top.
  if (from) $(view).querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  changed(view, from);
}

/** Shows `view` at once and puts it in the address. */
export function go(view: Exclude<View, 'home'>): void {
  location.hash = view;
  show(view);
}

/** Shows the view the address names, now and whenever the address changes. `onChange` hears each change. */
export function watchViews(onChange: (view: View, from: View | null) => void): void {
  changed = onChange;
  onLanguage(() => {
    if (shown) document.title = t(TITLES[shown]);
  });
  window.addEventListener('hashchange', () => show(viewAt(location.hash)));
  show(viewAt(location.hash));
}
