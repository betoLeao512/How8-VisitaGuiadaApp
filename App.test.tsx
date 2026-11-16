import { act } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { createRoot, type Root, type TestInstance } from 'test-renderer';

import App from './App';

// Only the native touch surface is replaced. App, React hooks, clock decisions,
// score calculation, and rendered result remain the production implementation.
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return Object.create(native, {
    Pressable: {
      value: (props: { children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode) }) =>
        React.createElement('Pressable', props,
          typeof props.children === 'function' ? props.children({ pressed: false }) : props.children),
    },
  });
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

const START = new Date('2026-01-01T12:00:00Z').getTime();
let root: Root;
let stateListener: (state: AppStateStatus) => void;
let removeStateListener: jest.Mock;
let intervalSpy: jest.SpyInstance;
let clearIntervalSpy: jest.SpyInstance;

function textOf(node: TestInstance): string {
  return node.children.map(child => typeof child === 'string' ? child : textOf(child)).join('');
}

function button(label: string): TestInstance {
  const matches = root.container.queryAll(node => node.type === 'Pressable'
    && (node.props.accessibilityLabel === label || textOf(node) === label));
  expect(matches).toHaveLength(1);
  return matches[0];
}

async function press(label: string) {
  const control = button(label);
  expect(control.props.disabled).not.toBe(true);
  await act(async () => { control.props.onPress(); });
}

async function identify(name = 'Equipe Azul') {
  await press('Começar');
  const input = root.container.queryAll(node => node.props.accessibilityLabel === 'Nome do grupo'
    && typeof node.props.onChangeText === 'function')[0];
  expect(input).toBeDefined();
  await act(async () => { input.props.onChangeText(name); });
  await press('Continuar');
}

async function start(name = 'Equipe Azul') {
  await identify(name);
  await press('Iniciar desafio');
}

function expectRemaining(seconds: number) {
  expect(root.container.queryAll(node =>
    node.props.accessibilityLabel === `${seconds} segundos restantes`)).toHaveLength(1);
}

function expectResult(title: string, answer: string, score: number, group = 'Equipe Azul') {
  const text = textOf(root.container);
  expect(text).toContain(title);
  expect(text).toContain(`Grupo: ${group}`);
  expect(text).toContain(`Resposta: ${answer}`);
  expect(root.container.queryAll(node => node.type === 'Text' && textOf(node) === String(score)))
    .toHaveLength(1);
  expect(button('Reiniciar')).toBeDefined();
  expect(root.container.queryAll(node => node.props.accessibilityLabel === 'Legislativo')).toHaveLength(0);
}

async function advance(ms: number) {
  await act(async () => { jest.advanceTimersByTime(ms); });
}

async function changeAppState(state: AppStateStatus) {
  await act(async () => { stateListener(state); });
}

beforeEach(async () => {
  jest.useFakeTimers({ now: START });
  intervalSpy = jest.spyOn(globalThis, 'setInterval');
  clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');
  removeStateListener = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    stateListener = listener;
    return { remove: removeStateListener };
  });
  root = createRoot();
  await act(async () => { root.render(<App />); });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  jest.clearAllTimers();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('baseline: respostas, prazo absoluto e pontuação exibida', () => {
  test.each([
    ['Legislativo', 'Resposta correta!', 100],
    ['Executivo', 'Resposta incorreta', 0],
    ['Judiciário', 'Resposta incorreta', 0],
  ])('%s mantém alternativa, resultado e pontos consistentes', async (answer, title, score) => {
    await start();
    await press(answer);
    expectResult(title, answer, score);
  });

  test('inicia com 30 segundos e só encerra ao atingir 30.000 ms', async () => {
    await start();
    expectRemaining(30);
    await advance(29_000);
    expectRemaining(1);
    await advance(999);
    expectRemaining(1);
    await advance(1);
    expectResult('Tempo esgotado', 'tempo esgotado', 0);
  });

  test('espera na preparação não consome o prazo do desafio', async () => {
    await identify();
    await advance(60_000);
    expect(intervalSpy).not.toHaveBeenCalled();
    await press('Iniciar desafio');
    expectRemaining(30);
    await advance(29_999);
    await press('Legislativo');
    expectResult('Resposta correta!', 'Legislativo', 100);
  });

  test('aceita resposta correta em 29.999 ms', async () => {
    await start();
    jest.setSystemTime(START + 29_999);
    await press('Legislativo');
    expectResult('Resposta correta!', 'Legislativo', 100);
  });

  test.each([30_000, 30_001, 45_000])('rejeita resposta em %i ms mesmo sem tick prévio', async elapsed => {
    await start();
    jest.setSystemTime(START + elapsed);
    // setSystemTime changes Date.now without delivering the interval: the handler
    // must enforce the absolute deadline even while the visible counter is stale.
    expectRemaining(30);
    await press('Legislativo');
    expectResult('Tempo esgotado', 'tempo esgotado', 0);
  });

  test('resposta antes do prazo continua definitiva após avanço do relógio', async () => {
    await start();
    await advance(29_000);
    await press('Legislativo');
    await advance(60_000);
    expectResult('Resposta correta!', 'Legislativo', 100);
  });

  test.each([
    ['Legislativo', 'Executivo', 'Resposta correta!', 100],
    ['Executivo', 'Legislativo', 'Resposta incorreta', 0],
    ['Legislativo', 'Legislativo', 'Resposta correta!', 100],
  ])('toques no mesmo lote: %s depois %s preservam a primeira conclusão', async (first, second, title, score) => {
    await start();
    const onFirst = button(first).props.onPress;
    const onSecond = button(second).props.onPress;
    await act(async () => { onFirst(); onSecond(); });
    expectResult(title, first, score);
  });

  test.each(['resposta primeiro', 'temporizador primeiro'])('no prazo: %s resulta em timeout único', async order => {
    await start();
    const onAnswer = button('Legislativo').props.onPress;
    if (order === 'resposta primeiro') {
      jest.setSystemTime(START + 30_000);
      await act(async () => { onAnswer(); jest.advanceTimersByTime(1000); });
    } else {
      await advance(30_000);
      await act(async () => { onAnswer(); });
    }
    expectResult('Tempo esgotado', 'tempo esgotado', 0);
  });

  test('toque atrasado após timeout não substitui a conclusão', async () => {
    await start();
    const onAnswer = button('Legislativo').props.onPress;
    await advance(30_000);
    await advance(5000);
    await act(async () => { onAnswer(); });
    expectResult('Tempo esgotado', 'tempo esgotado', 0);
  });
});

