import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonToolbar,
} from '@ionic/angular/standalone';
import { EmployeeCardComponent } from '../employee-card/employee-card.component';

interface Funcionario {
  id: number;
  nome: string;
  idade: number;
  dataIngresso: string;
  turno: string;
  perfil: string;
}

interface HorariosPontoMock {
  funcionarios: Funcionario[];
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonToolbar,
    EmployeeCardComponent,
  ],
})
export class DashboardPage implements OnInit {
  private http = inject(HttpClient);

  searchTerm = '';
  selectedTurno: string | null = null;
  selectedFuncionario: Funcionario | null = null;

  funcionarios: Funcionario[] = [];
  turnos: string[] = [];
  funcionariosFiltrados: Funcionario[] = [];

  ngOnInit(): void {
    this.http
      .get<HorariosPontoMock>('assets/mock_data_jsons/horarios_ponto.json')
      .subscribe((data) => {
        this.funcionarios = data.funcionarios;
        this.turnos = [...new Set(data.funcionarios.map((f) => f.turno))].sort();
      });
  }

  filtrarFuncionarios(): void {
    const termo = this.searchTerm.trim().toLowerCase();
    if (!termo) {
      this.funcionariosFiltrados = [];
      return;
    }
    this.funcionariosFiltrados = this.funcionarios.filter((f) => {
      const matchNome = f.nome.toLowerCase().includes(termo);
      const matchTurno = !this.selectedTurno || f.turno === this.selectedTurno;
      return matchNome && matchTurno;
    });
  }

  onTurnoChange(): void {
    if (this.selectedFuncionario && this.selectedTurno && this.selectedFuncionario.turno !== this.selectedTurno) {
      this.selectedFuncionario = null;
    }
    this.filtrarFuncionarios();
  }

  selecionarFuncionario(f: Funcionario): void {
    this.selectedFuncionario = f;
    this.searchTerm = '';
    this.funcionariosFiltrados = [];
  }
}
