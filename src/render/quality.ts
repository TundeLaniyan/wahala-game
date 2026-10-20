export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityProfile {
  level: QualityLevel;
  /** Upper bound for devicePixelRatio. */
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  particleDensity: number;
  crowd: number;
  antialias: boolean;
}

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  low: {
    level: 'low',
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    particleDensity: 0.4,
    crowd: 40,
    antialias: false,
  },
  medium: {
    level: 'medium',
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    particleDensity: 0.75,
    crowd: 90,
    antialias: true,
  },
  high: {
    level: 'high',
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    particleDensity: 1,
    crowd: 150,
    antialias: true,
  },
};
