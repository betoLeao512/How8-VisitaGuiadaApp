/*
 * Fila de votos guardados no tablet enquanto o Wi-Fi está fora.
 * Funções puras: quem chama (o App) cuida de salvar a fila no aparelho e de enviar.
 */
import type { GrupoUrna, Recusa, ResultadoVoto, Voto } from './urna';

/** Resposta do PC para um voto enviado. */
export type RespostaEnvio = { id: string; result: ResultadoVoto };

/** Votos por grupo do ponto de vista do tablet: o que o PC já contou + o que ainda está guardado aqui. */
export function contagemLocal(groups: GrupoUrna[], doServidor: Record<string, number>, pendentes: Voto[]): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const g of groups) contagem[g.id] = doServidor[g.id] ?? 0;
  for (const p of pendentes) if (p.group in contagem) contagem[p.group]++;
  return contagem;
}

/** Grupos que devem aparecer riscados ("todos já votaram") neste tablet. */
export function gruposCheiosLocal(groups: GrupoUrna[], doServidor: Record<string, number>, pendentes: Voto[]): Set<string> {
  const contagem = contagemLocal(groups, doServidor, pendentes);
  return new Set(groups.filter(g => contagem[g.id] >= g.size).map(g => g.id));
}

/**
 * Aplica as respostas do PC à fila. ACEITO e DUPLICADO saem (o PC já tem o voto);
 * RECUSADO sai e é relatado; voto sem resposta fica para a próxima tentativa.
 */
export function aplicarRespostas(pendentes: Voto[], respostas: RespostaEnvio[]): {
  pendentes: Voto[];
  recusados: { voto: Voto; reason: Recusa }[];
} {
  const porId = new Map(respostas.map(r => [r.id, r.result]));
  const restantes: Voto[] = [];
  const recusados: { voto: Voto; reason: Recusa }[] = [];
  for (const voto of pendentes) {
    const result = porId.get(voto.id);
    if (!result) restantes.push(voto);
    else if (result.status === 'RECUSADO') recusados.push({ voto, reason: result.reason });
  }
  return { pendentes: restantes, recusados };
}
