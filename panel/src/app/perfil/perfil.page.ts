import { Component, OnInit, inject, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonChip,
  IonAvatar,
  IonButton,
  IonPopover,
} from '@ionic/angular/standalone';

interface EnderecoEmpresa {
  logradouro: string;
  complemento: string;
  cidade: string;
  estado: string;
  cep: string;
}

interface PerfilUsuario {
  nome: string;
  sobrenome: string;
  telefone: string;
  email: string;
  cargo: string;
  departamento: string;
  matricula: string;
  dataAdmissao: string;
  turno: string;
  localizacao: string;
  fotoPerfil: string;
  bio: string;
}

interface EmpresaPerfil {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  setor: string;
  endereco: EnderecoEmpresa;
  telefoneCorporativo: string;
  site: string;
}

interface PerfilCorporativoData {
  perfil: PerfilUsuario;
  empresa: EmpresaPerfil;
}

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    IonContent,
    IonHeader,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel,
    IonChip,
    IonAvatar,
    IonButton,
    IonPopover,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PerfilPage implements OnInit {
  private http = inject(HttpClient);

  perfil?: PerfilUsuario;
  empresa?: EmpresaPerfil;

  ngOnInit(): void {
    this.http
      .get<PerfilCorporativoData>('/assets/mock_data_jsons/perfil_corporativo.json')
      .subscribe((data) => {
        this.perfil = data.perfil;
        this.empresa = data.empresa;
      });
  }

  get nomeCompleto(): string {
    if (!this.perfil) return '';
    return `${this.perfil.nome} ${this.perfil.sobrenome}`;
  }

  get dataAdmissaoFormatada(): string {
    if (!this.perfil?.dataAdmissao) return '';
    const [ano, mes, dia] = this.perfil.dataAdmissao.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  get enderecoFormatado(): string {
    if (!this.empresa) return '';
    const { logradouro, complemento, cidade, estado, cep } = this.empresa.endereco;
    return `${logradouro}, ${complemento} — ${cidade}/${estado} — CEP ${cep}`;
  }
}
