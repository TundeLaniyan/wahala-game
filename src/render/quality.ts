export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityProfile {
  level: QualityLevel;
  /** Upper bound for devicePixelRatio. */
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  particleDensity: number;
  crowd: number;
  /** Fraction of the parked buses drawn (each is ~11k triangles). */
  parkedBuses: number;
  antialias: boolean;
  /** Pooled point lights that let explosions light the surrounding props and players. */
  flameLights: number;
}

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  low: {
    level: 'low',
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    particleDensity: 0.4,
    crowd: 70,
    parkedBuses: 0.4,
    antialias: false,
    flameLights: 0,
  },
  medium: {
    level: 'medium',
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    particleDensity: 0.75,
    crowd: 170,
    parkedBuses: 0.75,
    antialias: true,
    flameLights: 1,
  },
  high: {
    level: 'high',
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    particleDensity: 1,
    crowd: 320,
    parkedBuses: 1,
    antialias: true,
    flameLights: 3,
  },
};
