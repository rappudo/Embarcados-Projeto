import { Component, inject } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from "@angular/router";
import {
  IonApp,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenu,
  IonMenuToggle,
  IonNote,
  IonSplitPane,
  IonTitle,
  IonToolbar,
  MenuController,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  documentTextOutline,
  gridOutline,
  listOutline,
  logOutOutline,
  peopleOutline,
  settingsOutline,
  videocamOutline,
} from "ionicons/icons";

import { AuthService } from "./core/auth/auth.service";

/**
 * Root shell.
 *
 * Pattern: an `<ion-split-pane>` wraps the menu and the outlet. On
 * desktop widths (>= 992px Ionic default) the menu sits permanently
 * visible alongside the page; on phones it slides out from the left.
 *
 * The menu lives here (not in each page) so it's instantly available
 * after login without a re-render. Every page just needs to add an
 * `<ion-menu-button>` to its header to trigger the drawer on small
 * screens.
 *
 * The `contentId` <-> `[contentId]` linkage is mandatory — without
 * it the menu doesn't know which DOM region it's overlaying.
 */
@Component({
  selector: "app-root",
  templateUrl: "app.component.html",
  styleUrls: ["app.component.scss"],
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    IonApp,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonMenu,
    IonMenuToggle,
    IonNote,
    IonSplitPane,
    IonTitle,
    IonToolbar,
  ],
})
export class AppComponent {
  /** Menu shown only when authenticated — keeps the login screen clean. */
  readonly auth = inject(AuthService);
  private menu = inject(MenuController);
  private router = inject(Router);

  /** Static menu config — pairs page route with label and icon. */
  readonly menuItems = [
    { url: "/dashboard", label: "Dashboard", icon: "grid-outline" },
    { url: "/employees", label: "Funcionários", icon: "people-outline" },
    { url: "/events", label: "Eventos", icon: "list-outline" },
    { url: "/reports", label: "Relatórios", icon: "document-text-outline" },
    { url: "/settings", label: "Configurações", icon: "settings-outline" },
  ];

  constructor() {
    addIcons({
      documentTextOutline,
      gridOutline,
      listOutline,
      logOutOutline,
      peopleOutline,
      settingsOutline,
      videocamOutline,
    });
  }

  /** Bound to the "Sair" menu item. Closes drawer first, then signs out. */
  async logout(): Promise<void> {
    await this.menu.close("main-menu");
    this.auth.logout();
    // AuthService.logout() already navigates to /login; nothing else to do.
    void this.router; // keep import linted-clean
  }
}
