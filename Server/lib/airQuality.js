// Compares OpenWeatherMap air pollution readings with the "Good" thresholds from its documentation
// and builds a warning (with health risks) for every pollutant that is above Good.

const LEVELS = ['Good', 'Fair', 'Moderate', 'Poor', 'Very Poor'];

// bounds[i] is where level i+1 begins (ug/m3). A value below bounds[0] is Good.
// Ranges are [from; to), so a value exactly on a bound belongs to the higher level.
const POLLUTANTS = {
  pm2_5: {
    name: 'Fine particles (PM2.5)',
    bounds: [10, 25, 50, 75],
    risks:
      'Tiny particles that reach deep into the lungs and bloodstream. They can irritate the airways, worsen asthma and heart conditions, and raise the risk of respiratory infections.',
  },
  pm10: {
    name: 'Coarse particles (PM10)',
    bounds: [20, 50, 100, 200],
    risks:
      'Dust-sized particles that irritate the eyes, nose and throat and can aggravate asthma and other lung conditions.',
  },
  no2: {
    name: 'Nitrogen dioxide (NO₂)',
    bounds: [40, 70, 150, 200],
    risks:
      'A traffic-related gas that inflames the airways, can trigger coughing and asthma attacks, and may reduce lung function over time.',
  },
  o3: {
    name: 'Ozone (O₃)',
    bounds: [60, 100, 140, 180],
    risks:
      'Ground-level ozone irritates the airways, causing coughing, throat irritation and chest tightness, especially during outdoor exercise.',
  },
  so2: {
    name: 'Sulphur dioxide (SO₂)',
    bounds: [20, 80, 250, 350],
    risks:
      'Irritates the nose, throat and lungs and can trigger wheezing and breathing difficulty, particularly in people with asthma.',
  },
  co: {
    name: 'Carbon monoxide (CO)',
    bounds: [4400, 9400, 12400, 15400],
    risks:
      'Reduces the blood’s ability to carry oxygen. Raised levels can cause headaches and dizziness and put extra strain on people with heart disease.',
  },
};

// What to do at each level above Good (index matches LEVELS)
const ADVICE = [
  null,
  'Unusually sensitive people should consider shorter or lighter outdoor activity.',
  'People with asthma, heart or lung conditions, children and older adults should reduce long or strenuous outdoor activity.',
  'Everyone may start to notice effects. Limit strenuous outdoor activity, and sensitive groups should stay indoors where possible.',
  'Avoid strenuous outdoor activity. Sensitive groups should stay indoors, and a well-fitted mask may help outdoors.',
];

const round1 = (n) => Math.round(n * 10) / 10;

// Turns the Air Pollution API response into an overall level plus one warning per elevated pollutant
function assessAirQuality(rawAir) {
  const reading = rawAir && rawAir.list && rawAir.list[0];
  if (!reading || !reading.components) return { available: false };

  const warnings = [];
  for (const [key, info] of Object.entries(POLLUTANTS)) {
    const value = reading.components[key];
    if (typeof value !== 'number') continue;

    // Number of bounds the value has reached = index of its level (0 means Good)
    const levelIndex = info.bounds.filter((bound) => value >= bound).length;
    if (levelIndex === 0) continue;

    warnings.push({
      pollutant: key,
      name: info.name,
      value: round1(value),
      unit: 'μg/m³',
      level: LEVELS[levelIndex],
      levelKey: LEVELS[levelIndex].toLowerCase().replace(' ', '-'),
      levelIndex,
      goodLimit: info.bounds[0],
      timesGoodLimit: round1(value / info.bounds[0]),
      risks: info.risks,
      advice: ADVICE[levelIndex],
    });
  }

  // Worst first
  warnings.sort((a, b) => b.levelIndex - a.levelIndex);

  const aqi = (reading.main && reading.main.aqi) || 1;
  return { available: true, aqi, level: LEVELS[aqi - 1], warnings };
}

module.exports = { assessAirQuality };
