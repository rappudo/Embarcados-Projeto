import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
<<<<<<< Updated upstream
import { IonItem, IonLabel, IonInput } from '@ionic/angular/standalone';
import { IonHeader, IonToolbar, IonButton, IonIcon, IonContent } from '@ionic/angular/standalone';
=======
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
>>>>>>> Stashed changes

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
<<<<<<< Updated upstream
  imports: 
  [IonHeader, 
    IonToolbar, 
    IonButton, 
    IonIcon, 
    CommonModule, 
    FormsModule,
    IonContent,
    IonButton,
    FormsModule,
    IonItem,
    IonLabel,
    IonInput
  ]
=======
  imports: [IonContent, CommonModule, FormsModule, RouterLink],
>>>>>>> Stashed changes
})
export class LoginPage implements OnInit {
  email = '';
  password = '';

  constructor() {}

  ngOnInit() {}

  submitLogin() {
    // Por enquanto, apenas limpa os campos (a autenticação pode ser integrada depois).
    this.email = '';
    this.password = '';
  }
}
