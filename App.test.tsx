import { act } from 'react';
import { createRoot, type Root, type TestInstance } from 'test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import App from './App';
import { registrarVoto, contagemPorGrupo, totalAlunos, type SessaoUrna } from './src/domain/urna';

/*
 * Testes de tela da urna. O "PC da guia" é falso, mas usa a regra de votos verdadeira
 * (registrarVoto), então estes testes exercitam tablet + regra juntos.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return Object.create(native, {
    Pressable: {
      value: (props: { style?: unknown; children?: React.ReactNode }) =>
        React.createElement('Pressable', { ...props, style: undefined }, props.children),
    },
  });
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

const BASE = 'http://192.168.0.10:8787';

// ---------- PC falso ----------
let pc: SessaoUrna & { sessao: string };
let redeLigada: boolean;
let envios: { votos: { id: string; group: string; rule: string }[] }[];

function novoPc(parcial: Partial<SessaoUrna & { sessao: string }> = {}) {
  pc = {
    sessao: 's1', open: true, noOwn: false, votes: [],
    groups: [
      { id: 'L1', side: 'Lia', size: 2, rule: 'Faixa só para pedestres' },
      { id: 'C1', side: 'Caio', size: 1, rule: 'Motos a 10 km/h' },
    ],
    ...parcial,
  };
}

const resposta = (status: number, corpo: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(corpo) } as Response);

function fetchFalso(url: string, init?: RequestInit): Promise<Response> {
  if (!redeLigada) return Promise.reject(new TypeError('Network request failed'));
  const caminho = url.replace(BASE, '').split('?')[0];
  if (caminho === '/api/urna') {
    return resposta(200, { sessao: pc.sessao, open: pc.open, noOwn: pc.noOwn, groups: pc.groups, contagem: contagemPorGrupo(pc), total: totalAlunos(pc.groups) });
  }
  if (caminho === '/api/votos' && init?.method === 'POST') {
    const corpo = JSON.parse(String(init.body));
    if (corpo.sessao !== pc.sessao) return resposta(409, { erro: 'SESSAO_DIFERENTE', sessao: pc.sessao });
    envios.push(corpo);
    const respostas = corpo.votos.map((v: { id: string }) => {
      const r = registrarVoto(pc, v);
      pc = { ...pc, ...r.session };
      return { id: v.id, result: r.result };
    });
    return resposta(200, { respostas });
  }
  return resposta(404, {});
}

// ---------- ajudantes de tela ----------
let root: Root;

function textOf(node: TestInstance): string {
  return node.children.map(c => (typeof c === 'string' ? c : textOf(c))).join('');
}
const textoDaTela = () => textOf(root.container);

function botao(rotulo: string): TestInstance {
  const achados = root.container.queryAll(n => n.type === 'Pressable' && n.props.accessibilityLabel === rotulo);
  expect(achados).toHaveLength(1);
  return achados[0];
}

async function esperar() {
  await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
}

async function tocar(rotulo: string) {
  const b = botao(rotulo);
  expect(b.props.disabled).not.toBe(true);
  await act(async () => { b.props.onPress(); });
  await esperar();
}

async function rodada() {
  await act(async () => { jest.advanceTimersByTime(2000); });
  await esperar();
}

async function abrirApp() {
  root = createRoot();
  await act(async () => { root.render(<App />); });
  await esperar();
}

async function votar(grupo: string, regra: string) {
  await tocar('Estou pronto');
  await tocar(`Grupo ${grupo}`);
  await tocar(`Regra do grupo ${regra}`);
  await tocar('Confirmar meu voto');
}

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  novoPc();
  redeLigada = true;
  envios = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(fetchFalso as typeof fetch);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  jest.clearAllTimers();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function appConectado() {
  await AsyncStorage.setItem('urna:servidor', BASE);
  await abrirApp();
}

describe('primeiro uso: endereço do PC', () => {
  test('pede o endereço, recusa texto inválido e conecta com o endereço digitado', async () => {
    await abrirApp();
    expect(textoDaTela()).toContain('Endereço do PC da guia');
    const campo = root.container.queryAll(n => n.props.accessibilityLabel === 'Endereço do PC da guia' && typeof n.props.onChangeText === 'function')[0];

    await act(async () => { campo.props.onChangeText('isso não é endereço'); });
    await tocar('Conectar');
    expect(textoDaTela()).toContain('Endereço inválido');

    await act(async () => { campo.props.onChangeText('192.168.0.10'); });
    await tocar('Conectar');
    expect(await AsyncStorage.getItem('urna:servidor')).toBe(BASE);
    expect(textoDaTela()).toContain('Sua vez de votar');
    expect(textoDaTela()).toContain('Conectado ao PC da guia');
  });
});

describe('votação com rede', () => {
  test('urna fechada até a guia abrir', async () => {
    novoPc({ open: false });
    await appConectado();
    expect(textoDaTela()).toContain('Urna fechada');
    pc = { ...pc, open: true };
    await rodada();
    expect(textoDaTela()).toContain('Sua vez de votar');
  });

  test('fluxo completo: pronto → grupo → regra → confirmar; o voto chega ao PC e a tela não mostra a escolha', async () => {
    await appConectado();
    await votar('L1', 'C1');
    expect(textoDaTela()).toContain('Voto guardado');
    expect(textoDaTela()).not.toContain('Motos a 10 km/h');
    expect(pc.votes).toHaveLength(1);
    expect(pc.votes[0]).toMatchObject({ group: 'L1', rule: 'C1' });
    await tocar('Próxima pessoa');
    expect(textoDaTela()).toContain('Sua vez de votar');
  });

  test('"Confirmar meu voto" só funciona depois de escolher uma regra', async () => {
    await appConectado();
    await tocar('Estou pronto');
    await tocar('Grupo L1');
    expect(botao('Confirmar meu voto').props.disabled).toBe(true);
  });

  test('grupo completo aparece riscado como "todos já votaram" e não pode ser escolhido', async () => {
    await appConectado();
    await votar('C1', 'L1'); // C1 tem 1 integrante
    await tocar('Próxima pessoa');
    await tocar('Estou pronto');
    expect(botao('Grupo C1, todos já votaram').props.disabled).toBe(true);
    expect(textoDaTela()).toContain('todos já votaram');
  });

  test('com "proibir voto na própria regra", a regra do próprio grupo fica desabilitada', async () => {
    novoPc({ noOwn: true });
    await appConectado();
    await tocar('Estou pronto');
    await tocar('Grupo L1');
    expect(botao('Regra do grupo L1').props.disabled).toBe(true);
    expect(textoDaTela()).toContain('Não vale votar na regra do seu próprio grupo');
  });

  test('quando todos votam, o tablet pede para ser devolvido', async () => {
    await appConectado();
    await votar('L1', 'C1'); await tocar('Próxima pessoa');
    await votar('L1', 'L1'); await tocar('Próxima pessoa');
    await votar('C1', 'L1'); await tocar('Próxima pessoa');
    expect(textoDaTela()).toContain('Todos votaram');
  });
});

describe('sem rede (Wi-Fi caiu)', () => {
  test('o voto fica guardado no tablet, conta no limite e é enviado quando a rede volta', async () => {
    await appConectado();
    redeLigada = false;
    await rodada();
    expect(textoDaTela()).toContain('Sem rede');

    await votar('C1', 'L1');
    expect(textoDaTela()).toContain('1 voto guardado aguardando envio');
    expect(pc.votes).toHaveLength(0);

    // O voto guardado já conta: C1 (1 integrante) aparece completo mesmo sem rede.
    await tocar('Próxima pessoa');
    await tocar('Estou pronto');
    expect(botao('Grupo C1, todos já votaram').props.disabled).toBe(true);

    redeLigada = true;
    await rodada();
    expect(pc.votes).toHaveLength(1);
    expect(textoDaTela()).toContain('Conectado ao PC da guia');
    expect(textoDaTela()).not.toContain('aguardando envio');
  });

  test('votos guardados sobrevivem ao App ser fechado e reaberto', async () => {
    await appConectado();
    redeLigada = false;
    await rodada();
    await votar('L1', 'C1');
    await act(async () => { root.unmount(); });

    redeLigada = true;
    await abrirApp();
    expect(pc.votes).toHaveLength(1);
  });

  test('voto recusado pelo PC (grupo completo por outro tablet) gera aviso para chamar a guia', async () => {
    await appConectado();
    redeLigada = false;
    await rodada();
    await votar('C1', 'L1');
    // Enquanto este tablet estava sem rede, outro tablet já completou o C1.
    pc = { ...pc, votes: [{ id: 'outro-tablet-1', group: 'C1', rule: 'C1' }] };
    redeLigada = true;
    await rodada();
    expect(textoDaTela()).toContain('1 voto não foi aceito pelo PC: o grupo escolhido já estava completo');
    await tocar('Entendi');
    expect(textoDaTela()).not.toContain('não foi aceito');
  });

  test('votos de uma votação anterior não entram na nova turma', async () => {
    await appConectado();
    redeLigada = false;
    await rodada();
    await votar('L1', 'C1');
    novoPc({ sessao: 's2' });
    redeLigada = true;
    await rodada();
    expect(envios).toHaveLength(0);
    expect(pc.votes).toHaveLength(0);
    expect(textoDaTela()).toContain('eram de uma votação anterior');
  });
});