describe('baseline: reinício e isolamento dos temporizadores', () => {
  test.each(['Legislativo', 'Executivo', 'timeout'])('reinicia após %s com grupo e resultado limpos', async answer => {
    await start('Grupo anterior');
    if (answer === 'timeout') await advance(30_000);
    else await press(answer);
    await press('Reiniciar');
    expect(textOf(root.container)).toContain('Visita Cidadã');
    expect(textOf(root.container)).not.toContain('Grupo anterior');
    expect(root.container.queryAll(node => node.type === 'Pressable'
      && textOf(node) === 'Reiniciar')).toHaveLength(0);
    await press('Começar');
    const input = root.container.queryAll(node => node.props.accessibilityLabel === 'Nome do grupo'
      && typeof node.props.onChangeText === 'function')[0];
    expect(input.props.value).toBe('');
    expect(button('Continuar').props.disabled).toBe(true);
    expect(intervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalSpy.mock.results[0].value);
  });

  test('prazo anterior não encerra o novo desafio, que recebe 30 segundos completos', async () => {
    await start('Grupo anterior');
    await advance(5000);
    await press('Executivo');
    await press('Reiniciar');
    await start('Grupo novo');
    expectRemaining(30);
    await advance(25_000); // Deadline of the previous challenge, not of this one.
    expectRemaining(5);
    expect(textOf(root.container)).not.toContain('RESULTADO DA VISITA');
    await advance(4999);
    expectRemaining(1);
    await advance(1);
    expectResult('Tempo esgotado', 'tempo esgotado', 0, 'Grupo novo');
  });

  test.each(['Legislativo', 'Executivo', 'timeout'])('conclusão por %s cancela intervalo e listener', async answer => {
    await start();
    expect(intervalSpy).toHaveBeenCalledTimes(1);
    expect(intervalSpy.mock.calls[0][1]).toBe(1000);
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    if (answer === 'timeout') await advance(30_000);
    else await press(answer);
    expect(intervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalSpy.mock.results[0].value);
    expect(removeStateListener).toHaveBeenCalledTimes(1);
  });

  test('desmontagem durante o desafio cancela intervalo e listener', async () => {
    await start();
    await act(async () => { root.unmount(); });
    expect(intervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalSpy.mock.results[0].value);
    expect(removeStateListener).toHaveBeenCalledTimes(1);
  });
});

describe('baseline: retorno do segundo plano respeita prazo absoluto', () => {
  test('retorno antes do prazo recalcula o restante sem conceder mais tempo', async () => {
    await start();
    await changeAppState('background');
    jest.setSystemTime(START + 12_500);
    await changeAppState('active');
    expectRemaining(18);
    jest.setSystemTime(START + 30_000);
    await changeAppState('active');
    expectResult('Tempo esgotado', 'tempo esgotado', 0);
  });

  test.each([30_000, 45_000])('retorno em %i ms encerra imediatamente', async elapsed => {
    await start();
    await changeAppState('background');
    jest.setSystemTime(START + elapsed);
    await changeAppState('active');
    expectResult('Tempo esgotado', 'tempo esgotado', 0);
  });
});
