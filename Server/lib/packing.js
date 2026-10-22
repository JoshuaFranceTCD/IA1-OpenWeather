// Activity-aware packing recommendations. Kept separate from the core forecast summary.

const ACTIVITY_OPTIONS = ['sightseeing', 'hiking', 'dining'];

function recommendDayPacking(day, activities) {
  const items = [];
  const add = (id, label, reason) => items.push({ id, label, reason });

  if (day.rainy || day.rainChance >= 40) {
    add('umbrella', 'Umbrella', day.rainy ? 'Rain is forecast during the day.' : `There is a ${day.rainChance}% chance of rain.`);
    if (day.rainLevel === 'Heavy' || activities.includes('hiking')) {
      add('waterproof-jacket', 'Waterproof jacket', 'Useful for staying dry, especially while outdoors.');
    }
  }

  if (day.tempMin < 8) add('warm-layer', 'Warm layer', `Temperatures may fall to ${day.tempMin}°C.`);
  if (day.tempMax - day.tempMin >= 10) add('layers', 'Light layers', `The temperature ranges from ${day.tempMin}°C to ${day.tempMax}°C.`);
  if (day.windMs >= 10) add('windproof-layer', 'Windproof layer', `Wind may reach ${day.windKmh} km/h.`);
  if (day.tempMax >= 24) add('breathable-clothes', 'Light, breathable clothing', `Temperatures may reach ${day.tempMax}°C.`);

  if (activities.includes('sightseeing')) {
    add('walking-shoes', 'Comfortable walking shoes', 'Sightseeing often means spending much of the day on your feet.');
    add('day-bag', 'Small day bag', 'Keep daily essentials close while you explore.');
  }
  if (activities.includes('hiking')) {
    add('hiking-footwear', 'Hiking footwear', 'Choose shoes or boots with suitable grip for the route.');
    add('water-bottle', 'Water bottle', 'Carry water for the hike.');
  }
  if (activities.includes('dining')) {
    add('dining-outfit', 'An outfit for dining out', 'Pack something suitable for your planned evening out.');
  }

  if (!items.length) add('everyday-clothes', 'Comfortable everyday clothes', 'A useful base for your day, whatever the weather.');
  return items;
}

function buildPackingPlan(days, requestedActivities = []) {
  const activities = ACTIVITY_OPTIONS.filter((activity) => requestedActivities.includes(activity));
  return {
    activities,
    days: days.map((day) => ({
      date: day.date,
      label: day.label,
      dateLabel: day.dateLabel,
      condition: day.condition,
      tempMin: day.tempMin,
      tempMax: day.tempMax,
      windKmh: day.windKmh,
      packingList: recommendDayPacking(day, activities),
    })),
  };
}

module.exports = { ACTIVITY_OPTIONS, buildPackingPlan };
