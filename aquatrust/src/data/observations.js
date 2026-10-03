/**
 * Demo citizen observations for AquaTrust.
 * Trust levels are NOT hardcoded — they are calculated by src/utils/trustEngine.js.
 *
 * Scenario notes for judges:
 * - IDs 3, 4, 5: River Lea cluster — historically acidic vs baseline ~7.0,
 *   but three nearby users report nearly identical low pH → possible real event.
 * - ID 9: physically impossible pH → Low Trust hard rule.
 * - ID 10: isolated site with no nearby peers → neutral nearby score (50).
 */

export const OBSERVATIONS = [
  // --- Normal, well-supported Thames reading ---
  {
    id: 1,
    siteName: 'River Thames – Westminster',
    lat: 51.5007,
    lng: -0.1246,
    ph: 7.2,
    turbidity: 13,
    temperature: 17.8,
    timestamp: 'Today, 14:32',
    // Demo placeholder — replace with real image analysis later
    photoQuality: 82,
    historicalBaseline: {
      phMean: 7.3,
      phStd: 0.25,
      turbidityMean: 12,
      turbidityStd: 4,
      temperatureMean: 17.2,
      temperatureStd: 1.4,
    },
  },

  // --- Mild disagreement / weaker photo ---
  {
    id: 2,
    siteName: 'Regent’s Canal – Camden',
    lat: 51.5413,
    lng: -0.1462,
    ph: 7.6,
    turbidity: 22,
    temperature: 16.4,
    timestamp: 'Today, 13:18',
    photoQuality: 41,
    historicalBaseline: {
      phMean: 7.4,
      phStd: 0.3,
      turbidityMean: 14,
      turbidityStd: 5,
      temperatureMean: 16.8,
      temperatureStd: 1.2,
    },
  },

  // ============================================================
  // KEY DEMO: River Lea pollution / acidification cluster
  // Historical pH ≈ 7.0, but three nearby citizens report ~5.0
  // Historical consistency LOW · Nearby agreement HIGH
  // → should NOT be discarded as bad data
  // ============================================================
  {
    id: 3,
    siteName: 'River Lea – Hackney Wick',
    lat: 51.5435,
    lng: -0.0225,
    ph: 5.0,
    turbidity: 18,
    temperature: 16.8,
    timestamp: 'Today, 14:10',
    photoQuality: 78,
    historicalBaseline: {
      phMean: 7.0,
      phStd: 0.28,
      turbidityMean: 14,
      turbidityStd: 4.5,
      temperatureMean: 16.5,
      temperatureStd: 1.3,
    },
  },
  {
    id: 4,
    siteName: 'River Lea – Hackney',
    lat: 51.5458,
    lng: -0.0262,
    ph: 5.1,
    turbidity: 19,
    temperature: 16.6,
    timestamp: 'Today, 14:22',
    photoQuality: 74,
    historicalBaseline: {
      phMean: 7.05,
      phStd: 0.3,
      turbidityMean: 13,
      turbidityStd: 4.2,
      temperatureMean: 16.4,
      temperatureStd: 1.2,
    },
  },
  {
    id: 5,
    siteName: 'River Lea – Clapton',
    lat: 51.5412,
    lng: -0.0198,
    ph: 4.9,
    turbidity: 17,
    temperature: 16.9,
    timestamp: 'Today, 14:35',
    photoQuality: 81,
    historicalBaseline: {
      phMean: 6.95,
      phStd: 0.27,
      turbidityMean: 15,
      turbidityStd: 4.8,
      temperatureMean: 16.6,
      temperatureStd: 1.4,
    },
  },

  // --- Normal high-quality canal reading ---
  {
    id: 6,
    siteName: 'Grand Union Canal – Paddington',
    lat: 51.5186,
    lng: -0.1764,
    ph: 7.3,
    turbidity: 9,
    temperature: 16.8,
    timestamp: 'Today, 12:56',
    photoQuality: 79,
    historicalBaseline: {
      phMean: 7.25,
      phStd: 0.22,
      turbidityMean: 10,
      turbidityStd: 3.5,
      temperatureMean: 16.5,
      temperatureStd: 1.1,
    },
  },

  // Nearby peer for Paddington (supports agreement)
  {
    id: 7,
    siteName: 'Grand Union Canal – Little Venice',
    lat: 51.5212,
    lng: -0.1835,
    ph: 7.3,
    turbidity: 15,
    temperature: 18.4,
    timestamp: 'Today, 12:40',
    photoQuality: 86,
    historicalBaseline: {
      phMean: 7.2,
      phStd: 0.2,
      turbidityMean: 13.2,
      turbidityStd: 3.2,
      temperatureMean: 17.3,
      temperatureStd: 1.0,
    },
  },

  // --- Elevated turbidity, needs a second look ---
  {
    id: 8,
    siteName: 'River Brent – Wembley',
    lat: 51.552,
    lng: -0.281,
    ph: 7.0,
    turbidity: 48,
    temperature: 15.9,
    timestamp: 'Today, 09:41',
    photoQuality: 52,
    historicalBaseline: {
      phMean: 7.1,
      phStd: 0.25,
      turbidityMean: 16,
      turbidityStd: 6,
      temperatureMean: 15.5,
      temperatureStd: 1.5,
    },
  },

  // --- Obviously bad / impossible reading ---
  {
    id: 9,
    siteName: 'River Wandle – Morden',
    lat: 51.396,
    lng: -0.186,
    ph: 16.2,
    turbidity: 8,
    temperature: 18.2,
    timestamp: 'Yesterday, 16:47',
    photoQuality: 64,
    historicalBaseline: {
      phMean: 7.4,
      phStd: 0.3,
      turbidityMean: 11,
      turbidityStd: 4,
      temperatureMean: 17.5,
      temperatureStd: 1.3,
    },
  },

  // --- Isolated site: no nearby peers → neutral nearby score ---
  {
    id: 10,
    siteName: 'River Ravensbourne – Lewisham',
    lat: 51.4577,
    lng: -0.013,
    ph: 6.8,
    turbidity: 21,
    temperature: 18.4,
    timestamp: 'Yesterday, 18:09',
    photoQuality: 38,
    historicalBaseline: {
      phMean: 7.1,
      phStd: 0.35,
      turbidityMean: 15,
      turbidityStd: 5,
      temperatureMean: 17.0,
      temperatureStd: 1.6,
    },
  },

  // --- Clean, consistent New River reading ---
  {
    id: 11,
    siteName: 'New River – Islington',
    lat: 51.5388,
    lng: -0.1045,
    ph: 7.5,
    turbidity: 6,
    temperature: 16.2,
    timestamp: 'Today, 10:14',
    photoQuality: 91,
    historicalBaseline: {
      phMean: 7.45,
      phStd: 0.2,
      turbidityMean: 7,
      turbidityStd: 2.5,
      temperatureMean: 16.0,
      temperatureStd: 1.0,
    },
  },

  // Peer for Islington / mild Camden corridor overlap
  {
    id: 12,
    siteName: 'Regent’s Canal – Kings Cross',
    lat: 51.5345,
    lng: -0.1255,
    ph: 7.45,
    turbidity: 8,
    temperature: 16.0,
    timestamp: 'Today, 10:28',
    photoQuality: 88,
    historicalBaseline: {
      phMean: 7.4,
      phStd: 0.22,
      turbidityMean: 8,
      turbidityStd: 3,
      temperatureMean: 15.8,
      temperatureStd: 1.1,
    },
  },
]

export const TRUST_LEVELS = ['high', 'medium', 'low']

export const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'high', label: 'High Trust' },
  { id: 'medium', label: 'Needs verification' },
  { id: 'low', label: 'Low Trust' },
]
