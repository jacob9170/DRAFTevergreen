// plant.js — one artist = one plant.
//
// The plant's shape (branching angles, species, colour) is generated once from a
// seed made from the artist's name. Its state changes every frame from the data:
//   growth (total listening)   -> how many branch levels exist and how long they are
//   bloom  (recent listening)  -> flowers open at the branch tips
//   wilt   (loved, then left)  -> branches droop, leaves dry out, petals fall

const maxDepth = 6;
const pentatonic = [0, 3, 5, 7, 10]; // minor pentatonic: any mix of notes sounds calm

// Three growth habits. My most-listened artists become trees.
const species = {
  tree:       { spread: 0.42, extraBranchChance: 0.35, lenFactor: 0.74, weight: 7.0, flower: 0.8, octave: 0 },
  shrub:      { spread: 0.85, extraBranchChance: 0.45, lenFactor: 0.66, weight: 3.5, flower: 1.0, octave: 1 },
  wildflower: { spread: 0.30, extraBranchChance: 0.10, lenFactor: 0.82, weight: 2.0, flower: 1.7, octave: 2 },
};

class Plant {
  constructor(artist, data) {
    this.artist = artist;
    this.data = data;
    this.seed = hashString(artist.name);
    const rng = mulberry32(this.seed);

    this.species = artist.rank < 6 ? species.tree : rng() < 0.5 ? species.shrub : species.wildflower;
    this.hue = Math.floor(rng() * 360);
    this.petals = 5 + Math.floor(rng() * 3);
    this.lean = rng() < 0.5 ? -1 : 1;              // which way it droops when wilting
    this.note = pentatonic[this.seed % 5] + 12 * this.species.octave;
    this.root = this.buildBranch(rng, 0);

    // Layout (set by Garden.layout)
    this.nx = 0; this.ny = 0; this.x = 0; this.y = 0; this.scale = 1;

    // Live state (set by update)
    this.growth = 0; this.bloom = 0; this.wilt = 0; this.burst = 0;
    this.cumHours = 0;
    this.height = 0;
    this.visible = false;
    this.segments = [];      // on-screen branch lines from the last frame (hit-testing)
  }

