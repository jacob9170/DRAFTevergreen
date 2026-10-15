// panel.js — the side panel that opens when a plant is clicked.
// Shows the artist's story: when I found them, how long I've listened,
// their "obsession curve" across the decade, and their top songs (playable).

class InfoPanel {
  constructor(data, onPlayTrack, onClose) {
    this.data = data;
    this.onPlayTrack = onPlayTrack;
    this.el = document.getElementById("panel");
    this.nameEl = document.getElementById("panel-artist");
    this.statsEl = document.getElementById("panel-stats");
    this.nowEl = document.getElementById("panel-now");
    this.tracksEl = document.getElementById("panel-tracks");
    this.curve = document.getElementById("panel-curve");
    this.plant = null;
    this.lastWeek = -1;
    document.getElementById("panel-close").addEventListener("click", onClose);
  }

  open(plant) {
    this.plant = plant;
    const a = plant.artist;
    this.el.style.setProperty("--accent", `hsl(${plant.hue}, 70%, 70%)`);
    this.nameEl.textContent = a.name;
    this.statsEl.textContent =
      `First heard ${formatDate(a.firstPlay)} · ${a.hours} h over ${a.plays.toLocaleString()} plays · ` +
      `skipped ${Math.round(a.skipRate * 100)}% · ${Math.round(a.appleShare * 100)}% on Apple Music`;

    this.tracksEl.innerHTML = "";
    for (const t of a.topTracks) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.innerHTML = `<span class="play">▶</span><span class="title"></span><span class="count">${t.plays}×</span>`;
      btn.querySelector(".title").textContent = t.name;
      btn.addEventListener("click", () => this.onPlayTrack(t, plant));
      li.appendChild(btn);
      this.tracksEl.appendChild(li);
    }
    this.lastWeek = -1;
    this.el.classList.add("open");
  }

  close() {
    this.plant = null;
    this.el.classList.remove("open");
  }

  // Refresh the live parts (cheap, but only when the week actually changes).
  update(week) {
    if (!this.plant || Math.floor(week) === this.lastWeek) return;
    this.lastWeek = Math.floor(week);
    const p = this.plant;
    const state = p.bloom > 0.6 ? "in full bloom" : p.bloom > 0.25 ? "growing" : p.cumHours > 3 ? "wilting" : "a seedling";
    this.nowEl.textContent = week < p.artist.firstWeek
      ? `Not discovered yet in ${formatMonthYear(this.data.dateOfWeek(week))}.`
      : `${formatMonthYear(this.data.dateOfWeek(week))}: ${p.cumHours.toFixed(1)} h so far — ${state}.`;
    this.drawCurve(week);
  }

  // Weekly listening for this artist across all ten years, with the playhead.
  drawCurve(week) {
    const ctx = this.curve.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = this.curve.clientWidth, h = this.curve.clientHeight;
    if (this.curve.width !== w * dpr) { this.curve.width = w * dpr; this.curve.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const weekly = this.plant.artist.weekly;
    const max = Math.max(...weekly, 1);
    const bw = w / weekly.length;
    for (let i = 0; i < weekly.length; i++) {
      if (!weekly[i]) continue;
      const bh = Math.sqrt(weekly[i] / max) * (h - 4);
      ctx.fillStyle = i <= week ? `hsl(${this.plant.hue}, 70%, 68%)` : "rgba(255,255,255,0.25)";
      ctx.fillRect(i * bw, h - bh, Math.max(1, bw), bh);
    }
    ctx.fillStyle = "#ffd75e";
    ctx.fillRect(week * bw, 0, 1.5, h);
  }
}
