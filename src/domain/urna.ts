/*
 * Regra de votos da urna do Plenário.
 * Funções puras, sem imports: o App e o servidorzinho do PC (Node 24) usam este mesmo arquivo,
 * então a mesma regra vale no tablet e no PC.
 */
export type GrupoUrna = { id: string; side: 'Lia' | 'Caio'; size: number; rule: string };

/** Um voto. O id é criado pelo tablet e serve para o mesmo voto nunca contar duas vezes. */
export type Voto = { id: string; group: string; rule: string };

export type SessaoUrna = { groups: GrupoUrna[]; noOwn: boolean; open: boolean; votes: Voto[] };

export type Recusa =
  | 'URNA_FECHADA'
  | 'VOTO_INVALIDO'
  | 'GRUPO_INEXISTENTE'
  | 'REGRA_INEXISTENTE'
  | 'GRUPO_COMPLETO'
  | 'VOTO_NA_PROPRIA_REGRA';

export type ResultadoVoto =
  | { status: 'ACEITO' }
  | { status: 'DUPLICADO' }
  | { status: 'RECUSADO'; reason: Recusa };

const MAX_ID = 80;
const texto = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** Confere o formato de um voto vindo da rede. Guarda só id, grupo e regra. */
export function parseVoto(input: unknown): Voto | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const { id, group, rule } = input as Record<string, unknown>;
  if (!texto(id, MAX_ID) || !texto(group, MAX_ID) || !texto(rule, MAX_ID)) return null;
  return { id, group, rule };
}

export function totalAlunos(groups: GrupoUrna[]): number {
  return groups.reduce((soma, g) => soma + g.size, 0);
}

/** Quantos votos cada grupo já deu. Só a contagem, nunca a escolha. */
export function contagemPorGrupo(session: SessaoUrna): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const g of session.groups) contagem[g.id] = 0;
  for (const v of session.votes) if (v.group in contagem) contagem[v.group]++;
  return contagem;
}

/**
 * Tenta registrar um voto. Nunca altera a sessão recebida: devolve uma nova.
 * Ordem das conferências: formato → reenvio (DUPLICADO) → urna aberta → grupo → regra → própria regra → limite do grupo.
 * O reenvio vem antes da urna aberta para que um voto aceito, reenviado depois do encerramento, não pareça perdido.
 */
export function registrarVoto(session: SessaoUrna, input: unknown): { session: SessaoUrna; result: ResultadoVoto } {
  const recusa = (reason: Recusa) => ({ session, result: { status: 'RECUSADO', reason } as ResultadoVoto });

  const v = parseVoto(input);
  if (!v) return recusa('VOTO_INVALIDO');
  if (session.votes.some(existente => existente.id === v.id)) return { session, result: { status: 'DUPLICADO' } };
  if (!session.open) return recusa('URNA_FECHADA');

  const grupo = session.groups.find(g => g.id === v.group);
  if (!grupo) return recusa('GRUPO_INEXISTENTE');
  if (!session.groups.some(g => g.id === v.rule)) return recusa('REGRA_INEXISTENTE');
  if (session.noOwn && v.rule === v.group) return recusa('VOTO_NA_PROPRIA_REGRA');

  const jaVotaram = session.votes.filter(existente => existente.group === v.group).length;
  if (jaVotaram >= grupo.size) return recusa('GRUPO_COMPLETO');

  return { session: { ...session, votes: [...session.votes, v] }, result: { status: 'ACEITO' } };
}

export type Apuracao = {
  counts: { id: string; side: 'Lia' | 'Caio'; rule: string; n: number }[];
  winners: Set<string>;
  total: number;
  lia: { total: number; other: number; pct: number };
  caio: { total: number; other: number; pct: number };
  outsidePct: number;
};

/** Apuração igual à da simulação 3: as x regras mais votadas viram lei (empates no corte entram). */
export function apurar(groups: GrupoUrna[], votes: Voto[], x: number): Apuracao {
  const counts = groups.map(g => ({ id: g.id, side: g.side, rule: g.rule, n: votes.filter(v => v.rule === g.id).length }));
  counts.sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const cut = counts[Math.min(x, counts.length) - 1]?.n ?? 0;
  const winners = new Set(counts.filter(c => c.n > 0 && c.n >= cut).map(c => c.id));

  const sideOf: Record<string, string> = Object.fromEntries(groups.map(g => [g.id, g.side]));
  const pct = (parte: number, todo: number) => (todo ? Math.round((100 * parte) / todo) : 0);
  const cruzados = (side: 'Lia' | 'Caio') => {
    const meus = votes.filter(v => sideOf[v.group] === side);
    const other = meus.filter(v => sideOf[v.rule] !== side).length;
    return { total: meus.length, other, pct: pct(other, meus.length) };
  };
  const fora = votes.filter(v => v.rule !== v.group).length;

  return { counts, winners, total: votes.length, lia: cruzados('Lia'), caio: cruzados('Caio'), outsidePct: pct(fora, votes.length) };
}
