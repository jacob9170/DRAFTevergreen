// timeline.js — the scrubber along the bottom of the screen.
// Shows ten years of total listening as a soft area chart, year ticks,
// obsession-day markers, and a draggable playhead.

const timelineHeight = 74;
const spotifyHsb = [141, 70, 85];  // Spotify green
const appleHsb = [350, 65, 98];    // Apple Music pink-red

class Timeline {
  constructor(data) {
    this.data = data;
    this.dragging = false;
    this.hoveredMarker = null;
  }

  layout() {
    this.top = height - timelineHeight;
    this.left = 96;
    this.right = width - 36;
    this.chartTop = this.top + 14;
    this.chartBottom = height - 26;
    this.playButton = { x: 48, y: this.top + timelineHeight / 2 - 6, r: 17 };
    this.renderChart();
  }

  weekToX(week) { return map(week, 0, this.data.weeks - 1, this.left, this.right); }
  xToWeek(x) { return constrain(map(x, this.left, this.right, 0, this.data.weeks - 1), 0, this.data.weeks - 1); }

  // The area chart never changes, so draw it once into an offscreen buffer.
  renderChart() {
    const g = createGraphics(width, timelineHeight);
    g.colorMode(HSB, 360, 100, 100, 1);
    // Stacked area: Spotify on the bottom, Apple Music on top.
    // Bar height uses sqrt so quiet weeks stay visible; the split keeps true proportions.
    const { totalWeekly, spotifyWeekly } = this.data;
    const maxMin = Math.max(...totalWeekly);
    const h = this.chartBottom - this.chartTop;
    const base = this.chartBottom - this.top;
    const heightAt = (w) => Math.sqrt(totalWeekly[w] / maxMin) * h;
    const spotifyShare = (w) => (totalWeekly[w] ? spotifyWeekly[w] / totalWeekly[w] : 1);

    g.noStroke();
    g.fill(...appleHsb, 0.75);
    this.drawArea(g, base, (w) => heightAt(w));
    g.fill(...spotifyHsb, 0.6);
    this.drawArea(g, base, (w) => heightAt(w) * spotifyShare(w));

    // Legend
    g.textSize(10);
    g.textAlign(RIGHT, TOP);
    g.fill(...spotifyHsb, 1);
    g.text("Spotify", this.right - 82, 2);
    g.fill(...appleHsb, 1);
    g.text("Apple Music", this.right, 2);

    // Year ticks + labels
    g.textSize(10);
    g.textAlign(CENTER, TOP);
    const startYear = this.data.startDate.getFullYear();
    const endYear = this.data.dateOfWeek(this.data.weeks).getFullYear();
    for (let y = startYear + 1; y <= endYear; y++) {
      const week = (new Date(`${y}-01-01T00:00:00`) - this.data.startDate) / (7 * 864e5);
      const x = this.weekToX(week);
      g.stroke(0, 0, 100, 0.25);
      g.line(x, this.chartTop - this.top, x, this.chartBottom - this.top);
      g.noStroke();
      g.fill(0, 0, 100, 0.6);
      g.text(y, x, this.chartBottom - this.top + 4);
    }
    if (this.chartImage) this.chartImage.remove();
    this.chartImage = g;
  }

  drawArea(g, base, heightOf) {
    g.beginShape();
    g.vertex(this.left, base);
    for (let w = 0; w < this.data.weeks; w++) g.vertex(this.weekToX(w), base - heightOf(w));
    g.vertex(this.right, base);
    g.endShape(CLOSE);
  }

  isOver(mx, my) { return my > this.top; }

  isOverPlayButton(mx, my) {
    return dist(mx, my, this.playButton.x, this.playButton.y) < this.playButton.r + 4;
  }

  markerAt(mx, my) {
    if (my < this.chartTop - 10 || my > this.chartBottom) return null;
    return this.data.obsessions.find((o) => Math.abs(this.weekToX(o.week) - mx) < 6) || null;
  }

  draw(week, playing) {
    // Panel background
    noStroke();
    fill(220, 30, 8, 0.72);
    rect(0, this.top, width, timelineHeight);
    image(this.chartImage, 0, this.top);

    // Elapsed portion tinted
    const px = this.weekToX(week);
    fill(45, 60, 100, 0.12);
    rect(this.left, this.chartTop, px - this.left, this.chartBottom - this.chartTop);

    // Obsession markers - size grows with how many times I replayed the song
    this.hoveredMarker = this.markerAt(mouseX, mouseY);
    for (const o of this.data.obsessions) {
      const x = this.weekToX(o.week);
      const s = 5 + Math.log2(o.plays) * 1.6;
      const hot = o === this.hoveredMarker;
      fill(340, 70, 100, hot ? 1 : 0.8);
      push();
      translate(x, this.chartTop - 2);
      rotate(QUARTER_PI);
      rectMode(CENTER);
      rect(0, 0, s * (hot ? 1.3 : 1), s * (hot ? 1.3 : 1), 2);
      pop();
    }

    // Playhead
    stroke(45, 80, 100);
    strokeWeight(2);
    line(px, this.chartTop - 8, px, this.chartBottom);
    noStroke();
    fill(45, 80, 100);
    circle(px, this.chartBottom, 10);

    this.drawPlayButton(playing);
    if (this.hoveredMarker) this.drawMarkerTooltip(this.hoveredMarker);
  }

  drawPlayButton(playing) {
    const { x, y, r } = this.playButton;
    fill(0, 0, 100, this.isOverPlayButton(mouseX, mouseY) ? 0.3 : 0.18);
    circle(x, y, r * 2);
    fill(0, 0, 100);
    if (playing) {
      rect(x - 6, y - 7, 4, 14, 1);
      rect(x + 2, y - 7, 4, 14, 1);
    } else {
      triangle(x - 4, y - 8, x - 4, y + 8, x + 8, y);
    }
  }

  drawMarkerTooltip(o) {
    const label = `${formatDate(o.date)} — "${o.track}" × ${o.plays}`;
    textSize(12);
    const w = textWidth(label) + 20;
    const x = constrain(this.weekToX(o.week) - w / 2, 8, width - w - 8);
    const y = this.top - 34;
    fill(220, 30, 10, 0.9);
    rect(x, y, w, 26, 6);
    fill(0, 0, 100);
    textAlign(LEFT, CENTER);
    text(label, x + 10, y + 13);
  }
}
