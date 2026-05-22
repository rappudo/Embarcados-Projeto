# Panel tests

Jasmine + Karma + headless Chromium. No backend or browser interaction
needed — every HTTP call is mocked via `HttpTestingController`.

## Running

```bash
# from panel/
CHROME_BIN=/usr/bin/chromium npm test -- --watch=false --browsers=ChromeHeadlessCI
```

For local development with hot reload (and a real browser window):

```bash
CHROME_BIN=/usr/bin/chromium npm test -- --browsers=Chrome
```

The `ChromeHeadlessCI` launcher is defined in `karma.conf.js` and adds
`--no-sandbox --disable-gpu` for systems where Chromium can't open a
sandboxed renderer.

## Coverage

| File                                          | Coverage                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `core/auth/auth.service.spec.ts`              | login stores token + flips signal, logout wipes + navigates, isAuthenticated handles missing/malformed/expired/valid tokens (and evicts stale tokens) |
| `core/auth/auth.interceptor.spec.ts`          | Bearer header attached for protected requests, skipped for /auth/, proactive expiry short-circuits the request, backend 401 triggers logout (but not on /auth/login) |
| `core/auth/auth.guard.spec.ts`                | allows authenticated, returns UrlTree('/login') otherwise, uses the strict `isAuthenticated()` (not the cheap signal) |
| `core/api/employees.service.spec.ts`          | URL + method + payload shape for list/get/create/update/delete                      |
| `core/api/users.service.spec.ts`              | list + create                                                                       |
| `core/api/analytics.service.spec.ts`          | URLs for all 4 endpoints                                                            |
| `core/api/events.service.spec.ts`             | no-filter omits all params, partial filters emit only the supplied keys             |
| `core/api/presence.service.spec.ts`           | list() GETs /analytics/present-today                                                |
| `core/api/system.service.spec.ts`             | health() requests text (not JSON), mqttStatus()                                     |
| `core/api/enrollment.service.spec.ts`         | enrollVector() converts Float32Array → number[] in POST body                        |
| `employees/employees.service.spec.ts`         | DTO ↔ Funcionario mapping: shift display-case, sliced date, trim+lowercase on write, null/whitespace shift collapse, partial PATCH semantics |
| `analytics/analytics.service.spec.ts`         | legacy AnalyticsService — URL/method/params for all 6 endpoints, partial events() filters |
| `login/login.page.spec.ts`                    | success navigates + clears password, 401 / 0 / 500 each set the right Portuguese message, double-submit guard, errorMessage cleared on new submit |
| `dashboard/dashboard.page.spec.ts`            | initial wiring (employees, KPIs, turnos), tab switching, search/turno filter, cadastro (success + 400/0/other errors + double-submit), removerFuncionario, logout, loadUnknowns 7-day window, formatters, accessByHour mapping, avgDelay tolerance, heatmap aggregation |
| Component smoke tests (`*.component.spec.ts`) | each standalone component instantiates without throwing                             |

Total: 88 tests across 21 files.

### Coverage numbers (most recent CI run)

| Metric     | %      | Covered / Total |
| ---------- | ------ | --------------- |
| Statements | 57.12% | 417 / 730       |
| Functions  | 67.28% | 109 / 162       |
| Lines      | 57.87% | 375 / 648       |
| Branches   | 50.28% | 87 / 173        |

## Design notes

- **No real network.** `provideHttpClientTesting()` replaces the HTTP
  backend with `HttpTestingController`. Tests build an expected request
  with `httpMock.expectOne(url)`, assert its shape, and `flush()` a
  response. Verification at `afterEach` proves no extra requests were
  silently dispatched.
- **No real router.** `provideRouter([])` registers an empty route
  table; navigation calls are spied on rather than executed. This keeps
  tests free of `NG04002: Cannot match any routes` noise.
- **No real Ionic overlays.** `provideIonicAngular()` registers
  `ModalController` / `ToastController` for components that inject
  them; the interceptor's toast controller is overridden with a no-op
  stub to keep the test silent.
- **localStorage is cleaned between tests.** Auth tests start each
  case with `localStorage.clear()` so the `AuthService` signal starts
  in a deterministic state.

## Continuous integration

The `panel` job in `.github/workflows/ci.yml` runs `npm ci` (rejects
package.json ↔ package-lock.json drift) then the Karma suite under
`google-chrome` (preinstalled at `/usr/bin/google-chrome` on the
ubuntu-latest runner, picked up via `CHROME_BIN`). The
`ChromeHeadlessCI` launcher in `karma.conf.js` passes `--no-sandbox
--disable-gpu`, both required inside the runner sandbox.

### Coverage

CI adds `--code-coverage` to the test command. `karma-coverage` is
already wired in `karma.conf.js` with `text-summary` (prints percentages
to the build log) + `html` (`panel/coverage/app/`) reporters. The HTML
directory is uploaded as the `panel-coverage` workflow artifact.

To reproduce locally:

```bash
CHROME_BIN=/usr/bin/chromium npm test -- \
  --watch=false --browsers=ChromeHeadlessCI --code-coverage
# Browse: panel/coverage/app/index.html
```

## Not yet covered

- Browser-side face embedding (`core/vision/face-embedding.service.ts`)
  — depends on `onnxruntime-web` loading a 130 MB model. Out of scope
  for unit tests; should be covered with an e2e or manual test.
- `EnrollmentWizardComponent` — wires `getUserMedia` + ONNX inference
  + the enrollment service. The unit tests cover the HTTP service the
  wizard ultimately calls; the wizard's camera/ONNX state machine
  needs the same e2e harness as `face-embedding.service`.
- DashboardPage CSV export — uses `Blob` + `URL.createObjectURL` + DOM
  manipulation to trigger a download. Tested manually; not unit-testable
  cleanly.
- DashboardPage SVG pie segment paths — pure visual computation,
  better validated with a snapshot/visual regression tool.
- `cadastro.page` / `home.page` — only smoke tests; their concrete
  behavior is mostly view-layer.
