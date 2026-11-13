// Whether this player should show a "?" to others (typing, paused, or not in the window).
export function computeAway({ chatOpen, pauseOpen, hidden, focused }) {
  return !!(chatOpen || pauseOpen || hidden || !focused);
}
