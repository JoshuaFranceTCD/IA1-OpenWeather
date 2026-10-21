// Open Weather - Vue 3 client (loaded via CDN, no build tools)

const { createApp, ref, computed } = Vue;

const HISTORY_KEY = 'openWeather.recentCities';
const MAX_HISTORY = 5;

createApp({
  setup() {
    // ---------- Reactive state ----------
    const city = ref('');
    const status = ref('idle');          // idle | loading | success | error
    const errorMessage = ref('');
    const forecast = ref(null);          // filled from GET /api/forecast
    const history = ref(loadHistory());

    // Example cities that show very different weather, useful for a first visit
    const suggestions = ['Dublin', 'Lisbon', 'Reykjavik', 'Dubai'];

    // ---------- Derived state ----------
    // Chips show recent searches if there are any, otherwise the examples
    const chips = computed(() => (history.value.length ? history.value : suggestions));

    // Sky mood: idle until a forecast arrives, then cold | mild | hot | rain
    const mood = computed(() => (forecast.value && forecast.value.mood) || 'idle');

    // True when at least one pollutant is above the "Good" level
    const airAlert = computed(
      () => Boolean(forecast.value && forecast.value.air.available && forecast.value.air.warnings.length)
    );

    // ---------- Actions ----------
    // Calls our own server, which in turn calls OpenWeatherMap
    async function search(name = city.value) {
      const query = name.trim();
      if (!query) return;

      city.value = query;
      status.value = 'loading';
      errorMessage.value = '';

      try {
        const response = await fetch('/api/forecast?city=' + encodeURIComponent(query));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Something went wrong.');

        forecast.value = data;
        status.value = 'success';
        rememberCity(data.city || query);
      } catch (err) {
        errorMessage.value = err.message || 'Could not reach the server.';
        status.value = 'error';
      }
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

    return { city, status, errorMessage, forecast, history, chips, mood, airAlert, search };
  },
}).mount('#app');
