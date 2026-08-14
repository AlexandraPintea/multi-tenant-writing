import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SiteConfigStore } from './stores/site-config.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('writing-frontend');
  private readonly siteConfig = inject(SiteConfigStore);

  ngOnInit(): void {
    this.siteConfig.loadSiteConfig();
  }
}
