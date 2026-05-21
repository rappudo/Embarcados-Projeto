import { ApplicationConfig } from "@angular/core";
import {
  provideRouter,
  withPreloading,
  PreloadAllModules,
  withComponentInputBinding,
} from "@angular/router";
import { provideIonicAngular } from "@ionic/angular/standalone";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideEchartsCore } from "ngx-echarts";

import { routes } from "./app.routes";
import { authInterceptor } from "./core/auth/auth.interceptor";

/**
 * Application-wide providers.
 *
 * - `provideEchartsCore({ echarts: () => import('echarts') })` registers
 *   the ECharts library lazily — it's only fetched and parsed when the
 *   first chart is rendered. Saves ~900kb on initial page load.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideIonicAngular(),
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withComponentInputBinding(),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideEchartsCore({ echarts: () => import("echarts") }),
  ],
};
