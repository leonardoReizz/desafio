import type { Category } from "@nexo/contracts";

export interface KbArticle {
  id: string;
  title: string;
  category: Category | "geral";
  /** Termos extras que ajudam a busca (sinônimos que o funcionário costuma usar). */
  keywords: string[];
  body: string;
  /** Quando o artigo NÃO resolve e o caminho é abrir chamado. */
  limits: string | null;
}

/** Central de ajuda (Anexo B): artigos curtos. */
export const KB_ARTICLES: readonly KbArticle[] = [
  {
    id: "KB-001",
    title: "VPN com erro 809",
    category: "rede_vpn",
    keywords: ["vpn", "809", "conectar", "remoto", "home office", "túnel"],
    body: "Reinstale o cliente de VPN pelo Portal de Softwares e reinicie o computador.",
    limits: "Vale apenas para Windows 10. No Windows 11, abra um chamado.",
  },
  {
    id: "KB-002",
    title: "Horário do service desk",
    category: "geral",
    keywords: ["horário", "atendimento", "plantão", "funciona", "fim de semana", "sábado"],
    body: "O service desk atende de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
    limits: null,
  },
  {
    id: "KB-003",
    title: "Redefinir a senha da rede",
    category: "acesso",
    keywords: ["senha", "rede", "expirou", "esqueci", "windows", "login", "trocar senha"],
    body: "Acesse senha.nexo.com.br pelo celular ou outro computador, confirme o código enviado ao seu e-mail pessoal cadastrado e defina a nova senha. Ela vale para rede, e-mail e VPN em até 15 minutos.",
    limits: "Se a conta estiver bloqueada por tentativas erradas, abra um chamado.",
  },
  {
    id: "KB-004",
    title: "Outlook não sincroniza no celular",
    category: "email",
    keywords: ["outlook", "celular", "sincroniza", "e-mail", "email", "mobile", "android", "iphone"],
    body: "No app Outlook, vá em Configurações › conta › Redefinir conta. Se não resolver, remova e adicione a conta de novo usando o e-mail corporativo.",
    limits: "Se aparecer 'dispositivo não compatível', abra um chamado.",
  },
  {
    id: "KB-005",
    title: "Instalar software autorizado",
    category: "software",
    keywords: ["instalar", "programa", "software", "portal", "aplicativo", "licença"],
    body: "Softwares homologados ficam no Portal de Softwares (ícone na área de trabalho). Basta clicar em Instalar; não precisa de chamado.",
    limits: "Softwares fora do portal ou que exigem licença paga precisam de uma requisição (REQ) com aprovação do gestor.",
  },
  {
    id: "KB-006",
    title: "Impressora não imprime",
    category: "hardware",
    keywords: ["impressora", "imprimir", "fila", "papel", "travada"],
    body: "Abra 'Impressoras e scanners', selecione a impressora, clique em 'Abrir fila' e cancele todos os documentos. Depois desligue a impressora por 30 segundos.",
    limits: "Se a impressora mostrar erro físico (atolamento persistente, toner), abra um chamado.",
  },
  {
    id: "KB-007",
    title: "Wi-Fi para visitantes",
    category: "rede_vpn",
    keywords: ["wifi", "wi-fi", "visitante", "convidado", "internet", "senha do wifi"],
    body: "A rede NEXO-VISITANTE gera um código diário na recepção. Funcionários usam a rede NEXO-CORP com o login da rede.",
    limits: null,
  },
  {
    id: "KB-008",
    title: "Notebook lento após atualização",
    category: "hardware",
    keywords: ["lento", "lentidão", "travando", "atualização", "windows update", "notebook", "computador"],
    body: "Reinicie o notebook duas vezes (a atualização termina no segundo boot) e rode 'Diagnóstico Nexo' pela central de ajuda.",
    limits: "Se continuar lento depois disso, abra um chamado de Hardware.",
  },
];
