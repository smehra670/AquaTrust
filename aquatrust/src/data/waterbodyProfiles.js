/**
 * Demo narrative context for waterbody story panels.
 * Contextual / illustrative fields (rainfall, land cover, actions) are marked
 * as demo — not live sensor feeds. Measurement values still come from
 * observation + trust engine data.
 */

function profile(overrides) {
  return {
    areaLabel: 'London',
    waterbodyType: 'River',
    dissolvedOxygen: null,
    officialCount: 8,
    citizenCount: 12,
    lastOfficialSample: 'Recent official sample',
    lastCitizenReport: 'Today',
    change30d: {
      turbidityPct: 8,
      temperaturePct: 4,
      phNote: 'roughly stable',
    },
    surroundings: {
      rainfall7d: 'Moderate',
      rainfallTrend: '→',
      urbanCoverage: 'High',
      riparianVegetation: 'Moderate',
      litterReports: 2,
    },
    actions: [
      'More citizen observations would strengthen local coverage',
      'Repeat key measurements after heavy rainfall',
    ],
    ...overrides,
  }
}

export const WATERBODY_PROFILES = {
  1: profile({
    waterbodyType: 'River',
    dissolvedOxygen: 8.1,
    officialCount: 18,
    citizenCount: 24,
    lastOfficialSample: '10 Sep 2026',
    lastCitizenReport: 'Today, 14:32',
    change30d: { turbidityPct: 5, temperaturePct: 3, phNote: 'roughly stable' },
    surroundings: {
      rainfall7d: 'Moderate',
      rainfallTrend: '→',
      urbanCoverage: 'Very high',
      riparianVegetation: 'Low',
      litterReports: 6,
    },
    actions: [
      'Keep reporting after rainfall events',
      'Photograph probe placement clearly',
      'Compare with nearby Thames readings',
    ],
  }),
  2: profile({
    waterbodyType: 'Canal',
    dissolvedOxygen: 7.2,
    officialCount: 9,
    citizenCount: 16,
    lastOfficialSample: '8 Sep 2026',
    lastCitizenReport: 'Today, 13:18',
    change30d: { turbidityPct: 11, temperaturePct: 2, phNote: 'slight rise' },
    surroundings: {
      rainfall7d: 'High',
      rainfallTrend: '↑',
      urbanCoverage: 'High',
      riparianVegetation: 'Moderate',
      litterReports: 3,
    },
    actions: [
      'Improve photo quality for verification',
      'Add a second reading near Camden Lock',
    ],
  }),
  3: profile({
    waterbodyType: 'River',
    dissolvedOxygen: 6.4,
    officialCount: 11,
    citizenCount: 29,
    lastOfficialSample: '9 Sep 2026',
    lastCitizenReport: 'Today, 14:10',
    change30d: { turbidityPct: 9, temperaturePct: 4, phNote: 'unusual drop' },
    surroundings: {
      rainfall7d: 'High',
      rainfallTrend: '↑',
      urbanCoverage: 'High',
      riparianVegetation: 'Moderate',
      litterReports: 5,
    },
    actions: [
      'Verify possible acidification event with another reading',
      'Check upstream Lea sites',
      'Protect bank vegetation around Hackney Wick',
    ],
  }),
  4: profile({
    waterbodyType: 'River',
    dissolvedOxygen: 6.5,
    officialCount: 10,
    citizenCount: 27,
    lastOfficialSample: '9 Sep 2026',
    lastCitizenReport: 'Today, 14:22',
    change30d: { turbidityPct: 10, temperaturePct: 3, phNote: 'unusual drop' },
    surroundings: {
      rainfall7d: 'High',
      rainfallTrend: '↑',
      urbanCoverage: 'High',
      riparianVegetation: 'Moderate',
      litterReports: 4,
    },
    actions: [
      'Cross-check with Hackney Wick and Clapton reports',
      'Request verification for this unusual event',
    ],
  }),
  5: profile({
    waterbodyType: 'River',
    dissolvedOxygen: 6.3,
    officialCount: 10,
    citizenCount: 28,
    lastOfficialSample: '9 Sep 2026',
    lastCitizenReport: 'Today, 14:35',
    change30d: { turbidityPct: 8, temperaturePct: 5, phNote: 'unusual drop' },
    surroundings: {
      rainfall7d: 'High',
      rainfallTrend: '↑',
      urbanCoverage: 'High',
      riparianVegetation: 'Moderate',
      litterReports: 5,
    },
    actions: [
      'Keep clustered Lea readings in review, not discarded',
      'Add photos upstream of Clapton',
    ],
  }),
  6: profile({
    waterbodyType: 'Canal',
    dissolvedOxygen: 7.6,
    officialCount: 13,
    citizenCount: 31,
    lastOfficialSample: '11 Sep 2026',
    lastCitizenReport: 'Today, 12:56',
    change30d: { turbidityPct: 7, temperaturePct: 5, phNote: 'roughly stable' },
    surroundings: {
      rainfall7d: 'High',
      rainfallTrend: '↑',
      urbanCoverage: 'High',
      riparianVegetation: 'Moderate',
      litterReports: 3,
    },
    actions: [
      'Protect bank vegetation near Paddington Basin',
      'More observations west of the basin',
    ],
  }),
  // Matches the demo storyboard for Little Venice
  7: profile({
    waterbodyType: 'Canal',
    dissolvedOxygen: 7.8,
    officialCount: 14,
    citizenCount: 38,
    lastOfficialSample: '12 Sep 2026',
    lastCitizenReport: '2h ago',
    change30d: { turbidityPct: 14, temperaturePct: 6, phNote: 'roughly stable' },
    surroundings: {
      rainfall7d: 'High',
      rainfallTrend: '↑',
      urbanCoverage: 'High',
      riparianVegetation: 'Moderate',
      litterReports: 4,
    },
    actions: [
      'Protect bank vegetation',
      'More observations needed west of site',
      'Repeat turbidity measurement after rainfall',
    ],
  }),
  8: profile({
    waterbodyType: 'River',
    dissolvedOxygen: 7.0,
    officialCount: 7,
    citizenCount: 15,
    lastOfficialSample: '7 Sep 2026',
    lastCitizenReport: 'Today, 09:41',
    change30d: { turbidityPct: 22, temperaturePct: 3, phNote: 'roughly stable' },
    surroundings: {
      rainfall7d: 'High',
      rainfallTrend: '↑',
      urbanCoverage: 'High',
      riparianVegetation: 'Low',
      litterReports: 7,
    },
    actions: [
      'Repeat turbidity after rainfall',
      'Improve photo quality for verification',
    ],
  }),
  9: profile({
    waterbodyType: 'River',
    dissolvedOxygen: null,
    officialCount: 6,
    citizenCount: 9,
    lastOfficialSample: '5 Sep 2026',
    lastCitizenReport: 'Yesterday',
    change30d: { turbidityPct: 4, temperaturePct: 2, phNote: 'invalid reading' },
    surroundings: {
      rainfall7d: 'Moderate',
      rainfallTrend: '→',
      urbanCoverage: 'High',
      riparianVegetation: 'Moderate',
      litterReports: 2,
    },
    actions: [
      'Discard physically impossible pH and resample',
      'Calibrate or replace the citizen probe',
    ],
  }),
  10: profile({
    waterbodyType: 'River',
    dissolvedOxygen: 7.4,
    officialCount: 5,
    citizenCount: 8,
    lastOfficialSample: '6 Sep 2026',
    lastCitizenReport: 'Yesterday',
    change30d: { turbidityPct: 12, temperaturePct: 7, phNote: 'roughly stable' },
    surroundings: {
      rainfall7d: 'Moderate',
      rainfallTrend: '→',
      urbanCoverage: 'High',
      riparianVegetation: 'Moderate',
      litterReports: 3,
    },
    actions: [
      'Add nearby observations to strengthen agreement',
      'Improve photo quality',
    ],
  }),
  11: profile({
    waterbodyType: 'River',
    dissolvedOxygen: 8.0,
    officialCount: 12,
    citizenCount: 21,
    lastOfficialSample: '11 Sep 2026',
    lastCitizenReport: 'Today, 10:14',
    change30d: { turbidityPct: 3, temperaturePct: 2, phNote: 'roughly stable' },
    surroundings: {
      rainfall7d: 'Low',
      rainfallTrend: '↓',
      urbanCoverage: 'High',
      riparianVegetation: 'High',
      litterReports: 1,
    },
    actions: [
      'Maintain regular New River sampling',
      'Share high-quality photos for education',
    ],
  }),
  12: profile({
    waterbodyType: 'Canal',
    dissolvedOxygen: 7.7,
    officialCount: 11,
    citizenCount: 26,
    lastOfficialSample: '10 Sep 2026',
    lastCitizenReport: 'Today, 10:28',
    change30d: { turbidityPct: 6, temperaturePct: 3, phNote: 'roughly stable' },
    surroundings: {
      rainfall7d: 'Moderate',
      rainfallTrend: '→',
      urbanCoverage: 'Very high',
      riparianVegetation: 'Low',
      litterReports: 4,
    },
    actions: [
      'Continue Kings Cross canal corridor coverage',
      'Watch turbidity after construction runoff',
    ],
  }),
}

export function getWaterbodyProfile(observationId) {
  return WATERBODY_PROFILES[observationId] || profile({})
}
