// sketch.js — Evergreen: a garden grown from ten years of my Spotify listening.
//
// This file wires the modules together and handles time and input:
//   data.js       GardenData   — loads & derives growth / vitality per artist
//   plant.js      Plant        — one artist drawn as a recursive, seeded plant
//   garden.js     Garden       — scenery, layout, particles, hover
//   timeline.js   Timeline     — the scrubber with obsession-day markers
//   soundscape.js Soundscape   — generative ambient hum + plucks (p5.sound)
//   spotify.js    SpotifyPlayer— real songs via the Spotify embed library
//   panel.js      InfoPanel    — the artist story panel

// Personal notes for obsession days (date -> what was happening). Shown in the caption.
const stories = {
  "2023-07-14": "I saw Barbie and loved the song. Needless to say I binged listened to the song by Billie Eilish alot of times there.",
};

const defaultSpeed = 5;       // weeks per second while playing
const obsessionToastMs = 5000;

let rawData, data, garden, timeline, soundscape, spotify, panel;
let week = 0;
let playing = false;
let speed = defaultSpeed;
let toastTimer = null;

function preload() {
  rawData = loadJSON("data/garden.json");
}

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("stage");
  colorMode(HSB, 360, 100, 100, 1);
  textFont("Manrope");

  data = new GardenData(rawData);
  garden = new Garden(data);
  timeline = new Timeline(data);
  soundscape = new Soundscape();
  spotify = new SpotifyPlayer("spotify-embed", (isPlaying) => soundscape.setDucked(isPlaying));
  panel = new InfoPanel(data, playTrack, closePanel);
  layoutAll();

  // Start a little before the first big discovery so the intro view isn't empty.
  // ?week=362 jumps straight to a moment (handy for demos and testing).
  const params = new URLSearchParams(location.search);
  week = params.has("week") ? Number(params.get("week")) : 60;
  setupIntro(params.has("skipintro"));
}

function layoutAll() {
  timeline.layout();
  garden.layout();
}

function windowResized() {
  if (!garden) return; // resize fired before setup finished
  resizeCanvas(windowWidth, windowHeight);
  layoutAll();
}

// main loop
function draw() {
  advanceTime();

  const overGarden = mouseY < height - timelineHeight;
  garden.update(week, overGarden ? mouseX : -999, overGarden ? mouseY : -999); //updates the garden and the hovered plant
  if (frameCount % 15 === 0) soundscape.update(garden.plants); //sound changes slowly anyway so 4 times a second is fine
  panel.update(week); //just for the artist panel for updating its live text

  garden.drawScenery(week); //back to front
  garden.drawPlants();
  garden.drawParticles();
  garden.drawLabels();
  drawHud();
  timeline.draw(week, playing);

  cursor(garden.hovered || timeline.isOverPlayButton(mouseX, mouseY) || timeline.hoveredMarker ? HAND : ARROW); //a small touch to show u if its clickable
}

function advanceTime() {
  if (!playing || timeline.dragging) return;
  const previous = week;
  week += (speed * deltaTime) / 1000; //at 60 frames a second its about 16.7ms
  //using delta time instead of a fixed number makes it more consistent for lots of frame rates and different computers
  if (week >= data.weeks - 1) {
    week = data.weeks - 1;
    playing = false; //stop playing at the end
  }
  checkObsessions(previous, week);
}

// Fire a celebration when the playhead crosses an obsession day.
function checkObsessions(from, to) {
  for (const o of data.obsessions) {
    if (o.week > from && o.week <= to) celebrateObsession(o); //if the obsession week is between the previous and current week then celebrate it. good because the obsession week is probably never going to be the exact decimal that it lands on
  }
}

function celebrateObsession(o) {
  const plant = garden.celebrate(o.artist);
  if (plant) soundscape.chime(plant);
  const story = stories[o.date] ? `<em>${stories[o.date]}</em>` : ""; //checks if theres a note in my stories and if it is it wraps it in <em>
  showToast(`<strong>${formatDate(o.date)}</strong> — I played <strong>“${o.track}”</strong> ` +
    `by ${o.artist} <strong>${o.plays} times</strong> in one day. ${story}`); //lays out the info
}

function drawHud() { //headupdusplay for the top left corner of the screen
  const date = data.dateOfWeek(week);
  const toHours = (series) => (data.minutesAt(series, week) / 60).toFixed(1);//converts the minutes to hours and rounds it to 1 decimal place
  const country = data.countryAt(week);

  noStroke();
  textAlign(LEFT, TOP);// sketches all this out
  fill(0, 0, 100);
  textSize(34);
  textStyle(BOLD);
  text(formatMonthYear(date), 28, 22);
  textStyle(NORMAL);
  textSize(14);
  fill(0, 0, 100, 0.85);
  let line = `${toHours(data.totalWeekly)} hours of music this week`;  //shows the total hours of music played this week
  if (country && country !== "AU") line += `  ·  listening from ${countryName(country)}`;
  text(line, 30, 66);

  // Which app I was listening to this week
  textSize(12);
  fill(...spotifyHsb, 1);
  text(`Spotify ${toHours(data.spotifyWeekly)} h`, 30, 88);
  fill(...appleHsb, 1);
  text(`Apple Music ${toHours(data.appleWeekly)} h`, 130, 88);

  textAlign(RIGHT, TOP);
  textSize(12);
  fill(0, 0, 100, 0.7);
  text("hover a plant · click to hear it · space: play/pause · ← → : month · M: mute", width - 24, 26); //controls for the garden
}

