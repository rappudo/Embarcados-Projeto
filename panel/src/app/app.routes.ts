import { Routes } from "@angular/router";

import { authGuard } from "./core/auth/auth.guard";

export const routes: Routes = [
  // ---------- public ----------
  {
    path: "login",
    loadComponent: () =>
      import("./features/login/login.page").then((m) => m.LoginPage),
  },

  // ---------- authenticated app ----------
  {
    path: "dashboard",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/dashboard/dashboard.page").then(
        (m) => m.DashboardPage,
      ),
  },
  {
    path: "employees",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/employees/employees.page").then(
        (m) => m.EmployeesPage,
      ),
  },
  {
    path: "employees/:id",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/employee-detail/employee-detail.page").then(
        (m) => m.EmployeeDetailPage,
      ),
  },
  {
    path: "events",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/events/events.page").then((m) => m.EventsPage),
  },
  {
    path: "reports",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/reports/reports.page").then((m) => m.ReportsPage),
  },
  {
    path: "settings",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/settings/settings.page").then((m) => m.SettingsPage),
  },

  // ---------- defaults ----------
  { path: "", redirectTo: "dashboard", pathMatch: "full" },
  { path: "**", redirectTo: "dashboard" },
];
