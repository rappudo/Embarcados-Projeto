import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonContent, CommonModule, FormsModule, RouterLink],
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
