/**
 * Jest replaces Karma and Vitest (requirements §4.2, architecture §5.6).
 *
 * `ng test` cannot run this. Angular 21's unit-test builder accepts only
 * "karma" or "vitest" as its runner, so the angular.json test target is gone
 * and `npm test` is the single entry point.
 *
 * .mjs rather than the .ts the playbook suggests: a TypeScript config would
 * pull in ts-node purely to parse this file. The JSDoc type below gives the
 * same editor checking for nothing.
 *
 * @type {import('jest').Config}
 */
export default {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'html', 'js', 'json', 'mjs'],
  transform: {
    '^.+\\.(ts|js|mjs|html|svg)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.(html|svg)$',
      },
    ],
  },
  // Angular, NgRx, NGXS, ngx-translate and rxjs all ship ESM. Jest runs
  // CommonJS by default and would fail on `export` inside node_modules, so
  // these have to be transformed rather than ignored.
  transformIgnorePatterns: ['node_modules/(?!.*\\.mjs$|@angular|@ngrx|@ngxs|@ngx-translate|rxjs)'],
  collectCoverageFrom: [
    'src/app/**/*.ts',
    '!src/app/**/*.spec.ts',
    // Server-only: imports node:fs and never runs in jsdom.
    '!src/app/i18n/server-translate.loader.ts',
  ],
};
