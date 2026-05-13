import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonButton, IonItem, IonLabel, IonInput, IonCheckbox } from '@ionic/angular/standalone';

@Component({
  selector: 'app-cadastro',
  templateUrl: './cadastro.page.html',
  styleUrls: ['./cadastro.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonButton,
    IonItem,
    IonLabel,
    IonInput,
    IonCheckbox,
    CommonModule,
    FormsModule,
  ],
})
export class CadastroPage implements OnInit {
  nome = '';
  sobrenome = '';
  telefone = '';
  empresa = '';
  email = '';

  agreedToTerms = false;

  constructor() {}

  ngOnInit() {}

  submitCadastro() {
    // Por enquanto, apenas limpa os campos (a persistência/validação server-side pode ser integrada depois).
    this.nome = '';
    this.sobrenome = '';
    this.telefone = '';
    this.empresa = '';
    this.email = '';
    this.agreedToTerms = false;
  }
}