  // Recursively build the branching skeleton once (angles + children).
  buildBranch(rng, depth) {
    const node = { angle: 0, children: [] };
    if (depth >= maxDepth) return node;
    const sp = this.species;
    const count = rng() < sp.extraBranchChance ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const child = this.buildBranch(rng, depth + 1);
      const side = count === 1 ? 0 : i / (count - 1) - 0.5; // -0.5 .. 0.5
      child.angle = side * sp.spread * 2 + (rng() - 0.5) * 0.35;
      node.children.push(child);
    }
    return node;
  }

  // Read this artist's state at a (fractional) week.
  update(week) {
    const a = this.artist;
    const prevBloom = this.bloom;
    this.cumHours = this.data.sample(a.cumHours, week);
    this.visible = week >= a.firstWeek;

    // sqrt-ish curve so a 20h artist is still visible next to a 170h one
    this.growth = Math.pow(this.cumHours / this.data.maxCumHours, 0.45);
    this.bloom = this.data.sample(a.vitality, week);
    // Wilting = once loved (has history) but not listened to lately.
    this.wilt = (1 - this.bloom) * Math.min(1, this.cumHours / 3);
    this.burst *= 0.97;

    this.depthGrowth = 1 + this.growth * (maxDepth - 1);
    this.baseLen = (14 + this.growth * 95) * this.scale;
    this.height = this.estimateHeight();
    return prevBloom - this.bloom; // >0 means fading (garden drops petals)
  }

  estimateHeight() {
    let h = 0, len = this.baseLen;
    for (let d = 0; d < this.depthGrowth; d++) {
      h += len * Math.min(1, this.depthGrowth - d);
      len *= this.species.lenFactor;
    }
    return h;
  }

  // Precise hit test: distance (px) from the mouse to the nearest branch this
  // plant actually drew last frame. Lets you click a small plant peeking out
  // from behind a big tree, instead of the tree's bounding box swallowing it.
  distanceTo(mx, my) {
    let best = Infinity;
    for (const [x1, y1, x2, y2] of this.segments) {
      best = Math.min(best, distToSegment(mx, my, x1, y1, x2, y2));
    }
    return best;
  }

  // Where the current drawing origin is on screen (after all rotate/translate).
  screenPoint() {
    const m = drawingContext.getTransform();
    const pd = pixelDensity();
    return [m.e / pd, m.f / pd];
  }

  draw(isHovered, isSelected) {
    this.segments = [];
    if (!this.visible) return;
    push();
    translate(this.x, this.y);

    // Soft glow under the plant when hovered / selected / bursting.
    const glow = Math.max(isHovered ? 0.5 : 0, isSelected ? 0.8 : 0, this.burst);
    if (glow > 0.02) {
      noStroke();
      fill(this.hue, 50, 100, 0.25 * glow);
      ellipse(0, -this.height * 0.5, this.height * 1.1 + 30, this.height * 1.2 + 30);
    }

    // Ground shadow
    noStroke();
    fill(0, 0, 0, 0.12);
    ellipse(0, 2, 20 * this.scale + this.height * 0.3, 6 * this.scale);

    this.drawBranch(this.root, this.baseLen, 0, 0);
    pop();
  }

  drawBranch(node, len, depth, totalAngle) {
    const grow = Math.min(1, this.depthGrowth - depth); // last level grows in gradually
    if (grow <= 0) return;

    // Wind sway (Perlin noise), stronger on thin outer branches.
    const sway = (noise(this.seed * 0.001, frameCount * 0.008, depth * 0.4) - 0.5) * 0.06 * (depth + 1);
    // Wilting: every level bends further towards the ground.
    const dir = Math.sign(totalAngle) || this.lean;
    const droop = depth === 0 ? this.wilt * 0.08 * dir : this.wilt * 0.32 * dir;
    const angle = node.angle + sway + droop;
    const L = len * grow;

    rotate(angle);
    strokeWeight(Math.max(0.7, this.species.weight * this.scale * Math.pow(0.66, depth) * (0.45 + 0.55 * this.growth)));
    // Healthy green -> dry brown as it wilts.
    stroke(lerp(115, 32, this.wilt), lerp(45, 35, this.wilt), lerp(42, 38, this.wilt));
    line(0, 0, 0, -L);
    const start = this.screenPoint();
    translate(0, -L);
    this.segments.push([...start, ...this.screenPoint()]); // remembered for hit-testing

    const isTip = node.children.length === 0 || depth + 1 >= this.depthGrowth;
    if (depth > 0) this.drawLeaf(grow);
    if (isTip) {
      this.drawTip(grow);
      return;
    }
    for (const child of node.children) {
      push();
      this.drawBranch(child, len * this.species.lenFactor, depth + 1, totalAngle + angle);
      pop();
    }
  }

  drawLeaf(grow) {
    const size = (1 - this.wilt * 0.6) * grow * this.scale;
    if (size < 0.15) return;
    noStroke();
    fill(lerp(110, 38, this.wilt), lerp(55, 45, this.wilt), lerp(60, 55, this.wilt), 1 - this.wilt * 0.5);
    push();
    rotate(0.7 * this.lean);
    ellipse(3 * size, 0, 7 * size, 3 * size);
    pop();
  }

  drawTip(grow) {
    const open = smoothstep(0.12, 0.65, this.bloom) * grow;
    if (open < 0.05) {
      this.drawLeaf(grow);
      return;
    }
    const r = (3 + 5 * open) * this.species.flower * this.scale * (1 + this.burst * 0.6);
    noStroke();
    fill(this.hue, 25 + 55 * this.bloom, 96, 0.92);
    for (let i = 0; i < this.petals; i++) {
      rotate(TWO_PI / this.petals);
      ellipse(0, -r * 0.55, r * 0.6, r * 1.1);
    }
    fill(45, 70, 100);
    circle(0, 0, r * 0.45);
  }

  // Frequency for this plant's voice in the soundscape (A3 = 220 Hz base).
  frequency(octaveShift = 0) {
    return 220 * Math.pow(2, (this.note + 12 * octaveShift) / 12);
  }
}
