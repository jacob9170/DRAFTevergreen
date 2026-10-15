// garden.js — owns all plants, the scenery (sky, sun, hills, ground) and
// the falling-petal particles. Plants are "planted" left -> right in the
// order I discovered each artist.

const seasonKeys = [
  // Southern hemisphere (Sydney): January is summer, July is winter.
  { sky: "#3d72b8", horizon: "#ffd3a1", ground: "#8fae5c" }, // Jan  summer
  { sky: "#4b5d8c", horizon: "#f0b67c", ground: "#a39556" }, // Apr  autumn
  { sky: "#2c3652", horizon: "#aab5c9", ground: "#6c7d66" }, // Jul  winter
  { sky: "#5a8fd5", horizon: "#ffe6bd", ground: "#86b65e" }, // Oct  spring
];
const maxParticles = 500;
const hitRadius = 14;      // px: how close the cursor must be to a branch to pick that plant
const hoverStickiness = 5; // px: another plant must be this much closer to steal the hover

class Garden {
  constructor(data) {
    this.data = data;
    this.plants = data.artists.map((a) => new Plant(a, data));
    this.particles = [];
    this.hovered = null;
    this.selected = null;
    this.assignPlantingSpots();
  }

  // Normalised (0..1) positions: x = discovery order, y = random depth.
  assignPlantingSpots() {
    const order = [...this.plants].sort((a, b) => a.artist.firstWeek - b.artist.firstWeek); //sorts plants by th first listening date
    order.forEach((p, i) => {
      const rng = mulberry32(p.seed ^ 0x9e3779b9);
      p.nx = (i + 0.5 + (rng() - 0.5) * 0.8) / order.length;
      p.ny = rng();
    });
  }

  // Convert to pixels for the current window size, then nudge plants apart.
  layout() {
    this.horizonY = height * 0.46;
    this.groundBottom = height - timelineHeight - 26;
    const sizeFactor = Math.min(1.2, Math.max(0.6, height / 850));
    for (const p of this.plants) {
      p.x = lerp(60, width - 60, p.nx);
      p.y = lerp(this.horizonY + 50, this.groundBottom, p.ny);
      p.scale = lerp(0.6, 1.15, p.ny) * sizeFactor; // further away = smaller
    }
    this.relax();
    this.drawOrder = [...this.plants].sort((a, b) => a.y - b.y); // back to front
  }

  // Simple overlap relaxation: push plants that are too close apart horizontally.
  relax() {
    for (let iter = 0; iter < 60; iter++) {
      for (let i = 0; i < this.plants.length; i++) {
        for (let j = i + 1; j < this.plants.length; j++) {
          const a = this.plants[i], b = this.plants[j];
          const minDist = 34 * (a.scale + b.scale);
          const dx = a.x - b.x, dy = (a.y - b.y) * 1.6;
          const d = Math.hypot(dx, dy);
          if (d < minDist && d > 0) {
            const push = ((minDist - d) / 2) * (dx >= 0 ? 1 : -1) * 0.5;
            a.x = constrain(a.x + push, 40, width - 40);
            b.x = constrain(b.x - push, 40, width - 40);
          }
        }
      }
    }
  }

  update(week, mx, my) {
    for (const p of this.plants) {
      const fading = p.update(week);
      // Fading plants shed petals — the more it faded this frame, the more likely.
      if (p.visible && fading > 0 && Math.random() < fading * 600) this.dropPetal(p);//if the plant exists, if its fading (losing bloom) and math.random < fading * 600 then it fades
    }
    this.updateHover(mx, my); //updating mouse

    for (const pt of this.particles) { //petal physics
      pt.vy += 0.03; //vertical speed increases by 0.03 (gravity)
      pt.vx += (noise(pt.x * 0.01, frameCount * 0.01) - 0.5) * 0.4; //perlin noise. random but smooth so it looks like a nice breezez and not a shake
      pt.x += pt.vx;
      pt.y = Math.min(pt.y + pt.vy, pt.floor); //so it doesnt fall through ground
      pt.rot += pt.spin; //so it spinnnnssss
      if (pt.y >= pt.floor) { pt.vx *= 0.8; pt.spin *= 0.8; } //once its on the ground (floor) slow it down by 80%, each frame which makes it look like friction
      pt.life -= pt.y >= pt.floor ? 0.012 : 0.003;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0); //deletes the dead ones. dead ones are determined by the line above which starts at 1 and goes down to 0 once its at 0 its no longer alive :(
  }

  // Sticky hover: branches sway, so only switch to another plant when it is
  // clearly closer. Stops the highlight flickering between two neighbours.
  updateHover(mx, my) {
    const candidate = this.plantAt(mx, my); //whatever plant is closest to mouse
    const current = this.hovered;
    if (current && candidate !== current) { //if something was already highlighted, and now a different plant is closest then do this
      const currentDist = current.visible ? current.distanceTo(mx, my) : Infinity; //if the old plant is already far away from the moust then treat it as infinetely far away
      if (currentDist < hitRadius && candidate.distanceTo(mx, my) > currentDist - hoverStickiness) return; //this is opposite where if the mouse is still near the old plant and the new one isnt at least 5 px closer then stop here and keep the old one
    }
    this.hovered = candidate; //otherwise just swap to the new plant
  }

