import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-employee-card',
  templateUrl: './employee-card.component.html',
  styleUrls: ['./employee-card.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class EmployeeCardComponent {
  @Input({ required: true }) nome!: string;
  @Input() idade?: number;
  @Input() dataIngresso?: string;
  @Input() foto = 'assets/Images/Profile_Placeholder.jpg';
}
