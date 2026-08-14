import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';

// Zoneless, not the zone.js environment: the app has no
// provideZoneChangeDetection anywhere and Angular 21 is zoneless by default, so
// pulling zone.js in for tests only would have the suite exercise a change
// detection model production never runs.
setupZonelessTestEnv();
