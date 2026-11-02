// Asked once per use, so a player's system setting is honoured by the 3D world
// as well as the CSS menus. Never throws: no window means no preference.
export function prefersCalm() {
  try {
    return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
