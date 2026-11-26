/* Conversa com o servidorzinho do PC. Toda resposta passa pelo protocolo antes de ser usada. */
import type { RespostaEnvio } from '../domain/fila';
import { parseEstado, parseRespostas, type EstadoPublico, type PedidoEnvio } from '../rede/protocolo';

const TEMPO_LIMITE_MS = 4000;

export class SessaoDiferente extends Error {
  constructor(public sessao: string) { super('SESSAO_DIFERENTE'); }
}

async function comTempoLimite(url: string, init?: RequestInit): Promise<Response> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    return await fetch(url, { ...init, signal: controle.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/urna. Lança erro se a rede falhar ou a resposta vier fora do formato. */
export async function buscarEstado(base: string, aparelho: string, pendentes: number): Promise<EstadoPublico> {
  const q = `aparelho=${encodeURIComponent(aparelho)}&pendentes=${pendentes}`;
  const r = await comTempoLimite(`${base}/api/urna?${q}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const estado = parseEstado(await r.json());
  if (!estado) throw new Error('Resposta fora do formato');
  return estado;
}

/** POST /api/votos. Devolve as respostas por voto; votos sem resposta continuam na fila. */
export async function enviarVotos(base: string, pedido: PedidoEnvio): Promise<RespostaEnvio[]> {
  const r = await comTempoLimite(`${base}/api/votos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pedido),
  });
  if (r.status === 409) {
    const corpo = await r.json().catch(() => ({}));
    throw new SessaoDiferente(typeof corpo?.sessao === 'string' ? corpo.sessao : '');
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseRespostas(await r.json());
}
