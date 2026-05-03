import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonItem, IonLabel, IonInput } from '@ionic/angular/standalone';
import { IonHeader, IonToolbar, IonButton, IonIcon, IonContent } from '@ionic/angular/standalone';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
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
})
export class LoginPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