// actions
function selectPlant(plant) { 
  garden.selected = plant; //marks it as selected so it glows
  panel.open(plant);
  soundscape.pluck(plant.frequency(1)); //plays a 'pluck' when the plant is clicked
  playTrack(plant.artist.topTracks.find((t) => t.uri) || plant.artist.topTracks[0], plant); //plays the top track of the selected plant
}


function playTrack(track, plant) {
  if (track.uri) spotify.play(track.uri);
  else if (track.appleId) window.open(`https://music.apple.com/au/song/${track.appleId}`, "_blank");//if its in spotify open it in spotify, if apple music open in new tab
  if (plant) soundscape.pluck(plant.frequency(1), 0.6);
}

function closePanel() {
  garden.selected = null; //unselect the plant, slide the panel away and stop the music
  panel.close();
  spotify.pause();
}

function togglePlay() {
  if (week >= data.weeks - 1) week = 0; // restart from the beginning
  playing = !playing;//toggles it so playing becomes paused
}

function showToast(html) { //uses JavaScript because the caption is a HTML element not a canvas drawing
  const el = document.getElementById("toast"); //finds the html box with the id toast
  el.innerHTML = html; //puts the caption text inside
  el.classList.add("show"); //adds the CSS class show, which makes it fade in, the animation lices in style.css
  clearTimeout(toastTimer); //clears the previous timer so it doesn't hide the caption too early
  toastTimer = setTimeout(() => el.classList.remove("show"), obsessionToastMs);
}

// input
// p5 listens on the whole window; ignore clicks that land on HTML overlays.
function isCanvasEvent(event) {
  return event && event.target && event.target.tagName === "CANVAS"; //makes sure theyr clicking on the panel instead of garden behind it
} //event && event make sure it exists before checking

function mousePressed(event) {
  if (!isCanvasEvent(event)) return; //does the following things in order
  if (timeline.isOverPlayButton(mouseX, mouseY)) return togglePlay();

  const marker = timeline.markerAt(mouseX, mouseY);
  if (marker) {
    week = marker.week;
    celebrateObsession(marker);
    return; //for the diamonds, goes to them on the timeline and celebrates
  }
  if (timeline.isOver(mouseX, mouseY)) {
    timeline.dragging = true;
    week = timeline.xToWeek(mouseX);
    return; //anywhere else on the timeline, starts dragging and sets the week to the mouse position
  }

  const plant = garden.hovered || garden.plantAt(mouseX, mouseY); //if the mouse is over a plant, select it and open the panel
  if (plant) selectPlant(plant);
}

function mouseDragged(event) {
  if (timeline.dragging) week = timeline.xToWeek(mouseX); //for dragging the timeline
}

function mouseReleased() {
  timeline.dragging = false;
}

let lastHovered = null;
function mouseMoved() {
  // Soft note when the cursor first touches a plant — the garden answers back.
  if (garden.hovered && garden.hovered !== lastHovered) soundscape.pluck(garden.hovered.frequency(1), 0.35); //only create the sound when land on a new plant
  lastHovered = garden.hovered;
}

function keyPressed() { //for all the keys that can be pressed. 
  if (key === " ") togglePlay();
  else if (keyCode === LEFT_ARROW) week = Math.max(0, week - 4.35);
  else if (keyCode === RIGHT_ARROW) week = Math.min(data.weeks - 1, week + 4.35);
  else if (key === "m" || key === "M") soundscape.toggleMute();
  else if (keyCode === ESCAPE) closePanel();
  return false; // stop the page scrolling on space
}

// intro
function setupIntro(skip) {
  if (skip) {
    document.getElementById("intro").classList.add("hidden");
    return;
  }
  const s = data.summary; 
  document.getElementById("intro-stats").textContent =
    `${s.plays.toLocaleString()} plays · ${s.hours.toLocaleString()} hours · ` +
    `${s.uniqueArtists.toLocaleString()} artists · ${data.dateOfWeek(0).getFullYear()}–${data.dateOfWeek(data.weeks).getFullYear()}`;
  document.getElementById("enter").addEventListener("click", () => {
    document.getElementById("intro").classList.add("hidden");
    soundscape.start(); //only starts the sound when you click enter the garden
    playing = true;
  });
}
