'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface WeatherSummary {
  avg_air_temp: number;
  max_air_temp: number;
  min_air_temp: number;
  avg_track_temp: number;
  max_track_temp: number;
  avg_humidity: number;
  avg_wind_speed: number;
  max_wind_speed: number;
}

interface WeatherWidgetProps {
  sessionId: number;
}

export default function WeatherWidget({ sessionId }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const response = await axios.get(`/api/weather/${sessionId}/summary`);
        setWeather(response.data);
      } catch (error) {
        console.error('Error fetching weather:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center h-32">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="card">
        <div className="text-center text-gray-400 py-8">
          No weather data available
        </div>
      </div>
    );
  }

  const getWeatherIcon = (temp: number) => {
    if (temp > 30) return '☀️';
    if (temp > 20) return '🌤️';
    if (temp > 10) return '⛅';
    return '☁️';
  };

  return (
    <div className="card">
      <h3 className="text-xl font-display font-bold text-white mb-4 flex items-center gap-2">
        <span className="text-2xl">{getWeatherIcon(weather.avg_air_temp)}</span>
        Weather Conditions
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Air Temperature */}
        <div className="bg-carbon-700/50 rounded-lg p-4">
          <div className="text-gray-400 text-xs mb-1">Air Temp</div>
          <div className="text-2xl font-bold text-white">
            {weather.avg_air_temp}°C
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {weather.min_air_temp}° - {weather.max_air_temp}°
          </div>
        </div>

        {/* Track Temperature */}
        <div className="bg-carbon-700/50 rounded-lg p-4">
          <div className="text-gray-400 text-xs mb-1">Track Temp</div>
          <div className="text-2xl font-bold text-orange-400">
            {weather.avg_track_temp}°C
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Max {weather.max_track_temp}°
          </div>
        </div>

        {/* Humidity */}
        <div className="bg-carbon-700/50 rounded-lg p-4">
          <div className="text-gray-400 text-xs mb-1">Humidity</div>
          <div className="text-2xl font-bold text-blue-400">
            {weather.avg_humidity}%
          </div>
          <div className="text-xs text-gray-400 mt-1">
            💧 Average
          </div>
        </div>

        {/* Wind Speed */}
        <div className="bg-carbon-700/50 rounded-lg p-4">
          <div className="text-gray-400 text-xs mb-1">Wind Speed</div>
          <div className="text-2xl font-bold text-green-400">
            {weather.avg_wind_speed} m/s
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Max {weather.max_wind_speed} m/s
          </div>
        </div>
      </div>

      {/* Conditions Summary */}
      <div className="mt-4 p-3 bg-gradient-to-r from-blue-900/20 to-purple-900/20 rounded-lg border border-blue-500/20">
        <div className="text-sm text-gray-300">
          <span className="font-semibold text-white">Track Conditions:</span>
          {' '}
          {weather.avg_track_temp > 45 ? (
            <span className="text-orange-400">Very Hot - High tire degradation expected</span>
          ) : weather.avg_track_temp > 35 ? (
            <span className="text-yellow-400">Hot - Moderate tire wear</span>
          ) : (
            <span className="text-green-400">Optimal - Good grip levels</span>
          )}
        </div>
      </div>
    </div>
  );
}
