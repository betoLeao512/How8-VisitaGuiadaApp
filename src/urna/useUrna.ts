/*
 * Cérebro da urna no tablet: liga o armazenamento, a fila offline e a conversa com o PC.
 * Todo voto entra primeiro na fila guardada no aparelho e só sai dela quando o PC responde.
 * Assim, com ou sem Wi-Fi, o caminho do voto é o mesmo.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { aplicarRespostas, contagemLocal } from '../domain/fila';
import type { Recusa } from '../domain/urna';
import type { EstadoPublico } from '../rede/protocolo';
import { carregar, salvarEstado, salvarPendentes, salvarServidor, type VotoGuardado } from './armazenamento';
import { buscarEstado, enviarVotos, SessaoDiferente } from './cliente';

export const INTERVALO_MS = 2000;
const LOTE = 50;

export type Aviso = { quantidade: number; motivo: Recusa | 'SESSAO_ENCERRADA' };

export type Urna = {
  carregado: boolean;
  servidor: string | null;
  aparelho: string;
  estado: EstadoPublico | null;
  online: boolean;
  /** Votos desta votação ainda guardados no tablet. */
  pendentes: VotoGuardado[];
  /** Votos por grupo vistos daqui: PC + guardados. */
  contagem: Record<string, number>;
  avisos: Aviso[];
  definirServidor: (base: string) => Promise<void>;
  votar: (group: string, rule: string) => Promise<void>;
  dispensarAvisos: () => void;
};

export function useUrna(): Urna {
  const [carregado, setCarregado] = useState(false);
  const [servidor, setServidor] = useState<string | null>(null);
  const [aparelho, setAparelho] = useState('');
  const [estado, setEstado] = useState<EstadoPublico | null>(null);
  const [online, setOnline] = useState(false);
  const [pendentes, setPendentes] = useState<VotoGuardado[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const ref = useRef({ servidor: null as string | null, aparelho: '', pendentes: [] as VotoGuardado[], sincronizando: false, seq: 0, vivo: true });

  const trocarPendentes = useCallback(async (lista: VotoGuardado[]) => {
    ref.current.pendentes = lista;
    if (ref.current.vivo) setPendentes(lista);
    await salvarPendentes(lista).catch(() => undefined);
  }, []);

  const avisar = useCallback((motivo: Aviso['motivo'], quantidade: number) => {
    if (quantidade > 0 && ref.current.vivo) setAvisos(a => [...a, { motivo, quantidade }]);
  }, []);

  const sincronizar = useCallback(async () => {
    const r = ref.current;
    if (!r.servidor || r.sincronizando) return;
    r.sincronizando = true;
    try {
      const atual = await buscarEstado(r.servidor, r.aparelho, r.pendentes.length);
      if (!r.vivo) return;
      setEstado(atual);
      setOnline(true);
      salvarEstado(atual).catch(() => undefined);

      // Votos de uma votação que a guia já trocou não podem cair na nova.
      const antigos = r.pendentes.filter(p => p.sessao !== atual.sessao);
      if (antigos.length) {
        avisar('SESSAO_ENCERRADA', antigos.length);
        await trocarPendentes(r.pendentes.filter(p => p.sessao === atual.sessao));
      }

      let enviou = false;
      while (r.pendentes.length && r.vivo) {
        const lote = r.pendentes.slice(0, LOTE);
        const respostas = await enviarVotos(r.servidor, {
          sessao: atual.sessao, aparelho: r.aparelho, pendentes: r.pendentes.length,
          votos: lote.map(({ id, group, rule }) => ({ id, group, rule })),
        });
        const { pendentes: restantes, recusados } = aplicarRespostas(lote, respostas);
        const porMotivo = new Map<Recusa, number>();
        for (const x of recusados) porMotivo.set(x.reason, (porMotivo.get(x.reason) ?? 0) + 1);
        porMotivo.forEach((n, motivo) => avisar(motivo, n));
        const saiu = new Set(lote.filter(v => !restantes.includes(v)).map(v => v.id));
        await trocarPendentes(r.pendentes.filter(p => !saiu.has(p.id)));
        if (saiu.size) enviou = true;
        if (restantes.length === lote.length) break; // o PC não respondeu sobre nenhum: tenta na próxima rodada
      }
      // Contagem atualizada depois dos envios.
      if (r.vivo && enviou) {
        const depois = await buscarEstado(r.servidor, r.aparelho, r.pendentes.length);
        if (r.vivo) { setEstado(depois); salvarEstado(depois).catch(() => undefined); }
      }
    } catch (e) {
      // Sem rede, PC desligado ou votação trocada no meio do envio (SessaoDiferente):
      // os votos continuam guardados e a próxima rodada tenta de novo.
      if (r.vivo && !(e instanceof SessaoDiferente)) setOnline(false);
    } finally {
      r.sincronizando = false;
    }
  }, [avisar, trocarPendentes]);

  // Carrega o que estava guardado e começa a conversar com o PC.
  useEffect(() => {
    const r = ref.current;
    r.vivo = true;
    carregar().then(g => {
      if (!r.vivo) return;
      r.servidor = g.servidor;
      r.aparelho = g.aparelho;
      r.pendentes = g.pendentes;
      setServidor(g.servidor);
      setAparelho(g.aparelho);
      setEstado(g.estado);
      setPendentes(g.pendentes);
      setCarregado(true);
      sincronizar();
    });
    const timer = setInterval(sincronizar, INTERVALO_MS);
    return () => { r.vivo = false; clearInterval(timer); };
  }, [sincronizar]);

  const definirServidor = useCallback(async (base: string) => {
    ref.current.servidor = base;
    setServidor(base);
    setOnline(false);
    await salvarServidor(base).catch(() => undefined);
    await sincronizar();
  }, [sincronizar]);

  const votar = useCallback(async (group: string, rule: string) => {
    const r = ref.current;
    if (!estado) return;
    r.seq += 1;
    const voto: VotoGuardado = { id: `${r.aparelho}-${Date.now().toString(36)}-${r.seq}`, group, rule, sessao: estado.sessao };
    await trocarPendentes([...r.pendentes, voto]);
    sincronizar();
  }, [estado, sincronizar, trocarPendentes]);

  const daSessao = estado ? pendentes.filter(p => p.sessao === estado.sessao) : [];
  return {
    carregado, servidor, aparelho, estado, online,
    pendentes: daSessao,
    contagem: estado ? contagemLocal(estado.groups, estado.contagem, daSessao) : {},
    avisos,
    definirServidor,
    votar,
    dispensarAvisos: () => setAvisos([]),
  };
}
