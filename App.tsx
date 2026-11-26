import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { totalAlunos, type GrupoUrna } from './src/domain/urna';
import { normalizarEndereco } from './src/rede/protocolo';
import { useUrna, type Aviso } from './src/urna/useUrna';

type Fase = 'pronto' | 'grupo' | 'regra' | 'guardado';

const COR = {
  tinta: '#1d1b2f', suave: '#5d5a73', linha: '#d9d5e6', fundo: '#f6f4fb', tela: '#ffffff',
  lia: '#e8742c', caio: '#2a6fdb', ok: '#1f8a4c', alerta: '#b3261e', destaque: '#efe9fb',
};
const corDoLado = (g: GrupoUrna) => (g.side === 'Lia' ? COR.lia : COR.caio);

const MOTIVO: Record<Aviso['motivo'], string> = {
  GRUPO_COMPLETO: 'o grupo escolhido já estava completo',
  URNA_FECHADA: 'a votação já tinha sido encerrada',
  SESSAO_ENCERRADA: 'eram de uma votação anterior',
  VOTO_NA_PROPRIA_REGRA: 'era voto na regra do próprio grupo',
  GRUPO_INEXISTENTE: 'o grupo não existe mais',
  REGRA_INEXISTENTE: 'a regra não existe mais',
  VOTO_INVALIDO: 'o voto chegou com defeito',
};

