// Thin wrapper around the OpenWeatherMap Web API.
// Every call is made from the server, so the API key never reaches the browser.

const BASE_URL = 'https://api.openweathermap.org';

// An error that carries the HTTP status our own API should answer with
class OpenWeatherError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'OpenWeatherError';
    this.status = status;
  }
}

// Sends one GET request to OpenWeatherMap and returns the parsed JSON
async function request(path, params) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new OpenWeatherError(
      'The server has no OpenWeatherMap API key. Add it to server/.env and restart the server.',
      500
    );
  }

  const query = new URLSearchParams({ ...params, appid: apiKey });
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}?${query}`);
  } catch (err) {
    throw new OpenWeatherError('Could not reach OpenWeatherMap. Check the internet connection.', 502);
  }

  if (response.status === 401) {
    throw new OpenWeatherError(
      'OpenWeatherMap rejected the API key. New keys can take a couple of hours to activate.',
      502
    );
  }
  if (response.status === 429) {
    throw new OpenWeatherError('OpenWeatherMap rate limit reached. Please try again in a minute.', 502);
  }
  if (!response.ok) {
    throw new OpenWeatherError(`OpenWeatherMap returned an error (${response.status}).`, 502);
  }
  return response.json();
}

// City name -> coordinates (Geocoding API). Returns null when nothing matches.
async function geocodeCity(city) {
  const results = await request('/geo/1.0/direct', { q: city, limit: 1 });
  if (!Array.isArray(results) || results.length === 0) return null;

  const { name, country, state, lat, lon } = results[0];
  return { name, country, state, lat, lon };
}

// 5 day / 3 hour forecast in metric units (Celsius, wind in m/s)
function getForecast(lat, lon) {
  return request('/data/2.5/forecast', { lat, lon, units: 'metric' });
}

// Current air pollution readings for the coordinates
function getAirPollution(lat, lon) {
  return request('/data/2.5/air_pollution', { lat, lon });
}

module.exports = { OpenWeatherError, geocodeCity, getForecast, getAirPollution };
