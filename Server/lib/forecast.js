// Turns OpenWeatherMap's 5 day / 3 hour forecast into the 3-day summary the client displays:
// a daily table, the umbrella decision, the Cold / Mild / Hot packing category and the sky mood.

const DAYS_TO_SHOW = 3;
const MIN_SLOTS_FOR_A_DAY = 4;   // 4 three-hour slots = 12 hours; a shorter first day is skipped
const COLD_BELOW = 8;            // degrees C: below this is Cold
const HOT_ABOVE = 24;            // degrees C: above this is Hot (8 to 24 inclusive is Mild)
const RAIN_CONDITIONS = ['Rain', 'Drizzle', 'Thunderstorm'];
const CONDITION_MOODS = {
  Clear: 'clear',
  Clouds: 'clouds',
  Drizzle: 'drizzle',
  Rain: 'rain',
  Thunderstorm: 'thunderstorm',
  Snow: 'snow',
  Mist: 'atmosphere',
  Smoke: 'atmosphere',
  Haze: 'atmosphere',
  Dust: 'atmosphere',
  Fog: 'atmosphere',
  Sand: 'atmosphere',
  Ash: 'atmosphere',
  Squall: 'thunderstorm',
  Tornado: 'thunderstorm',
};
const CONDITION_ICONS = {
  Clear: '☀️',
  Clouds: '☁️',
  Rain: '🌧️',
  Drizzle: '🌦️',
  Thunderstorm: '⛈️',
  Snow: '❄️',
};
const FALLBACK_ICON = '🌫️';

const CATEGORIES = {
  cold: {
    label: 'Cold',
    icon: '🧥',
    advice: 'Pack warm clothing: a heavy coat, layers, a hat and gloves.',
  },
  mild: {
    label: 'Mild',
    icon: '🧢',
    advice: 'Pack light layers and a jacket you can take on and off.',
  },
  hot: {
    label: 'Hot',
    icon: '😎',
    advice: 'Pack light, breathable clothing, sunscreen, sunglasses and a hat.',
  },
};

const round1 = (n) => Math.round(n * 10) / 10;
const average = (numbers) => numbers.reduce((sum, n) => sum + n, 0) / numbers.length;

// The calendar date (YYYY-MM-DD) of a timestamp in the city's own timezone
function localDateKey(unixSeconds, timezoneOffsetSeconds) {
  return new Date((unixSeconds + timezoneOffsetSeconds) * 1000).toISOString().slice(0, 10);
}

// Groups the 3-hour slots by local calendar day, keeping chronological order
function groupSlotsByDay(slots, timezoneOffsetSeconds) {
  const groups = new Map();
  for (const slot of slots) {
    const key = localDateKey(slot.dt, timezoneOffsetSeconds);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(slot);
  }
  return [...groups].map(([date, daySlots]) => ({ date, slots: daySlots }));
}

// Picks the 3 days to show. If only a few hours of today are left, start from tomorrow instead.
function selectDays(groups) {
  const firstIsTooShort = groups.length > 0 && groups[0].slots.length < MIN_SLOTS_FOR_A_DAY;
  return (firstIsTooShort ? groups.slice(1) : groups).slice(0, DAYS_TO_SHOW);
}

const slotRainMm = (slot) => (slot.rain && slot.rain['3h']) || 0;
const slotCondition = (slot) => (slot.weather && slot.weather[0] && slot.weather[0].main) || '';
const isRainySlot = (slot) => slotRainMm(slot) > 0 || RAIN_CONDITIONS.includes(slotCondition(slot));

function mostCommon(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
}