export default function App() {
  const urna = useUrna();
  const { estado } = urna;
  const [fase, setFase] = useState<Fase>('pronto');
  const [grupo, setGrupo] = useState<string | null>(null);
  const [regra, setRegra] = useState<string | null>(null);
  const [configurando, setConfigurando] = useState(false);

  // Se a guia fechar a votação ou trocar de turma no meio, a tela volta ao começo.
  const aberta = Boolean(estado?.open);
  const sessao = estado?.sessao;
  useEffect(() => { setFase('pronto'); setGrupo(null); setRegra(null); }, [aberta, sessao]);

  const cheio = (g: GrupoUrna) => (urna.contagem[g.id] ?? 0) >= g.size;
  const total = estado ? totalAlunos(estado.groups) : 0;
  const votados = Object.values(urna.contagem).reduce((a, n) => a + n, 0);

  let conteudo: React.ReactNode;
  if (!urna.carregado) {
    conteudo = <Mensagem titulo="Carregando…" />;
  } else if (configurando || !urna.servidor) {
    conteudo = (
      <Configuracao
        atual={urna.servidor}
        aparelho={urna.aparelho}
        onSalvar={async base => { setConfigurando(false); await urna.definirServidor(base); }}
        onCancelar={urna.servidor ? () => setConfigurando(false) : undefined}
      />
    );
  } else if (!estado) {
    conteudo = (
      <Mensagem titulo="Procurando o PC da guia…" texto={`Endereço: ${urna.servidor}. Confira se o servidor está ligado e se o tablet está no mesmo Wi-Fi.`}>
        <Botao rotulo="Mudar endereço" fantasma onPress={() => setConfigurando(true)} />
      </Mensagem>
    );
  } else if (!estado.open) {
    conteudo = (
      <Mensagem titulo="Urna fechada" texto="Aguardando a guia abrir a votação.">
        <Botao rotulo="Mudar endereço" fantasma onPress={() => setConfigurando(true)} />
      </Mensagem>
    );
  } else if (fase === 'guardado') {
    conteudo = (
      <Mensagem titulo="Voto guardado" texto="Passe o tablet para a próxima pessoa.">
        <Botao rotulo="Próxima pessoa" onPress={() => setFase('pronto')} />
      </Mensagem>
    );
  } else if (votados >= total) {
    conteudo = <Mensagem titulo="Todos votaram" texto="Pode devolver o tablet para a guia." />;
  } else if (fase === 'pronto') {
    conteudo = (
      <Mensagem titulo="Sua vez de votar" texto="Ninguém vê o seu voto. Quando estiver pronto, toque no botão.">
        <Botao rotulo="Estou pronto" onPress={() => setFase('grupo')} />
      </Mensagem>
    );
  } else if (fase === 'grupo') {
    conteudo = (
      <View style={s.bloco}>
        <Text style={s.h2}>De qual grupo você é?</Text>
        <Text style={s.sub}>Serve só para mostrar no final como a turma mudou de ideia. Seu nome não aparece.</Text>
        <View style={s.grupos}>
          {estado.groups.map(g => {
            const travado = cheio(g);
            return (
              <Pressable
                key={g.id}
                accessibilityRole="button"
                accessibilityLabel={`Grupo ${g.id}${travado ? ', todos já votaram' : ''}`}
                accessibilityState={{ disabled: travado }}
                disabled={travado}
                onPress={() => { setGrupo(g.id); setRegra(null); setFase('regra'); }}
                style={({ pressed }) => [s.grupo, { borderColor: corDoLado(g) }, travado && s.travado, pressed && s.pressionado]}
              >
                <Text style={[s.grupoTexto, travado && s.riscado]}>
                  Grupo {g.id} · {g.side}{travado ? ' · todos já votaram' : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.ajuda}>Se o seu grupo aparece como "todos já votaram", chame a guia.</Text>
      </View>
    );
  } else {
    conteudo = (
      <View style={s.bloco}>
        <Text style={s.h2}>Qual regra você quer para a rua?</Text>
        {estado.noOwn ? <Text style={s.ajuda}>Não vale votar na regra do seu próprio grupo.</Text> : null}
        <View style={s.cedula}>
          {estado.groups.map(g => {
            const proibida = estado.noOwn && g.id === grupo;
            const marcada = regra === g.id;
            return (
              <Pressable
                key={g.id}
                accessibilityRole="button"
                accessibilityLabel={`Regra do grupo ${g.id}`}
                accessibilityState={{ selected: marcada, disabled: proibida }}
                disabled={proibida}
                onPress={() => setRegra(g.id)}
                style={[s.opcao, marcada && s.opcaoMarcada, proibida && s.travado]}
              >
                <Text style={[s.etiqueta, { color: corDoLado(g) }]}>Regra do grupo {g.id}</Text>
                <Text style={s.regraTexto}>{g.rule || '(regra ainda não escrita)'}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={s.linha}>
          <Botao rotulo="Voltar" fantasma onPress={() => { setRegra(null); setFase('grupo'); }} />
          <View style={{ flex: 1 }} />
          <Botao
            rotulo="Confirmar meu voto"
            desabilitado={!regra}
            onPress={async () => {
              const g = estado.groups.find(x => x.id === grupo);
              // Segunda conferência do limite, no momento de confirmar (como na simulação 3).
              if (!g || !regra || cheio(g)) { setFase('grupo'); return; }
              await urna.votar(g.id, regra);
              setGrupo(null); setRegra(null); setFase('guardado');
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={s.raiz}>
      <StatusBar style="dark" />
      <View style={s.topo}>
        <Text style={s.titulo}>Urna · Plenário em Jogo</Text>
        {urna.servidor ? <Rede online={urna.online} guardados={urna.pendentes.length} /> : null}
      </View>
      {urna.avisos.length ? (
        <View style={s.alerta} accessibilityRole="alert">
          {urna.avisos.map((a, k) => (
            <Text key={k} style={s.alertaTexto}>
              {a.quantidade} {a.quantidade === 1 ? 'voto não foi aceito' : 'votos não foram aceitos'} pelo PC: {MOTIVO[a.motivo]}.
            </Text>
          ))}
          <Text style={s.alertaTexto}>Avise a guia.</Text>
          <Botao rotulo="Entendi" fantasma onPress={urna.dispensarAvisos} />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={s.rolagem} keyboardShouldPersistTaps="handled">
        <View style={s.tela}>{conteudo}</View>
      </ScrollView>
    </View>
  );
}

function Rede({ online, guardados }: { online: boolean; guardados: number }) {
  const texto = `${online ? 'Conectado ao PC da guia' : 'Sem rede'}${guardados ? ` · ${guardados} ${guardados === 1 ? 'voto guardado' : 'votos guardados'} aguardando envio` : ''}`;
  return (
    <View style={s.rede} accessibilityLabel={texto}>
      <View style={[s.ponto, { backgroundColor: online ? COR.ok : COR.alerta }]} />
      <Text style={s.redeTexto}>{texto}</Text>
    </View>
  );
}

function Configuracao({ atual, aparelho, onSalvar, onCancelar }: {
  atual: string | null; aparelho: string; onSalvar: (base: string) => void; onCancelar?: () => void;
}) {
  const [texto, setTexto] = useState(atual?.replace(/^https?:\/\//, '') ?? '');
  const [erro, setErro] = useState(false);
  return (
    <View style={s.bloco}>
      <Text style={s.h2}>Endereço do PC da guia</Text>
      <Text style={s.sub}>Aparece na janela do servidor, por exemplo 192.168.0.10:8787. O tablet precisa estar no mesmo Wi-Fi do PC.</Text>
      <TextInput
        accessibilityLabel="Endereço do PC da guia"
        value={texto}
        onChangeText={t => { setTexto(t); setErro(false); }}
        placeholder="192.168.0.10:8787"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={s.entrada}
      />
      {erro ? <Text style={[s.ajuda, { color: COR.alerta }]}>Endereço inválido. Use números e pontos, com a porta depois dos dois-pontos.</Text> : null}
      <View style={s.linha}>
        {onCancelar ? <Botao rotulo="Cancelar" fantasma onPress={onCancelar} /> : null}
        <View style={{ flex: 1 }} />
        <Botao rotulo="Conectar" onPress={() => { const base = normalizarEndereco(texto); if (!base) setErro(true); else onSalvar(base); }} />
      </View>
      <Text style={s.sub}>Nome deste aparelho no painel: {aparelho}</Text>
    </View>
  );
}

function Mensagem({ titulo, texto, children }: { titulo: string; texto?: string; children?: React.ReactNode }) {
  return (
    <View style={[s.bloco, s.centro]}>
      <Text style={s.grande}>{titulo}</Text>
      {texto ? <Text style={[s.sub, s.textoCentro]}>{texto}</Text> : null}
      {children}
    </View>
  );
}

function Botao({ rotulo, onPress, fantasma, desabilitado }: {
  rotulo: string; onPress: () => void; fantasma?: boolean; desabilitado?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ disabled: Boolean(desabilitado) }}
      disabled={desabilitado}
      onPress={onPress}
      style={({ pressed }) => [s.botao, fantasma && s.botaoFantasma, desabilitado && s.travado, pressed && s.pressionado]}
    >
      <Text style={[s.botaoTexto, fantasma && { color: COR.tinta }]}>{rotulo}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: COR.fundo },
  topo: { paddingHorizontal: 20, paddingTop: 36, paddingBottom: 8, gap: 6 },
  titulo: { fontSize: 20, fontWeight: '800', color: COR.tinta },
  rede: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ponto: { width: 12, height: 12, borderRadius: 6 },
  redeTexto: { fontSize: 15, color: COR.suave },
  alerta: { marginHorizontal: 20, padding: 14, borderRadius: 12, backgroundColor: '#fdecea', gap: 6 },
  alertaTexto: { color: COR.alerta, fontSize: 16, fontWeight: '600' },
  rolagem: { flexGrow: 1, padding: 20 },
  tela: { width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: COR.tela, borderRadius: 18, borderWidth: 2, borderColor: COR.linha, padding: 20 },
  bloco: { gap: 14 },
  centro: { alignItems: 'center', paddingVertical: 36 },
  textoCentro: { textAlign: 'center' },
  grande: { fontSize: 32, fontWeight: '800', color: COR.tinta, textAlign: 'center' },
  h2: { fontSize: 26, fontWeight: '800', color: COR.tinta },
  sub: { fontSize: 17, color: COR.suave },
  ajuda: { fontSize: 15, color: COR.suave, borderLeftWidth: 4, borderLeftColor: '#c9a227', paddingLeft: 10 },
  grupos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  grupo: { borderWidth: 3, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, minHeight: 56, justifyContent: 'center', backgroundColor: COR.tela },
  grupoTexto: { fontSize: 18, fontWeight: '700', color: COR.tinta },
  riscado: { textDecorationLine: 'line-through' },
  cedula: { gap: 10 },
  opcao: { borderWidth: 3, borderColor: COR.linha, borderRadius: 14, padding: 14, gap: 6, backgroundColor: COR.tela },
  opcaoMarcada: { borderColor: COR.tinta, backgroundColor: COR.destaque },
  etiqueta: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase' },
  regraTexto: { fontSize: 18, color: COR.tinta },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  entrada: { borderWidth: 2, borderColor: COR.linha, borderRadius: 10, padding: 12, fontSize: 20 },
  botao: { backgroundColor: COR.tinta, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 22, minHeight: 52, justifyContent: 'center', borderWidth: 2, borderColor: COR.tinta },
  botaoFantasma: { backgroundColor: 'transparent' },
  botaoTexto: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  travado: { opacity: 0.4 },
  pressionado: { opacity: 0.7 },
});
