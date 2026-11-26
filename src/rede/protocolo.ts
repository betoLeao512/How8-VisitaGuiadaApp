/*
 * Formato das mensagens entre a urna (tablet) e o servidorzinho do PC.
 * Tudo o que chega pela rede passa por aqui antes de ser usado.
 */
import type { RespostaEnvio } from '../domain/fila';
import type { GrupoUrna, Voto } from '../domain/urna';

export const PORTA_PADRAO = 8787;

/** O que o tablet sabe da votação: nunca os votos, só a contagem por grupo. */
export type EstadoPublico = {
  sessao: string;
  open: boolean;
  noOwn: boolean;
  groups: GrupoUrna[];
  contagem: Record<string, number>;
  total: number;
};

export type PedidoEnvio = { sessao: string; aparelho: string; pendentes: number; votos: Voto[] };

const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const inteiro = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function parseGrupo(v: unknown): GrupoUrna | null {
  if (!obj(v)) return null;
  const { id, side, size, rule } = v;
  if (typeof id !== 'string' || !id || (side !== 'Lia' && side !== 'Caio') || !inteiro(size) || typeof rule !== 'string') return null;
  return { id, side, size, rule };
}

/** Confere a resposta de GET /api/urna. Devolve null se algo estiver fora do formato. */
export function parseEstado(v: unknown): EstadoPublico | null {
  if (!obj(v)) return null;
  const { sessao, open, noOwn, groups, contagem, total } = v;
  if (typeof sessao !== 'string' || typeof open !== 'boolean' || typeof noOwn !== 'boolean') return null;
  if (!Array.isArray(groups) || !obj(contagem) || !inteiro(total)) return null;
  const grupos = groups.map(parseGrupo);
  if (grupos.some(g => g === null)) return null;
  const limpa: Record<string, number> = {};
  for (const g of grupos as GrupoUrna[]) {
    const n = contagem[g.id];
    limpa[g.id] = inteiro(n) ? n : 0;
  }
  return { sessao, open, noOwn, groups: grupos as GrupoUrna[], contagem: limpa, total };
}

const STATUS = new Set(['ACEITO', 'DUPLICADO', 'RECUSADO']);

/** Confere a resposta de POST /api/votos. Respostas malformadas são ignoradas (o voto fica na fila). */
export function parseRespostas(v: unknown): RespostaEnvio[] {
  if (!obj(v) || !Array.isArray(v.respostas)) return [];
  const ok: RespostaEnvio[] = [];
  for (const r of v.respostas) {
    if (!obj(r) || typeof r.id !== 'string' || !obj(r.result) || !STATUS.has(r.result.status as string)) continue;
    if (r.result.status === 'RECUSADO' && typeof r.result.reason !== 'string') continue;
    ok.push(r as RespostaEnvio);
  }
  return ok;
}

/** Aceita "192.168.0.10", "192.168.0.10:8787" ou "http://192.168.0.10:8787/" e devolve a URL base. */
export function normalizarEndereco(texto: string): string | null {
  const t = texto.trim().replace(/\/+$/, '');
  if (!t) return null;
  const comProtocolo = /^https?:\/\//i.test(t) ? t : `http://${t}`;
  const m = /^(https?):\/\/([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(comProtocolo);
  if (!m) return null;
  const porta = m[3] ? Number(m[3]) : PORTA_PADRAO;
  if (porta < 1 || porta > 65535) return null;
  return `${m[1].toLowerCase()}://${m[2]}:${porta}`;
}
