import { Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonIcon,
  IonPopover,
  IonList,
  IonItem,
  IonLabel,
} from '@ionic/angular/standalone';

type HomeSection = 'about' | 'produtos' | 'contato';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonContent,
    IonButton,
    IonIcon,
    IonPopover,
    IonList,
    IonItem,
    IonLabel,
  ],
})
export class HomePage {
  activeSection: HomeSection = 'about';

  contactEmail = '';
  contactPhone = '';
  contactMessage = '';

  submitContact() {
    this.contactEmail = '';
    this.contactPhone = '';
    this.contactMessage = '';
  }

  @ViewChild(IonContent) private content!: IonContent;
  @ViewChild('aboutTitle', { read: ElementRef }) private aboutTitle!: ElementRef<HTMLElement>;
  @ViewChild('produtosTitle', { read: ElementRef }) private produtosTitle!: ElementRef<HTMLElement>;
  @ViewChild('contatoTitle', { read: ElementRef }) private contatoTitle!: ElementRef<HTMLElement>;

  async setSection(section: HomeSection) {
    this.activeSection = section;

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const titleRef = {
      about: this.aboutTitle,
      produtos: this.produtosTitle,
      contato: this.contatoTitle,
    }[section];

    if (!titleRef?.nativeElement || !this.content) {
      return;
    }

    const scrollElement = await this.content.getScrollElement();
    const offset =
      titleRef.nativeElement.getBoundingClientRect().top -
      scrollElement.getBoundingClientRect().top;

    if (Math.abs(offset) < 1) {
      return;
    }

    await this.content.scrollToPoint(0, scrollElement.scrollTop + offset, 1000);
  }
}