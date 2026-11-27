// Testes do servidorzinho: npm run test:servidor
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarServidor, ordenarEnderecos } from './servidor-urna.mjs';

let server, base;
before(async () => {
  server = criarServidor({ dataFile: null });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = async p => (await fetch(base + p)).json();
async function post(p, corpo) {
  const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo ?? {}) });
  return { status: r.status, dados: await r.json() };
}

test('turma de 9: dois grupos (L1 com 5, C1 com 4), urna começa fechada', async () => {
  const { status, dados } = await post('/api/guia/turma', { alunos: 9, confirmar: true });
  assert.equal(status, 200);
  assert.deepEqual(dados.groups.map(g => [g.id, g.size]), [['L1', 5], ['C1', 4]]);
  assert.equal(dados.open, false);
});

test('turma fora de 4 a 40 é recusada', async () => {
  const { status } = await post('/api/guia/turma', { alunos: 41, confirmar: true });
  assert.equal(status, 400);
});

test('regras entram antes de abrir; urna fechada recusa voto', async () => {
  await post('/api/guia/regras', { regras: { L1: ' Faixa para pedestres ', C1: 'Motos devagar' } });
  const estado = await get('/api/urna');
  assert.equal(estado.groups[0].rule, 'Faixa para pedestres');
  const r = await post('/api/votos', { sessao: estado.sessao, aparelho: 't1', votos: [{ id: 'a', group: 'L1', rule: 'C1' }] });
  assert.deepEqual(r.dados.respostas[0].result, { status: 'RECUSADO', reason: 'URNA_FECHADA' });
});

test('aberta: aceita até o tamanho do grupo, recusa o 6º do L1 e conta reenvio uma vez', async () => {
  await post('/api/guia/abrir');
  const { sessao } = await get('/api/urna');
  const votos = Array.from({ length: 6 }, (_, k) => ({ id: `L1-${k}`, group: 'L1', rule: 'C1' }));
  const r = await post('/api/votos', { sessao, aparelho: 't1', pendentes: 0, votos });
  assert.deepEqual(r.dados.respostas.map(x => x.result.status), ['ACEITO', 'ACEITO', 'ACEITO', 'ACEITO', 'ACEITO', 'RECUSADO']);
  assert.equal(r.dados.respostas[5].result.reason, 'GRUPO_COMPLETO');

  const reenvio = await post('/api/votos', { sessao, aparelho: 't2', votos: [votos[0]] });
  assert.equal(reenvio.dados.respostas[0].result.status, 'DUPLICADO');
  assert.deepEqual((await get('/api/urna')).contagem, { L1: 5, C1: 0 });
});

test('o tablet nunca recebe as escolhas, só a contagem', async () => {
  const estado = await get('/api/urna');
  assert.equal('votes' in estado, false);
  assert.equal('apuracao' in estado, false);
});

test('voto de uma votação antiga (outra sessão) é recusado com 409', async () => {
  const r = await post('/api/votos', { sessao: 'antiga', aparelho: 't1', votos: [{ id: 'z', group: 'C1', rule: 'L1' }] });
  assert.equal(r.status, 409);
  assert.equal(r.dados.erro, 'SESSAO_DIFERENTE');
});

test('regras não mudam com a votação aberta', async () => {
  const r = await post('/api/guia/regras', { regras: { L1: 'outra' } });
  assert.equal(r.status, 409);
});

test('painel da guia vê aparelhos, guardados offline e a apuração', async () => {
  await fetch(`${base}/api/urna?aparelho=tablet-ipad&pendentes=3`);
  const g = await get('/api/guia?x=1');
  assert.equal(g.recebidos, 5);
  assert.deepEqual(g.apuracao.winners, ['C1']);
  const ipad = g.aparelhos.find(a => a.id === 'tablet-ipad');
  assert.equal(ipad.pendentes, 3);
  assert.equal(ipad.online, true);
});

test('nova turma com votos exige confirmação', async () => {
  assert.equal((await post('/api/guia/turma', { alunos: 36 })).status, 409);
  const ok = await post('/api/guia/turma', { alunos: 36, confirmar: true });
  assert.equal(ok.dados.groups.length, 8);
  assert.equal(ok.dados.recebidos, 0);
});

