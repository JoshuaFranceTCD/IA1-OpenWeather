// Trip Forecaster - Vue 3 client (loaded via CDN, no build tools)

const { createApp, ref, computed } = Vue;

const HISTORY_KEY = 'openWeather.recentCities';
const SAVED_PACKING_KEY = 'openWeather.savedPackingChecklists';
const MAX_HISTORY = 5;
const SKY_GRADIENTS = {
  idle: ['#6477a8', '#b7a9d0'],
  hot: ['#f4a261', '#f6bd8b'],
  cold: ['#8ed5f2', '#d9f1fb'],
  mild: ['#aeb8c5', '#e2e6eb'],
  rain: ['#526b8a', '#9aacc1'],
  clear: ['#70b7df', '#f3dca2'],
  clouds: ['#8996a5', '#d6dce2'],
  drizzle: ['#6ca9b5', '#b7d8d7'],
  thunderstorm: ['#454d70', '#8585a8'],
  snow: ['#9bcde0', '#e2f3f7'],
  atmosphere: ['#bf9b70', '#ead3ad'],
};

createApp({
  setup() {
    // ---------- Reactive state ----------
    const city = ref('');
    const status = ref('idle');          // idle | loading | success | error
    const errorMessage = ref('');
    const forecast = ref(null);          // filled from GET /api/forecast
    const history = ref(loadHistory());
    const selectedActivities = ref([]);
    const checkedItems = ref({});
    const savedChecklists = ref(loadSavedChecklists());
    const currentSavedId = ref(null);
    const currentTime = ref(Date.now());
    setInterval(() => { currentTime.value = Date.now(); }, 60000);
    const saveMessage = ref('');
    const packingStatus = ref('idle');
    const packingResult = ref(null);
    const packingError = ref('');
    let packingRequestId = 0;
    let searchRequestId = 0;
    const activityOptions = [
      { id: 'sightseeing', label: 'Sightseeing' },
      { id: 'hiking', label: 'Hiking' },
      { id: 'dining', label: 'Dining out' },
    ];

    // Example cities that show very different weather, useful for a first visit
    const suggestions = ['Dublin', 'Lisbon', 'Reykjavik', 'Dubai'];

    const abs = ref("red");

    // ---------- Derived state ----------
    // Chips show recent searches if there are any, otherwise the examples
    const chips = computed(() => (history.value.length ? history.value : suggestions));

    // Vue recomputes the mood and gradient whenever a new forecast is assigned.
    const mood = computed(() => {
      if (!forecast.value) return 'idle';
      const avgTemp = Number(forecast.value.packing && forecast.value.packing.avgTemp);
      if (avgTemp > 20) return 'hot';
      if (avgTemp < 8) return 'cold';
      return forecast.value.mood || 'mild';
    });

    const skyStyle = computed(() => {
      const [top, bottom] = SKY_GRADIENTS[mood.value] || SKY_GRADIENTS.mild;
      return { '--sky-top': top, '--sky-bottom': bottom };
    });
    console.log('Initial skyStyle:', skyStyle.value);

    // True when at least one pollutant is above the "Good" level
    const airAlert = computed(
      () => Boolean(forecast.value && forecast.value.air.available && forecast.value.air.warnings.length)
    );

    const sunArcStyle = computed(() => {
      const sun = forecast.value && forecast.value.sun;
      if (!sun || !sun.sunrise || !sun.sunset) return { sunTransform: 'rotate(-90 100 100)' };
      const now = currentTime.value / 1000;
      const progress = Math.max(0, Math.min(1, (now - sun.sunrise) / (sun.sunset - sun.sunrise)));
      return { sunTransform: `rotate(${-90 + progress * 180} 100 100)` };
    });
    const daylightHours = computed(() => {
      const sun = forecast.value && forecast.value.sun;
      if (!sun || !sun.sunrise || !sun.sunset) return null;
      return Math.max(0, (sun.sunset - sun.sunrise) / 3600);
    });
    const savedSunTimes = computed(() => {
      const sun = forecast.value && forecast.value.sun;
      if (!sun || !sun.sunrise || !sun.sunset) return null;
      return {
        sunrise: formatSunTime(sun.sunrise),
        sunset: formatSunTime(sun.sunset),
        daylightHours: Math.max(0, (sun.sunset - sun.sunrise) / 3600),
      };
    });
    function formatSunTime(timestamp) {
      const offset = forecast.value?.sun?.timezoneOffset || 0;
      return new Date((timestamp + offset) * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    }
    const packingActivitiesChanged = computed(() => {
      if (!packingResult.value) return false;
      const current = [...selectedActivities.value].sort();
      const returned = [...(packingResult.value.activities || [])].sort();
      return current.length !== returned.length || current.some((activity, index) => activity !== returned[index]);
    });

    function weatherType(condition) {
      if (condition === 'Clear') return 'sunny';
      if (condition === 'Snow') return 'snow';
      if (['Rain', 'Drizzle', 'Thunderstorm'].includes(condition)) return 'rainy';
      return 'cloudy';
    }

    // ---------- Actions ----------
    // Calls our own server, which in turn calls OpenWeatherMap
    async function search(name = city.value) {
      const query = name.trim();
      if (!query) return;
      const requestId = ++searchRequestId;

      city.value = query;
      status.value = 'loading';
      errorMessage.value = '';
      packingRequestId += 1;
      packingResult.value = null;
      packingStatus.value = 'idle';
      checkedItems.value = {};
      currentSavedId.value = null;
      saveMessage.value = '';

      try {
        const params = new URLSearchParams({ city: query });
        const response = await fetch('/api/forecast?' + params.toString());
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Something went wrong.');
        if (requestId !== searchRequestId) return;

        forecast.value = data;
        const [gradientTop, gradientBottom] = SKY_GRADIENTS[mood.value] || SKY_GRADIENTS.mild;
        console.log('Weather background selected:', {
          city: data.city || query,
          averageTemperatureC: data.packing && data.packing.avgTemp,
          mood: mood.value,
          background: `linear-gradient(145deg, ${gradientTop} 0%, ${gradientBottom} 100%)`,
          skyStyle: skyStyle.value
        });
        status.value = 'success';
        rememberCity(data.city || query);
      } catch (err) {
        if (requestId !== searchRequestId) return;
        console.warn(`Weather search failed for "${query}"; background remains unchanged.`, err.message);
        errorMessage.value = err.message || 'Could not reach the server.';
        status.value = 'error';
      }
    }

    async function generatePacking() {
      if (!forecast.value) return;
      const requestId = ++packingRequestId;
      packingStatus.value = 'loading';
      packingError.value = '';
      currentSavedId.value = null;
      checkedItems.value = {};
      try {
        const params = new URLSearchParams({
          city: forecast.value.city,
          activities: selectedActivities.value.join(','),
        });
        const response = await fetch('/api/packing?' + params.toString());
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not create a packing list.');
        if (requestId !== packingRequestId) return;
        data.days.forEach((day) => day.packingList.unshift({
          id: 'sunscreen', label: 'Sunscreen',
          reason: 'Useful during prolonged time outdoors; choose broad-spectrum SPF 30+ and reapply as directed.',
        }));
        packingResult.value = data;
        packingStatus.value = 'success';
      } catch (err) {
        if (requestId !== packingRequestId) return;
        packingError.value = err.message || 'Could not reach the server.';
        packingStatus.value = 'error';
      }
    }

    function togglePacked(dayDate, itemId) {
      const key = `${dayDate}:${itemId}`;
      checkedItems.value[key] = !checkedItems.value[key];
      if (currentSavedId.value) {
        const saved = savedChecklists.value.find((list) => list.id === currentSavedId.value);
        if (saved) {
          saved.checked[key] = checkedItems.value[key];
          persistSavedChecklists();
        }
      }
    }

    function savePackingList() {
      if (!packingResult.value || packingActivitiesChanged.value) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const list = {
        id,
        city: packingResult.value.city,
        country: packingResult.value.country,
        activities: [...packingResult.value.activities],
        sunTimes: savedSunTimes.value,
        days: packingResult.value.days.map((day) => ({ ...day, packingList: day.packingList.map((item) => ({ ...item })) })),
        checked: { ...checkedItems.value },
        savedAt: new Date().toISOString(),
      };
      savedChecklists.value.unshift(list);
      currentSavedId.value = id;
      saveMessage.value = persistSavedChecklists()
        ? 'Checklist saved on this device.'
        : 'Could not save this checklist in browser storage.';
    }

    function toggleSavedPacked(listId, dayDate, itemId) {
      const list = savedChecklists.value.find((entry) => entry.id === listId);
      if (!list) return;
      const key = `${dayDate}:${itemId}`;
      list.checked[key] = !list.checked[key];
      persistSavedChecklists();
    }

    function deleteSavedChecklist(listId) {
      savedChecklists.value = savedChecklists.value.filter((list) => list.id !== listId);
      if (currentSavedId.value === listId) currentSavedId.value = null;
      persistSavedChecklists();
    }

    function persistSavedChecklists() {
      try {
        localStorage.setItem(SAVED_PACKING_KEY, JSON.stringify(savedChecklists.value));
        return true;
      } catch (err) {
        return false;
      }
    }

    function loadSavedChecklists() {
      try {
        const stored = JSON.parse(localStorage.getItem(SAVED_PACKING_KEY));
        return Array.isArray(stored) ? stored : [];
      } catch (err) {
        return [];
      }
    }

    function goHome() {
      searchRequestId += 1;
      packingRequestId += 1;
      status.value = 'idle';
      errorMessage.value = '';
      forecast.value = null;
      packingResult.value = null;
      packingStatus.value = 'idle';
      city.value = '';
      currentSavedId.value = null;
      saveMessage.value = '';
    }

    // ---------- Recent searches (stored in the browser) ----------
    function loadHistory() {
      try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
      } catch (err) {
        return [];
      }
    }

    function rememberCity(name) {
      const updated = [name, ...history.value.filter((c) => c !== name)].slice(0, MAX_HISTORY);
      history.value = updated;
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      } catch (err) {
        // Storage can be unavailable (private mode); the app still works without it
      }
    }

    return { abs, city, status, errorMessage, forecast, history, chips, mood, skyStyle, airAlert, weatherType,
      sunArcStyle, daylightHours, formatSunTime, savedSunTimes,
      activityOptions, selectedActivities, packingStatus, packingResult, packingError, packingActivitiesChanged,
      checkedItems, currentSavedId, togglePacked, generatePacking, savedChecklists, saveMessage, savePackingList,
      toggleSavedPacked, deleteSavedChecklist, goHome, search };
  },
}).mount('#app');
