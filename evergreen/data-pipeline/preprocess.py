"""
Evergreen — data pipeline
=========================
Merges two raw exports of my listening into one compact, privacy-cleaned JSON

Pipeline:  acquire -> parse -> clean -> normalise to one record format -> aggregate -> export

  - Keeps music only (drops podcasts / audiobooks / video).
  - Strips private fields (IP address, device, account IDs).
  - Converts Spotify UTC timestamps to Sydney local time.
  - Matches Apple's "Artist - Song" text to Spotify's artist names.
  - Bins listening into weeks per artist (minutes listened each week, per app).
  - Finds "obsession days" (one song replayed many times in one day).

"""

import csv
import glob
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

# --- Settings
top_artists = 60            # how many artists become plants in the garden
min_real_play_ms = 30_000   # Spotify counts a "stream" after 30 s; shorter = a skip
obsession_min_plays = 10    # same song this many times in one day = obsession
local_tz = ZoneInfo("Australia/Sydney")
apple_file = "Apple Music - Play History Daily Tracks.csv"

# Every play, from either app, becomes one of these records:
#   day, artist, track, ms, plays, skips, source ("spotify"/"apple"),
#   uri (Spotify) or appleId (Apple), country (Spotify only)


# --- Spotify
def load_spotify(folder):
    """One record per play. Skips = plays shorter than 30 s."""
    records = []
    for path in sorted(glob.glob(os.path.join(folder, "Streaming_History_Audio_*.json"))):
        with open(path, encoding="utf-8") as f:
            for r in json.load(f):
                track, artist = r.get("master_metadata_track_name"), r.get("master_metadata_album_artist_name")
                if not track or not artist:
                    continue  # podcast episode, audiobook or broken record
                local = datetime.fromisoformat(r["ts"].replace("Z", "+00:00")).astimezone(local_tz)
                skipped = r["ms_played"] < min_real_play_ms
                records.append({
                    "day": local.date(), "artist": artist, "track": track,
                    "ms": r["ms_played"], "plays": 0 if skipped else 1, "skips": 1 if skipped else 0,
                    "source": "spotify", "uri": r["spotify_track_uri"], "country": r["conn_country"],
                })
    return records


# --- Apple Music
def resolve_apple_artist(text, known):
    """Apple only gives "Artist - Song" text, and multi-artist credits like
    "Calvin Harris, Disciples". Prefer a name Spotify already knows, so the same
    artist becomes one plant. (Exact match first: "Tyler, The Creator" has a comma!)"""
    if text in known:
        return text
    for sep in (", ", " & ", " feat. ", " x "):
        first = text.split(sep)[0]
        if first in known:
            return first
    return text.split(", ")[0]


