# Evergreen — a data self-portrait

A garden grown from ten years (2016–2026) of my Spotify listening history.
Every artist is a plant: it **grows** with every hour I give it, **blooms** while
I'm hooked, and **wilts** when I move on.

> Which music grew up with me — and which did I outgrow?

Brief: *Data Self-Portrait*, Code as Creative Medium (Levin & Brain, 2021).

## Run it
The sketch loads a JSON file, so it needs a local server (not double-click):

```bash
cd sketch
python3 -m http.server 8765
```
Then open http://localhost:8765. Add `?week=362&skipintro` to jump to July 2023.

## Controls
| Action | Result |
|---|---|
| Hover a plant | name + soft note |
| Click a plant | artist story panel, obsession curve, song plays via Spotify |
| Drag the timeline | travel through time |
| Click a pink diamond | jump to an "obsession day" |
| Space / ← → / M / Esc | play-pause / month step / mute / close panel |

## How it works
**Data pipeline** (`data-pipeline/preprocess.py`): 112k Spotify plays + 20k Apple Music daily rows → matched by artist name →
cleaned (music only, IP addresses and device info removed, Sydney time) →
weekly minutes per artist for the top 60 artists + "obsession days"
(≥10 replays of one song in one day) → `sketch/data/garden.json` (96 KB).

**Mapping data → garden**
| Data | Visual | Sound |
|---|---|---|
| Total hours with an artist | plant size + branch depth (recursive) | voice weight |
| Recent listening (6-week half-life decay) | flowers open | voice volume |
| Loved, then abandoned | branches droop, leaves dry, petals fall | voice fades out |
| Discovery order | planting position (left → right) | — |
| Total music that week | sun size and glow | — |
| Month | season colours (southern hemisphere) | — |
| Obsession day | flare + petal burst + caption | rising chime |

**Code structure** (`sketch/`)
- `sketch.js` — setup, main loop, time, input
- `js/data.js` — derives growth & vitality series once at load
- `js/plant.js` — seeded recursive plant (3 species), wilt/bloom rendering
- `js/garden.js` — layout, scenery, particles, hover
- `js/timeline.js` — scrubber with cached area chart
- `js/soundscape.js` — p5.sound ambient voices, plucks, ducking
- `js/spotify.js` — Spotify iFrame API wrapper
- `js/panel.js` — artist story panel

## Libraries
p5.js 1.11, p5.sound, Spotify Embed iFrame API, Google Fonts (Fraunces, Inter).