  // The plant whose branches are closest to the cursor wins, so a small plant
  // behind a big tree is still clickable wherever its own branches show.
  // This was initially a problem as i would try to click smaller plants behind the bigger ones and they wouldnt come up.
  plantAt(mx, my) {
    let best = null; //start with no tree
    let bestDist = hitRadius;
    for (const p of this.plants) {
      if (!p.visible) continue; //just if the plant isnt visible next, then go to the next one
      const d = p.distanceTo(mx, my);
      if (d < bestDist) { best = p; bestDist = d; } //for each plant measure the mouses' distance to its nearest branch. if it beats the record it becomes the new winner. at the end, give it back the winner or null if nothing wasclose
    } //literally just means keep the closest/best plant so far and update it whenever it finds something better
    return best;
  }

  dropPetal(p, upward = false) {
    if (this.particles.length >= maxParticles) return;
    this.particles.push({
      x: p.x + (Math.random() - 0.5) * p.height * 0.6,
      y: p.y - p.height * (0.5 + Math.random() * 0.5),
      vx: (Math.random() - 0.5) * (upward ? 3 : 0.6),
      vy: upward ? -2 - Math.random() * 3 : 0,
      floor: p.y + Math.random() * 12,
      rot: Math.random() * TWO_PI,
      spin: (Math.random() - 0.5) * 0.15,
      hue: p.hue,
      size: (3 + Math.random() * 3) * p.scale,
      life: 1,
    });
  }

  // An "obsession day": the plant flares up and throws petals into the air.
  celebrate(artistName) {
    const p = this.plants.find((pl) => pl.artist.name === artistName);
    if (!p) return null;
    p.burst = 1;
    for (let i = 0; i < 90; i++) this.dropPetal(p, true);
    return p;
  }

  //drawing
  seasonColors(date) {
    const pos = ((date.getMonth() + date.getDate() / 31) / 3) % 4; // 0..4 across the 4 keys
    const i = Math.floor(pos);
    const a = seasonKeys[i], b = seasonKeys[(i + 1) % 4], t = pos - i;
    const mix = (k) => lerpColor(color(a[k]), color(b[k]), t);
    return { sky: mix("sky"), horizon: mix("horizon"), ground: mix("ground") };
  }

  drawScenery(week) {
    const c = this.seasonColors(this.data.dateOfWeek(week));
    const ctx = drawingContext;

    // Sky gradient
    let g = ctx.createLinearGradient(0, 0, 0, this.horizonY);
    g.addColorStop(0, c.sky.toString());
    g.addColorStop(1, c.horizon.toString());
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, this.horizonY + 2);

    // Sun: brighter and bigger in weeks where I listened to more music overall.
    const intensity = this.data.sample(this.data.listeningIntensity, week);
    const sx = width * 0.8, sy = this.horizonY - 70;
    const r = 26 + 70 * intensity;
    g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.4);
    g.addColorStop(0, `rgba(255,244,214,${0.55 + 0.4 * intensity})`);
    g.addColorStop(0.35, `rgba(255,214,150,${0.25 * intensity + 0.1})`);
    g.addColorStop(1, "rgba(255,214,150,0)");
    ctx.fillStyle = g;
    ctx.fillRect(sx - r * 2.5, sy - r * 2.5, r * 5, r * 5);
    noStroke();
    fill(45, 20, 100);
    circle(sx, sy, r * 0.55);

    // Two layers of distant hills (Perlin noise, static shape).
    this.drawHills(c, 0.55, 0.004, 60, 1);
    this.drawHills(c, 0.3, 0.007, 30, 2);

    // Ground gradient
    g = ctx.createLinearGradient(0, this.horizonY, 0, height);
    g.addColorStop(0, c.ground.toString());
    g.addColorStop(1, lerpColor(c.ground, color(20, 30, 15), 0.75).toString());
    ctx.fillStyle = g;
    ctx.fillRect(0, this.horizonY, width, height - this.horizonY);
  }

  drawHills(c, mixToSky, freq, amp, layer) {
    noStroke();
    fill(lerpColor(c.ground, c.horizon, mixToSky));
    beginShape();
    vertex(0, this.horizonY + 1);
    for (let x = 0; x <= width; x += 20) {
      vertex(x, this.horizonY - noise(x * freq, layer * 10) * amp - 5);
    }
    vertex(width, this.horizonY + 1);
    endShape(CLOSE);
  }

  drawPlants() {
    for (const p of this.drawOrder) p.draw(p === this.hovered, p === this.selected);
  }

  drawParticles() {
    noStroke();
    for (const pt of this.particles) {
      push();
      translate(pt.x, pt.y);
      rotate(pt.rot);
      fill(pt.hue, 55, 95, pt.life);
      ellipse(0, 0, pt.size, pt.size * 0.6);
      pop();
    }
  }

  // Names: always for the 5 most "alive" plants, plus the hovered one.
  drawLabels() {
    const alive = this.plants
      .filter((p) => p.visible)
      .sort((a, b) => b.bloom * b.growth - a.bloom * a.growth)
      .slice(0, 5);
    const labelled = new Set(alive);
    if (this.hovered) labelled.add(this.hovered);
    textAlign(CENTER, TOP);
    textSize(12);
    for (const p of labelled) {
      const strong = p === this.hovered || p === this.selected;
      fill(0, 0, 100, strong ? 1 : 0.75);
      stroke(0, 0, 0, 0.35);
      strokeWeight(3);
      text(p.artist.name, p.x, p.y + 8);
    }
    noStroke();
  }
}