def load_apple(folder, known_artists):
    records = []
    with open(os.path.join(folder, apple_file), encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            desc = r["Track Description"]
            if r["Media type"] != "AUDIO" or " - " not in desc:
                continue
            artist_text, track = desc.split(" - ", 1)
            d = r["Date Played"]
            records.append({
                "day": date(int(d[:4]), int(d[4:6]), int(d[6:8])),
                "artist": resolve_apple_artist(artist_text, known_artists), "track": track,
                "ms": int(r["Play Duration Milliseconds"] or 0),
                "plays": int(r["Play Count"] or 0), "skips": int(r["Skip Count"] or 0),
                "source": "apple", "appleId": r["Track Identifier"], "country": "",
            })
    return records


# --- Aggregation
def build(records):
    records.sort(key=lambda p: p["day"])
    first_day = records[0]["day"]
    start = first_day - timedelta(days=first_day.weekday())  # Monday of the first week
    week_of = lambda d: (d - start).days // 7
    n_weeks = week_of(records[-1]["day"]) + 1

    # Choose which artists become plants (by total listening time, both apps)
    hours_by_artist = Counter()
    for p in records:
        hours_by_artist[p["artist"]] += p["ms"] / 3.6e6
    chosen = [a for a, _ in hours_by_artist.most_common(top_artists)]
    chosen_set = set(chosen)

    weekly = {a: [0] * n_weeks for a in chosen}       # minutes per week, both apps
    apple_minutes = Counter()
    first_seen, last_seen = {}, {}
    plays, skips = Counter(), Counter()
    tracks = defaultdict(lambda: defaultdict(lambda: {"plays": 0}))  # artist -> track key -> info
    weekly_by_source = {"spotify": [0] * n_weeks, "apple": [0] * n_weeks}
    country_weekly = [Counter() for _ in range(n_weeks)]
    per_day = defaultdict(lambda: {"plays": 0})       # (day, track, artist) -> obsession info

    for p in records:
        w = week_of(p["day"])
        minutes = p["ms"] / 60_000
        weekly_by_source[p["source"]][w] += minutes
        if p["country"]:
            country_weekly[w][p["country"]] += 1

        key = (p["day"], p["track"].lower(), p["artist"])
        day_info = per_day[key]
        day_info["plays"] += p["plays"]
        day_info.update({"track": p["track"], "artist": p["artist"]})
        day_info.setdefault("uri", p.get("uri"))

        a = p["artist"]
        if a not in chosen_set:
            continue
        weekly[a][w] += minutes
        first_seen.setdefault(a, p["day"])
        last_seen[a] = p["day"]
        plays[a] += p["plays"]
        skips[a] += p["skips"]
        if p["source"] == "apple":
            apple_minutes[a] += minutes
        t = tracks[a][p["track"].lower()]
        t["name"] = t.get("name", p["track"])
        t["plays"] += p["plays"]
        if p.get("uri"):
            t["uri"] = p["uri"]
        if p.get("appleId"):
            t["appleId"] = p["appleId"]

    artists = []
    for a in chosen:
        top = sorted(tracks[a].values(), key=lambda t: -t["plays"])[:3]
        total_min = sum(weekly[a])
        artists.append({
            "name": a,
            "hours": round(hours_by_artist[a], 1),
            "plays": plays[a],
            "skipRate": round(skips[a] / max(1, plays[a] + skips[a]), 3),
            "appleShare": round(apple_minutes[a] / max(1, total_min), 3),
            "firstPlay": first_seen[a].isoformat(),
            "lastPlay": last_seen[a].isoformat(),
            "topTracks": top,
            "weekly": [round(m) for m in weekly[a]],
        })

    obsessions = sorted(
        ({"date": d.isoformat(), "week": week_of(d), **info}
         for (d, _, _), info in per_day.items() if info["plays"] >= obsession_min_plays),
        key=lambda o: -o["plays"])

    # Dominant country per week ("ZZ" = unknown). Only Spotify logs this.
    countries = []
    for c in country_weekly:
        c.pop("ZZ", None)
        countries.append(c.most_common(1)[0][0] if c else "")

    return {
        "startDate": start.isoformat(),
        "weeks": n_weeks,
        "spotifyWeekly": [round(m) for m in weekly_by_source["spotify"]],
        "appleWeekly": [round(m) for m in weekly_by_source["apple"]],
        "countryWeekly": countries,
        "artists": artists,
        "obsessions": obsessions,
        "summary": {
            "plays": sum(p["plays"] + p["skips"] for p in records),
            "hours": round(sum(p["ms"] for p in records) / 3.6e6),
            "spotifyHours": round(sum(weekly_by_source["spotify"]) / 60),
            "appleHours": round(sum(weekly_by_source["apple"]) / 60),
            "uniqueArtists": len(hours_by_artist),
        },
    }


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    spotify_dir, apple_dir, out = sys.argv[1:]
    spotify = load_spotify(spotify_dir)
    apple = load_apple(apple_dir, {p["artist"] for p in spotify})
    data = build(spotify + apple)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    s = data["summary"]
    print(f"{s['plays']} plays, {s['hours']} h (Spotify {s['spotifyHours']} h, Apple {s['appleHours']} h), "
          f"{data['weeks']} weeks, {len(data['artists'])} plants, {len(data['obsessions'])} obsession days -> {out}")


if __name__ == "__main__":
    main()
