import { Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from "@ionic/angular/standalone";

import { EmployeesService } from "../../core/api/employees.service";
import { EventsService } from "../../core/api/events.service";
import { Employee } from "../../core/models/employee.model";
import {
  AccessEvent,
  AccessStatus,
  EventsQuery,
} from "../../core/models/event.model";
import { EventCardComponent } from "../../shared/event-card/event-card.component";

/** Status filter UI value. 'all' is a UI-only sentinel; the API omits the param. */
type StatusFilter = "all" | AccessStatus;

const PAGE_SIZE = 20;

/**
 * Events list page.
 *
 * Patterns introduced here:
 *   - Two cooperating API services (events + employees-for-filter-dropdown).
 *   - Infinite scroll: `<ion-infinite-scroll>` fires when nearing list bottom.
 *   - Filter signals + reset-and-reload: changing a filter zeros out the
 *     accumulated list and starts from offset=0 again.
 *   - `signal.update(curr => [...curr, ...page])` for race-safe appending.
 */
@Component({
  selector: "app-events",
  templateUrl: "./events.page.html",
  styleUrls: ["./events.page.scss"],
  // Required because we use <router-outlet> instead of <ion-router-outlet>.
  host: { class: "ion-page" },
  imports: [
    EventCardComponent,
    IonButtons,
    IonContent,
    IonHeader,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonItem,
    IonLabel,
    IonList,
    IonMenuButton,
    IonRefresher,
    IonRefresherContent,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class EventsPage implements OnInit {
  private eventsApi = inject(EventsService);
  private employeesApi = inject(EmployeesService);
  private toast = inject(ToastController);
  private destroyRef = inject(DestroyRef);

  // ---------- list state ----------
  readonly events = signal<AccessEvent[]>([]);
  readonly loading = signal(true);
  readonly hasMore = signal(true);

  // ---------- filter state ----------
  readonly filterStatus = signal<StatusFilter>("all");
  readonly filterEmployeeId = signal<number | null>(null);
  readonly employees = signal<Employee[]>([]);

  // Pagination cursor (private — only the load methods touch it).
  private offset = 0;

  ngOnInit(): void {
    // Populate the filter dropdown with all employees.
    this.employeesApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (emps) => this.employees.set(emps),
        error: () => {
          /* non-critical; dropdown will just have "Todos" */
        },
      });

    // Initial fetch.
    this.resetAndLoad();
  }

  // ---------- filter handlers ----------

  onStatusChange(event: CustomEvent): void {
    this.filterStatus.set(event.detail.value as StatusFilter);
    this.resetAndLoad();
  }

  onEmployeeFilterChange(event: CustomEvent): void {
    this.filterEmployeeId.set(event.detail.value);
    this.resetAndLoad();
  }

  // ---------- loading ----------

  /** Resets cursor + list and fetches the first page. */
  private resetAndLoad(): void {
    this.offset = 0;
    this.events.set([]);
    this.hasMore.set(true);
    this.loading.set(true);
    this.fetchPage(() => this.loading.set(false));
  }

  /** Pull-to-refresh handler. */
  onRefresh(event: CustomEvent): void {
    this.offset = 0;
    this.events.set([]);
    this.hasMore.set(true);
    this.fetchPage(() => {
      (event.target as HTMLIonRefresherElement).complete();
    });
  }

  /** Infinite-scroll handler — fetches the next page and appends. */
  onLoadMore(event: CustomEvent): void {
    this.fetchPage(() => {
      (event.target as HTMLIonInfiniteScrollElement).complete();
    });
  }

  /**
   * Fetch one page using the current filter values + offset.
   * `done()` is called once the response (or error) is handled, so the
   * caller can dismiss whatever spinner it owns.
   */
  private fetchPage(done: () => void): void {
    const query: EventsQuery = {
      limit: PAGE_SIZE,
      offset: this.offset,
    };
    if (this.filterStatus() !== "all") {
      query.status = this.filterStatus() as AccessStatus;
    }
    if (this.filterEmployeeId() !== null) {
      query.employee_id = this.filterEmployeeId()!;
    }

    this.eventsApi.list(query).subscribe({
      next: (page) => {
        // Race-safe append: read the latest value, append, write back.
        this.events.update((curr) => [...curr, ...page]);
        this.offset += page.length;
        if (page.length < PAGE_SIZE) {
          this.hasMore.set(false);
        }
        done();
      },
      error: () => {
        done();
        this.showToast("Erro ao carregar eventos.", "danger");
      },
    });
  }

  private async showToast(
    message: string,
    color: "success" | "danger",
  ): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 2500,
      position: "bottom",
      color,
    });
    await t.present();
  }
}
