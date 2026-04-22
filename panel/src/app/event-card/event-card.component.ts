import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-event-card',
  templateUrl: './event-card.component.html',
  styleUrls: ['./event-card.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon],
})
export class EventCardComponent {
  @Input({ required: true }) titulo!: string;
  @Input({ required: true }) descricao!: string;
  @Input() data?: string;
  @Input() icone = 'calendar-outline';
}
