import { Component, effect, inject } from '@angular/core';

import { SeoService } from '../../core/seo';
import { SiteConfigStore } from '../../stores/site-config.store';
import { EditorialLayoutComponent } from '../editorial-layout/editorial-layout.component';
import { GridLayoutComponent } from '../grid-layout/grid-layout.component';

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
  imports: [EditorialLayoutComponent, GridLayoutComponent],
  templateUrl: './site-home.component.html',
  styleUrl: './site-home.component.scss',
})
export class SiteHomeComponent {
  private readonly siteConfig = inject(SiteConfigStore);
  private readonly seo = inject(SeoService);

  protected readonly layout = this.siteConfig.layout;

  constructor() {
    effect(() => {
      const config = this.siteConfig.config();
      if (!config) {
        return;
      }
      // The home title is the site name alone — "Alexandra Pintea · Alexandra
      // Pintea" is what appending the site name everywhere would produce.
      this.seo.apply({ title: '', description: config.name, path: '/' });
    });
  }
}
