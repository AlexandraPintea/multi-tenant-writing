import { Component, inject } from '@angular/core';

import { SiteConfigStore } from '../stores/site-config.store';
import { EditorialLayout } from './editorial-layout';
import { GridLayout } from './grid-layout';

/**
 * The home route for both tenants.
 *
 * One route, two DOM structures, chosen from the `layout` key the API returns
 * in theme_config. Adding a third site is then a Site row plus a layout value,
 * not a new route or a new build target (architecture §5.1).
 *
 * The default arm is deliberate rather than defensive: an unrecognised layout
 * renders the editorial one instead of a blank page, which is the failure mode
 * you want when someone adds a site and mistypes the key.
 */
@Component({
  selector: 'app-site-home',
  imports: [EditorialLayout, GridLayout],
  template: `
    @switch (layout()) {
      @case ('grid') {
        <app-grid-layout />
      }
      @default {
        <app-editorial-layout />
      }
    }
  `,
})
export class SiteHome {
  protected readonly layout = inject(SiteConfigStore).layout;
}
