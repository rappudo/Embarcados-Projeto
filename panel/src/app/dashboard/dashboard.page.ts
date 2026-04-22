import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  nome: string;
  idade: number;
  dataIngresso: string;
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
export class DashboardPage {
  searchTerm = '';
  selectedFuncionario: Funcionario | null = null;
  funcionariosFiltrados: Funcionario[] = [];

  funcionarios: Funcionario[] = [
    { nome: 'Carlos Silva', idade: 32, dataIngresso: '2022-03-15' },
    { nome: 'Fernanda Costa', idade: 28, dataIngresso: '2021-07-08' },
    { nome: 'João Pereira', idade: 41, dataIngresso: '2019-11-22' },
    { nome: 'Ana Souza', idade: 26, dataIngresso: '2023-02-01' },
    { nome: 'Lucas Martins', idade: 35, dataIngresso: '2020-09-10' },
  ];

  filtrarFuncionarios() {
    const termo = this.searchTerm.trim().toLowerCase();
    if (!termo) {
      this.funcionariosFiltrados = [];
      return;
    }
    this.funcionariosFiltrados = this.funcionarios.filter((f) =>
      f.nome.toLowerCase().includes(termo),
    );
  }

  selecionarFuncionario(f: Funcionario) {
    this.selectedFuncionario = f;
    this.searchTerm = '';
    this.funcionariosFiltrados = [];
  }
}
