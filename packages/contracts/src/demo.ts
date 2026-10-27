/**
 * Identidades de exemplo compartilhadas entre o app web (login) e o serviço de chamados (seed).
 * O login aceita qualquer senha para estes e-mails (exigência do PRD).
 */
export const DEMO_EMPLOYEES = [
  { id: "emp_ana", name: "Ana Souza", email: "ana.souza@nexo.com.br", department: "Financeiro" },
  { id: "emp_carla", name: "Carla Mendes", email: "carla.mendes@nexo.com.br", department: "Comercial" },
  { id: "emp_bruno", name: "Bruno Tavares", email: "bruno.tavares@nexo.com.br", department: "Marketing" },
  { id: "emp_diego", name: "Diego Ramos", email: "diego.ramos@nexo.com.br", department: "Engenharia" },
  { id: "emp_elisa", name: "Elisa Prado", email: "elisa.prado@nexo.com.br", department: "Operações" },
  { id: "emp_fabio", name: "Fábio Nunes", email: "fabio.nunes@nexo.com.br", department: "Jurídico" },
  { id: "emp_gabriela", name: "Gabriela Rocha", email: "gabriela.rocha@nexo.com.br", department: "Compras" },
] as const;

export const DEMO_ANALYSTS = [
  { id: "ana_rafael", name: "Rafael Lima", email: "rafael.lima@nexo.com.br", team: "N2" },
  { id: "ana_juliana", name: "Juliana Costa", email: "juliana.costa@nexo.com.br", team: "N1" },
] as const;

export type DemoEmployeeId = (typeof DEMO_EMPLOYEES)[number]["id"];
