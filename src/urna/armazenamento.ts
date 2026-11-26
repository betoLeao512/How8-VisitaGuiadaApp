/*
 * O que o tablet guarda na própria memória, para sobreviver a uma queda do Wi-Fi
 * ou ao App ser fechado sem querer: endereço do PC, id do aparelho, último estado e votos ainda não enviados.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseVoto, type Voto } from '../domain/urna';
import { parseEstado, type EstadoPublico } from '../rede/protocolo';

/** Voto guardado no tablet, marcado com a votação (sessão) a que pertence. */
export type VotoGuardado = Voto & { sessao: string };

const CHAVE = {
  servidor: 'urna:servidor',
  aparelho: 'urna:aparelho',
  estado: 'urna:estado',
  pendentes: 'urna:pendentes',
};

export type Guardado = { servidor: string | null; aparelho: string; estado: EstadoPublico | null; pendentes: VotoGuardado[] };

function lerJson(texto: string | null): unknown {
  if (!texto) return null;
  try { return JSON.parse(texto); } catch { return null; }
}

function novoIdAparelho(): string {
  return `tablet-${Math.random().toString(36).slice(2, 8)}`;
}

export async function carregar(): Promise<Guardado> {
  const [servidor, aparelho, estado, pendentes] = await Promise.all(
    [CHAVE.servidor, CHAVE.aparelho, CHAVE.estado, CHAVE.pendentes].map(k => AsyncStorage.getItem(k).catch(() => null)),
  );
  let id = aparelho;
  if (!id) {
    id = novoIdAparelho();
    await AsyncStorage.setItem(CHAVE.aparelho, id).catch(() => undefined);
  }
  const lista = lerJson(pendentes);
  const validos = Array.isArray(lista)
    ? lista.flatMap(p => {
      const v = parseVoto(p);
      const sessao = (p as { sessao?: unknown })?.sessao;
      return v && typeof sessao === 'string' ? [{ ...v, sessao }] : [];
    })
    : [];
  return { servidor, aparelho: id, estado: parseEstado(lerJson(estado)), pendentes: validos };
}

export const salvarServidor = (base: string) => AsyncStorage.setItem(CHAVE.servidor, base);
export const salvarEstado = (estado: EstadoPublico) => AsyncStorage.setItem(CHAVE.estado, JSON.stringify(estado));
export const salvarPendentes = (pendentes: VotoGuardado[]) => AsyncStorage.setItem(CHAVE.pendentes, JSON.stringify(pendentes));
