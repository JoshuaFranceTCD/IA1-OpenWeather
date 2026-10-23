// Trip Forecaster - Express server
// Serves the Vue client from /client and exposes the Web API the client talks to.
// The OpenWeatherMap key stays on the server, so it is never exposed to the browser.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');

const { OpenWeatherError, geocodeCity, getForecast, getAirPollution } = require('./lib/openweather');
const { buildForecast } = require('./lib/forecast');
const { ACTIVITY_OPTIONS, buildPackingPlan } = require('./lib/packing');
const { assessAirQuality } = require('./lib/airQuality');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the client (index.html, app.js, style.css) as static files
app.use(express.static(path.join(__dirname, '..', 'client')));

// GET /api/forecast?city=Dublin
// Geocodes the city, then fetches the forecast and air pollution data and returns one summary.
app.get('/api/forecast', async (req, res) => {
  const city = String(req.query.city || '').trim();

  if (!city) {
    return res.status(400).json({ error: 'Please enter a city name.' });
  }
  if (city.length > 100) {
    return res.status(400).json({ error: 'That city name is too long.' });
  }

  try {
    const location = await geocodeCity(city);
    if (!location) {
      return res
        .status(404)
        .json({ error: `We couldn't find a city called "${city}". Check the spelling and try again.` });
    }

    // The forecast and air pollution calls do not depend on each other, so run them together.
    // Air quality is a bonus: if that call fails the forecast is still returned.
    const [rawForecast, rawAir] = await Promise.all([
      getForecast(location.lat, location.lon),
      getAirPollution(location.lat, location.lon).catch((err) => {
        console.warn('Air pollution request failed:', err.message);
        return null;
      }),
    ]);

    if (!rawForecast.list || rawForecast.list.length === 0) {
      return res.status(502).json({ error: 'OpenWeatherMap returned no forecast data for that city.' });
    }

    res.json({
      city: location.name,
      country: location.country,
      state: location.state || null,
      lat: location.lat,
      lon: location.lon,
      ...buildForecast(rawForecast),
      air: assessAirQuality(rawAir),
      // The free 5-day forecast includes the city's current sunrise and sunset.
      sun: {
        sunrise: rawForecast.city.sunrise,
        sunset: rawForecast.city.sunset,
        timezoneOffset: rawForecast.city.timezone || 0,
      },
    });
  } catch (err) {
    if (err instanceof OpenWeatherError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  }
});

// GET /api/packing?city=Dublin&activities=sightseeing,hiking
// The packing assistant is an independent feature and returns its own response.
app.get('/api/packing', async (req, res) => {
  const city = String(req.query.city || '').trim();
  const requestedActivities = String(req.query.activities || '')
    .split(',')
    .filter((activity) => ACTIVITY_OPTIONS.includes(activity));

  if (!city) return res.status(400).json({ error: 'Please enter a city name.' });
  if (city.length > 100) return res.status(400).json({ error: 'That city name is too long.' });

  try {
    const location = await geocodeCity(city);
    if (!location) {
      return res.status(404).json({ error: `We couldn't find a city called "${city}". Check the spelling and try again.` });
    }

    const rawForecast = await getForecast(location.lat, location.lon);
    if (!rawForecast.list || rawForecast.list.length === 0) {
      return res.status(502).json({ error: 'OpenWeatherMap returned no forecast data for that city.' });
    }

    const forecast = buildForecast(rawForecast);
    res.json({
      city: location.name,
      country: location.country,
      ...buildPackingPlan(forecast.days, requestedActivities),
    });
  } catch (err) {
    if (err instanceof OpenWeatherError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  }
});

app.listen(PORT, () => {
  console.log(`Trip Forecaster running at http://localhost:${PORT}`);
});
