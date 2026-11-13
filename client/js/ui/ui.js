// Minimal UI glue: loading screen visibility and debug overlay stat updates.
export class UI {
  constructor() {
    this.loadingScreen = document.getElementById('loading-screen');
    this.loadingStatus = document.getElementById('loading-status');
    this.statFps = document.getElementById('stat-fps');
    this.statPing = document.getElementById('stat-ping');
    this.statPlayers = document.getElementById('stat-players');
    this.statStatus = document.getElementById('stat-status');
    this.statPos = document.getElementById('stat-pos');
    this.overlay = document.getElementById('debug-overlay');
  }

  // Returns true when the stats overlay is now visible.
  toggleStats() {
    return !this.overlay.classList.toggle('ui-hidden');
  }

  setLoadingText(text) {
    if (this.loadingStatus) this.loadingStatus.textContent = text;
  }

  hideLoadingScreen() {
    this.loadingScreen?.classList.add('hidden');
  }

  updateStats({ fps, ping, playerCount, status, pos }) {
    if (pos !== undefined && this.statPos.textContent !== pos) this.statPos.textContent = pos;
    if (fps !== undefined) this.statFps.textContent = fps;
    if (ping !== undefined) this.statPing.textContent = ping;
    if (playerCount !== undefined) this.statPlayers.textContent = playerCount;
    if (status !== undefined) this.statStatus.textContent = status;
  }
}
