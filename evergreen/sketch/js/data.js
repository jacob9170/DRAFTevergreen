// data.js — loads the pre-processed listening data and derives the two
// numbers every plant needs for any moment in time:
//
//   growth: how much I have listened to this artist in total so far.
//           Only ever goes up — like a plant's size, it remembers the past.
//   vitality: how much I have listened recently (an exponentially decaying sum).
//             Drives blooming; when I stop listening it fades and the plant wilts.

const halfLifeWeeks = 6; // recent listening halves every 6 weeks. i did this because the more i listen to an artist the more impact they have on my long term
const bloomScale = 150;  // decayed minutes needed to reach ~63% bloom

class GardenData {
  constructor(raw) { //garden.json data exactly as loaded, just runs once
    this.weeks = raw.weeks; //this weeks = 532
    this.startDate = new Date(raw.startDate + "T00:00:00"); //shifts it to midnight so it doesn't get confused with timezones
    // Minutes per week from each app, and combined.
    this.spotifyWeekly = raw.spotifyWeekly;
    this.appleWeekly = raw.appleWeekly;
    this.totalWeekly = raw.spotifyWeekly.map((m, w) => m + raw.appleWeekly[w]); //combines both spotify and apple music listening times
    this.countryWeekly = raw.countryWeekly;//country that it was listened in
    this.obsessions = raw.obsessions;
    this.summary = raw.summary;

    this.artists = raw.artists.map((a, rank) => this.deriveSeries(a, rank)); //go through all 60 artists and run derive series on each which works out their bloom and growth for the decade
    //rank ranks the artists position in the list 0-60
    this.maxCumHours = Math.max(...this.artists.map((a) => a.cumHours[this.weeks - 1])); //find the biggest total of any artist, read from each ones very last week
    // this.artists.map(a => a.cumHours[531]) makes a list of everyones final total
    //math.max(...list) finds the biggest number in that list
    this.listeningIntensity = this.smoothTotal();
    //works out how sunny each week is, continued in block 5
  }

  // Precompute cumulative hours and decayed vitality for every week,
  // so drawing a frame is just a lookup instead of re-summing 10 years.
  deriveSeries(artist, rank) { //this turns one artists 532 weeks of listening into two lists, growth and bloom for every week
    const decay = Math.pow(0.5, 1 / halfLifeWeeks); //how much recent listening survives each week
    //0.891 multiplied by itself 6 times = 0.5. After 6 weeks
    const cumHours = new Float32Array(this.weeks); //two emppty lists to fill in, two running scores starting at 0
    const vitality = new Float32Array(this.weeks);
    let total = 0;
    let recent = 0;
    for (let w = 0; w < this.weeks; w++) { //for every week from week 0, get the minutes listened that week
      const minutes = artist.weekly[w];
      total += minutes / 60; //add it to the weeks hours, can only go up
      recent = recent * decay + minutes;//this is super important because this says that this weeks recent scores = last weeks score, slightly faded, + whatveer i listened to this week
      cumHours[w] = total;
      vitality[w] = 1 - Math.exp(-recent / bloomScale); //turn the recent score into a bloom value
    }
    const firstWeek = artist.weekly.findIndex((m) => m > 0); //find the first week with listening. before that the plan is invisible
    return { ...artist, rank, cumHours, vitality, firstWeek };
  }

  // Overall "how much music was in my life" per week, smoothed and 0..1.
  smoothTotal() {
    const out = new Float32Array(this.weeks); 
    let ema = 0;
    for (let w = 0; w < this.weeks; w++) {
      ema = ema * 0.8 + this.totalWeekly[w] * 0.2;
      out[w] = ema; //each week its 80% of last weeks score + 20% of this weeks (ema stands for exponential moving average)
      //this smooths it out otherwise the sun would be jumping all over the place
    }
    const max = Math.max(...out);//divide every week by the bigegst week so my buiest stretch becomes 1 (the biggest sun). normalising!
    return out.map((v) => v / max);
  }

  // Linear interpolation between weeks so animation is smooth, not steppy.
  sample(series, week) {
    const i = Math.max(0, Math.min(this.weeks - 1, Math.floor(week)));
    const j = Math.min(this.weeks - 1, i + 1);
    const f = Math.max(0, Math.min(1, week - i));
    return series[i] + (series[j] - series[i]) * f;
  }

  dateOfWeek(week) {
    return new Date(this.startDate.getTime() + week * 7 * 864e5);
  }

  minutesAt(series, week) {
    return series[Math.max(0, Math.min(this.weeks - 1, Math.floor(week)))];
  }

  countryAt(week) {
    return this.countryWeekly[Math.max(0, Math.min(this.weeks - 1, Math.floor(week)))];
  }
}
