#!/usr/bin/env node
/*
 * Servidorzinho da urna, para rodar no PC da guia (Node 24 ou mais novo).
 *
 *   node servidor/servidor-urna.mjs            (porta 8787)
 *   PORTA=9000 node servidor/servidor-urna.mjs
 *
 * Recebe os votos dos tablets pela rede Wi-Fi e mostra o painel da guia em http://localhost:8787.
 * Usa a MESMA regra de votos do App (src/domain/urna.ts e groups.ts): limite por grupo,
 * voto repetido conta uma vez, urna fechada não aceita voto novo.
 * O estado fica salvo em servidor/dados/sessao.json, então reiniciar o PC não perde votos.
 * Não usa nenhuma biblioteca de fora.
 */
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { apurar, contagemPorGrupo, registrarVoto, totalAlunos } from '../src/domain/urna.ts';
import { formGroups } from '../src/domain/groups.ts';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MAX_CORPO = 64 * 1024;
const MAX_VOTOS_POR_ENVIO = 50;
const MAX_REGRA = 280;
const APARELHO_SUMIDO_MS = 15_000;

function novaSessao(alunos = 9) {
  return {
    sessao: crypto.randomUUID(),
    open: false,
    noOwn: false,
    groups: formGroups(alunos).map(g => ({ ...g, rule: '' })),
    votes: [],
  };
}

/** Cria o servidor. Exportado para os testes; `dataFile: null` desliga o arquivo. */
export function criarServidor({ dataFile = path.join(AQUI, 'dados', 'sessao.json'), agora = () => Date.now() } = {}) {
  let estado = carregar() ?? novaSessao();
  const aparelhos = new Map(); // id → { pendentes, visto }

  function carregar() {
    if (!dataFile || !fs.existsSync(dataFile)) return null;
    try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch { return null; }
  }
  function salvar() {
    if (!dataFile) return;
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(estado, null, 2));
    fs.renameSync(tmp, dataFile);
  }

  const publico = () => ({
    sessao: estado.sessao, open: estado.open, noOwn: estado.noOwn,
    groups: estado.groups, contagem: contagemPorGrupo(estado), total: totalAlunos(estado.groups),
  });

  function verAparelho(id, pendentes) {
    if (typeof id !== 'string' || !id || id.length > 80) return;
    aparelhos.set(id, { pendentes: Number.isInteger(pendentes) && pendentes >= 0 ? pendentes : 0, visto: agora() });
  }
  const listaAparelhos = () => [...aparelhos].map(([id, a]) => ({
    id, pendentes: a.pendentes, online: agora() - a.visto < APARELHO_SUMIDO_MS, vistoHa: Math.round((agora() - a.visto) / 1000),
  }));

  const guia = x => ({
    ...publico(), recebidos: estado.votes.length, aparelhos: listaAparelhos(),
    apuracao: estado.votes.length ? serializar(apurar(estado.groups, estado.votes, x)) : null,
  });
  const serializar = r => ({ ...r, winners: [...r.winners] });

  // ---- rotas ----
  const rotas = {
    'GET /api/urna': (_c, url) => {
      verAparelho(url.searchParams.get('aparelho'), Number(url.searchParams.get('pendentes')));
      return [200, publico()];
    },
    'POST /api/votos': corpo => {
      if (!corpo || typeof corpo !== 'object') return [400, { erro: 'Corpo inválido.' }];
      verAparelho(corpo.aparelho, corpo.pendentes);
      if (corpo.sessao !== estado.sessao) return [409, { erro: 'SESSAO_DIFERENTE', sessao: estado.sessao }];
      if (!Array.isArray(corpo.votos) || corpo.votos.length > MAX_VOTOS_POR_ENVIO) return [400, { erro: 'Lista de votos inválida.' }];
      const respostas = [];
      for (const v of corpo.votos) {
        const r = registrarVoto(estado, v);
        estado = r.session;
        respostas.push({ id: typeof v?.id === 'string' ? v.id : '', result: r.result });
      }
      salvar();
      return [200, { respostas }];
    },
    'GET /api/guia': (_c, url) => [200, guia(Math.min(3, Math.max(1, Number(url.searchParams.get('x')) || 1)))],
    'POST /api/guia/turma': corpo => {
      if (estado.votes.length && !corpo?.confirmar) return [409, { erro: 'Já há votos nesta votação. Confirme para apagar e começar outra.' }];
      try { estado = novaSessao(corpo?.alunos); } catch (e) { return [400, { erro: e.message }]; }
      salvar();
      return [200, guia(1)];
    },
    'POST /api/guia/regras': corpo => {
      if (estado.open || estado.votes.length) return [409, { erro: 'As regras não mudam depois de abrir a votação.' }];
      const regras = corpo?.regras;
      if (!regras || typeof regras !== 'object') return [400, { erro: 'Envie { regras: { L1: "..." } }.' }];
      estado = { ...estado, groups: estado.groups.map(g => typeof regras[g.id] === 'string' ? { ...g, rule: regras[g.id].trim().slice(0, MAX_REGRA) } : g) };
      salvar();
      return [200, guia(1)];
    },
    'POST /api/guia/proibir-propria': corpo => {
      if (estado.open || estado.votes.length) return [409, { erro: 'Essa opção só muda antes de abrir a votação.' }];
      estado = { ...estado, noOwn: corpo?.valor === true };
      salvar();
      return [200, guia(1)];
    },
    'POST /api/guia/abrir': () => { estado = { ...estado, open: true }; salvar(); return [200, guia(1)]; },
    'POST /api/guia/fechar': () => { estado = { ...estado, open: false }; salvar(); return [200, guia(1)]; },
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // CORS aberto: permite que a simulação HTML (aberta do arquivo) também converse com o servidor.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/painel')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(AQUI, 'painel.html')));
    }

    const rota = rotas[`${req.method} ${url.pathname}`];
    if (!rota) return responder(res, 404, { erro: 'Rota não encontrada.' });

    let tamanho = 0;
    const partes = [];
    req.on('data', c => {
      tamanho += c.length;
      if (tamanho > MAX_CORPO) { responder(res, 413, { erro: 'Corpo grande demais.' }); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let corpo = null;
      if (partes.length) {
        try { corpo = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { return responder(res, 400, { erro: 'JSON inválido.' }); }
      }
      try {
        const [status, dados] = rota(corpo, url);
        responder(res, status, dados);
      } catch (e) {
        responder(res, 500, { erro: 'Erro interno.' });
        console.error(e);
      }
    });
  });

  return server;
}

function responder(res, status, dados) {
  if (res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(dados));
}

function enderecosDaRede() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
}

// Execução direta (não nos testes).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const porta = Number(process.env.PORTA) || 8787;
  criarServidor().listen(porta, '0.0.0.0', () => {
    console.log('\nUrna do Plenário: servidor ligado.\n');
    console.log(`  Painel da guia (neste PC):  http://localhost:${porta}`);
    const ips = enderecosDaRede();
    if (ips.length) {
      console.log('\n  Endereço para digitar no tablet:');
      for (const ip of ips) console.log(`    ${ip}:${porta}`);
    } else {
      console.log('\n  Atenção: este PC não parece estar em nenhuma rede Wi-Fi ou cabeada.');
    }
    console.log('\nPara desligar: Ctrl+C.\n');
  });
}
