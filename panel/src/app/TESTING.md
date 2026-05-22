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
| `employees/employees.service.spec.ts`         | DTO ↔ Funcionario mapping: shift display-case, sliced date, trim+lowercase on write, null/whitespace shift collapse, partial PATCH semantics |
| `login/login.page.spec.ts`                    | success navigates + clears password, 401 / 0 / 500 each set the right Portuguese message, double-submit guard, errorMessage cleared on new submit |
| Component smoke tests (`*.component.spec.ts`) | each standalone component instantiates without throwing                             |

Total: 54 tests across 17 files.

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

## Not yet covered

- DashboardPage logic — only the smoke test (`should create`) runs.
  It pulls from multiple services and has chart-rendering side effects
  that need a deeper test setup. A future pass should mock the services
  and assert that the dashboard wires summary/access-by-hour into the
  right UI bindings.
- Browser-side face embedding (`core/vision/face-embedding.service.ts`)
  — depends on `onnxruntime-web` loading a 130 MB model. Out of scope
  for unit tests; should be covered with an e2e or manual test.
- `cadastro.page` / `home.page` — only smoke tests; their concrete
  behavior is mostly view-layer.
