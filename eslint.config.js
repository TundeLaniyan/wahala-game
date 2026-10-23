import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Dependency rule: the simulation is pure. It may not touch rendering, UI, DOM or audio.
const simBoundary = {
  patterns: [
    {
      group: ['three', 'three/*', 'react', 'react-dom', 'react/*', 'zustand'],
      message: 'src/sim must stay framework-free.',
    },
    {
      group: ['**/render/**', '**/ui/**', '**/audio/**', '**/input/**', '**/app/**', '**/ai/**'],
      message: 'src/sim may not depend on outer layers.',
    },
  ],
};
const aiBoundary = {
  patterns: [
    {
      group: ['three', 'three/*', 'react', 'react-dom', 'zustand'],
      message: 'src/ai must stay framework-free.',
    },
    {
      group: ['**/render/**', '**/ui/**', '**/audio/**', '**/input/**', '**/app/**'],
      message: 'src/ai may only depend on src/sim.',
    },
  ],
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'reference', 'e2e-shots', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', simBoundary],
      'no-restricted-globals': ['error', 'window', 'document', 'performance', 'navigator'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng in src/sim/rng.ts.' },
        { object: 'Date', property: 'now', message: 'Simulation time is measured in ticks.' },
      ],
    },
  },
  {
    files: ['src/ai/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', aiBoundary],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'AI must use the seeded Rng.' },
      ],
    },
  },
);