// "Today", "Tomorrow", then the weekday name
function dayLabel(dateKey, todayKey) {
  const diffDays = Math.round((Date.parse(dateKey) - Date.parse(todayKey)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-IE', { weekday: 'long', timeZone: 'UTC' });
}

function shortDate(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-IE', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

// Rainfall level for a day's total rain in mm
function rainLevel(totalMm, rainy) {
  if (totalMm === 0) return rainy ? 'Light' : 'None';
  if (totalMm < 2.5) return 'Light';
  if (totalMm < 10) return 'Moderate';
  return 'Heavy';
}

// Cold below 8 C, Hot above 24 C, otherwise Mild (8 to 24 inclusive)
function categoriseTemperature(temp) {
  if (temp < COLD_BELOW) return 'cold';
  if (temp > HOT_ABOVE) return 'hot';
  return 'mild';
}

// Summarises one day's 3-hour slots into the values shown in the table
function summariseDay({ date, slots }, todayKey) {
  const temps = slots.map((slot) => slot.main.temp);
  const windMs = Math.max(...slots.map((slot) => (slot.wind && slot.wind.speed) || 0));
  const rainMm = slots.reduce((sum, slot) => sum + slotRainMm(slot), 0);
  const rainy = slots.some(isRainySlot);
  const condition = mostCommon(slots.map(slotCondition));
  const chance = Math.max(...slots.map((slot) => slot.pop || 0));

  return {
    date,
    label: dayLabel(date, todayKey),
    dateLabel: shortDate(date),
    tempMin: round1(Math.min(...temps)),
    tempMax: round1(Math.max(...temps)),
    windMs: round1(windMs),
    windKmh: Math.round(windMs * 3.6),
    rainMm: round1(rainMm),
    rainChance: Math.round(chance * 100),
    rainLevel: rainLevel(rainMm, rainy),
    rainy,
    condition,
    icon: CONDITION_ICONS[condition] || FALLBACK_ICON,
  };
}

// The umbrella decision and the clothing category for the whole 3 days
function buildPacking(days, slots) {
  const avgTemp = round1(average(slots.map((slot) => slot.main.temp)));
  const minTemp = Math.min(...days.map((day) => day.tempMin));
  const maxTemp = Math.max(...days.map((day) => day.tempMax));
  const category = categoriseTemperature(avgTemp);
  const rainDays = days.filter((day) => day.rainy).map((day) => day.label);

  // Mention it when the extremes fall outside the main category
  const notes = [];
  if (category !== 'cold' && minTemp < COLD_BELOW) {
    notes.push(`Temperatures dip to ${minTemp}°C at times, so bring a warm layer.`);
  }
  if (category !== 'hot' && maxTemp > HOT_ABOVE) {
    notes.push(`It reaches ${maxTemp}°C at times, so pack something light too.`);
  }

  return {
    umbrella: rainDays.length > 0,
    rainDays,
    category,
    categoryLabel: CATEGORIES[category].label,
    icon: CATEGORIES[category].icon,
    advice: [CATEGORIES[category].advice, ...notes].join(' '),
    avgTemp,
    minTemp,
    maxTemp,
  };
}

// Main entry point. `rawForecast` is the JSON from /data/2.5/forecast.
// `nowSeconds` is injectable so the logic can be tested with fixed data.
function buildForecast(rawForecast, nowSeconds = Math.floor(Date.now() / 1000)) {
  const timezoneOffset = rawForecast.city ? rawForecast.city.timezone || 0 : 0;
  const todayKey = localDateKey(nowSeconds, timezoneOffset);

  const selected = selectDays(groupSlotsByDay(rawForecast.list, timezoneOffset));
  const days = selected.map((group) => summariseDay(group, todayKey));
  const packing = buildPacking(days, selected.flatMap((group) => group.slots));

  const conditionMood = CONDITION_MOODS[days[0].condition];
  const rainMood = ['drizzle', 'rain', 'thunderstorm'].includes(conditionMood) ? conditionMood : 'rain';
  const mood = packing.category === 'hot'
    ? 'hot'
    : days[0].rainy
      ? rainMood
      : conditionMood || packing.category;

  return { days, packing, mood };
}

module.exports = { buildForecast, categoriseTemperature, rainLevel };