test('JSON inválido e rota desconhecida', async () => {
  const r = await fetch(`${base}/api/votos`, { method: 'POST', body: '{nao é json' });
  assert.equal(r.status, 400);
  assert.equal((await fetch(`${base}/api/nada`)).status, 404);
});

// ---- Integração com a simulação HTML (guia + telão) ----
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GRUPOS_SIM = [
  { id: 'L1', side: 'Lia', size: 2, rule: 'Faixa para pedestres' },
  { id: 'C1', side: 'Caio', size: 2, rule: 'Motos devagar' },
];

test('limpar com a turma da guia: votação nova, fechada e sem votos', async () => {
  const { status, dados } = await post('/api/guia/limpar', { groups: GRUPOS_SIM });
  assert.equal(status, 200);
  assert.equal(dados.recebidos, 0);
  assert.equal(dados.open, false);
  assert.deepEqual(dados.groups, GRUPOS_SIM);
});

test('abrir com os grupos e regras da guia; votos do tablet voltam crus só para a guia', async () => {
  const aberto = await post('/api/guia/abrir', { groups: GRUPOS_SIM, noOwn: true });
  assert.equal(aberto.dados.open, true);
  assert.equal(aberto.dados.noOwn, true);
  const { sessao } = await get('/api/urna');
  const r = await post('/api/votos', { sessao, aparelho: 't', votos: [{ id: 'x1', group: 'L1', rule: 'C1' }, { id: 'x2', group: 'L1', rule: 'L1' }] });
  assert.deepEqual(r.dados.respostas.map(v => v.result.status), ['ACEITO', 'RECUSADO']);
  const g = await get('/api/guia');
  assert.deepEqual(g.votos, [{ id: 'x1', group: 'L1', rule: 'C1' }]);
  assert.ok(Array.isArray(g.enderecos));
});

test('reabrir com a mesma turma é aceito; com outra turma e votos, é recusado', async () => {
  assert.equal((await post('/api/guia/abrir', { groups: GRUPOS_SIM, noOwn: true })).status, 200);
  const outra = GRUPOS_SIM.map(g => ({ ...g, size: 3 }));
  assert.equal((await post('/api/guia/abrir', { groups: outra })).status, 409);
});

test('grupos inválidos são recusados', async () => {
  assert.equal((await post('/api/guia/limpar', { groups: [{ id: 'L1', side: 'Lia', size: 9, rule: '' }] })).status, 400);
  assert.equal((await post('/api/guia/limpar', { groups: [GRUPOS_SIM[0], GRUPOS_SIM[0]] })).status, 400);
});

test('serve a pasta da simulação, com Range para áudio, e não deixa sair da pasta', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-'));
  fs.writeFileSync(path.join(pasta, 'ABRIR-plenario.html'), '<h1>guia</h1>');
  fs.mkdirSync(path.join(pasta, 'audio'));
  fs.writeFileSync(path.join(pasta, 'audio', 'a.mp3'), Buffer.from('0123456789'));
  const s = criarServidor({ dataFile: null, pastaSimulacao: pasta });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const b = `http://127.0.0.1:${s.address().port}`;
  try {
    const raiz = await fetch(`${b}/`);
    assert.equal(raiz.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(await raiz.text(), '<h1>guia</h1>');
    const parte = await fetch(`${b}/audio/a.mp3`, { headers: { Range: 'bytes=2-4' } });
    assert.equal(parte.status, 206);
    assert.equal(await parte.text(), '234');
    assert.equal((await fetch(`${b}/painel`)).status, 200);
    assert.notEqual((await fetch(`${b}/%2e%2e/%2e%2e/etc/passwd`)).status, 200);
    assert.notEqual((await fetch(`${b}/..%2f..%2fetc%2fpasswd`)).status, 200);
    assert.equal((await fetch(`${b}/nao-existe.png`)).status, 404);
  } finally {
    s.close();
  }
});

test('endereço do Wi-Fi vem primeiro; VPN vai para o fim (caso do Mac da guia)', () => {
  const v4 = address => ({ address, family: 'IPv4', internal: false });
  const ips = ordenarEnderecos({
    lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    utun4: [v4('172.16.5.152')],
    en0: [v4('192.168.8.233'), { address: 'fe80::1', family: 'IPv6', internal: false }],
    bridge100: [v4('192.168.64.1')],
  });
  assert.deepEqual(ips, ['192.168.8.233', '172.16.5.152', '192.168.64.1']);
});
