// Capture bookmarks (SPEC section 15). Names match the reference images in references/.
// Milestone 1 has no ship, so every camera is in world space near the origin.

export type WeatherName = 'rising' | 'gale' | 'worst' | 'light';

export interface Bookmark {
  name: string;
  milestone: number;
  camera: {
    position: [number, number, number];
    /** Compass bearing the camera faces, degrees. */
    bearing: number;
    /** Pitch above the horizon, degrees (negative looks down). */
    pitch: number;
    fov?: number;
  };
  weather: WeatherName;
  /** Simulation time the shot starts settling from, seconds. Chooses the wave arrangement. */
  time: number;
  /** A lightning strike forced for this shot (bearing in degrees, distance in meters). */
  strike?: { bearing: number; distance: number };
}

/**
 * Bearing of the dusk sun. The hero wind blows from the same side, so waves run toward the low cameras
 * with the sun behind their crests (the backlit look of dusk__sea_low).
 */
export const HERO_BEARING = 280;

export const BOOKMARKS: Readonly<Record<string, Bookmark>> = {
  sea_low: {
    name: 'sea_low',
    milestone: 1,
    // Low in a trough, looking upwind toward the low sun at a crest rising about 40 m ahead
    // (time chosen with the CPU reference sum of the two largest cascades).
    camera: { position: [0, 1, 0], bearing: HERO_BEARING, pitch: 4 },
    weather: 'gale',
    time: 16.5,
  },
  sea_high: {
    name: 'sea_high',
    milestone: 1,
    camera: { position: [0, 25, 0], bearing: HERO_BEARING - 12, pitch: -6 },
    weather: 'gale',
    time: 40,
  },
  horizon_lightning: {
    name: 'horizon_lightning',
    milestone: 1,
    camera: { position: [0, 6, 0], bearing: 200, pitch: 3 },
    weather: 'gale',
    time: 40,
    strike: { bearing: 200, distance: 4000 },
  },
  storm_sky: {
    name: 'storm_sky',
    milestone: 1,
    camera: { position: [0, 8, 0], bearing: HERO_BEARING, pitch: 15 },
    weather: 'gale',
    time: 40,
  },
};

export const MILESTONE_1_BOOKMARKS = Object.values(BOOKMARKS).filter((b) => b.milestone === 1);
