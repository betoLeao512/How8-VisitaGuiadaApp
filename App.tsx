import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  AppState, Keyboard, KeyboardAvoidingView, Platform, Pressable,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { calculateScore, type AnswerResult } from './src/domain/score';

type Step = 'welcome' | 'group' | 'ready' | 'challenge' | 'result';
type Outcome = { result: AnswerResult; answer: string | null };
const OPTIONS = ['Executivo', 'Legislativo', 'Judiciário'];
const DURATION = 30;

function Action({ label, onPress, disabled = false }: {
  label: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }}
      disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [step, setStep] = useState<Step>('welcome');
  const [groupName, setGroupName] = useState('');
  const [seconds, setSeconds] = useState(DURATION);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const deadline = useRef(0);
  const answered = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const finish = useCallback((result: AnswerResult, answer: string | null) => {
    if (answered.current) return;
    answered.current = true;
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setOutcome({ result, answer });
    setStep('result');
  }, []);

  useEffect(() => {
    if (step !== 'challenge') return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) finish('timeout', null);
    };
    timer.current = setInterval(tick, 1000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') tick();
    });
    return () => {
      if (timer.current !== null) clearInterval(timer.current);
      timer.current = null;
      subscription.remove();
    };
  }, [step, finish]);

  function continueWithGroup() {
    const name = groupName.trim();
    if (!name) return;
    Keyboard.dismiss();
    setGroupName(name);
    setStep('ready');
  }

  function startChallenge() {
    deadline.current = Date.now() + DURATION * 1000;
    answered.current = false;
    setOutcome(null);
    setSeconds(DURATION);
    setStep('challenge');
  }

  function answerChallenge(answer: string) {
    if (Date.now() >= deadline.current) {
      setSeconds(0);
      finish('timeout', null);
      return;
    }
    finish(answer === 'Legislativo' ? 'correct' : 'incorrect', answer);
  }

  function restart() {
    answered.current = true;
    setGroupName('');
    setOutcome(null);
    setSeconds(DURATION);
    setStep('welcome');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Text style={styles.eyebrow}>HOW8 · PROTÓTIPO ACADÊMICO</Text>
            <View style={styles.card}>
              {step === 'welcome' && <>
                <Text accessibilityRole="header" style={styles.title}>Visita Cidadã</Text>
                <Text style={styles.body}>Uma experiência interativa para conhecer o Poder Legislativo.</Text>
                <Action label="Começar" onPress={() => setStep('group')} />
              </>}

              {step === 'group' && <>
                <Text style={styles.caption}>IDENTIFICAÇÃO</Text>
                <Text accessibilityRole="header" style={styles.title}>Nome do grupo</Text>
                <Text style={styles.body}>Como podemos chamar o seu grupo nesta visita?</Text>
                <TextInput accessibilityLabel="Nome do grupo" style={styles.input}
                  value={groupName} onChangeText={setGroupName} placeholder="Digite o nome do grupo"
                  placeholderTextColor="#64748b" maxLength={80} autoCapitalize="words"
                  returnKeyType="done" onSubmitEditing={continueWithGroup} />
                <Text style={styles.hint}>Preencha o nome para continuar.</Text>
                <Action label="Continuar" disabled={!groupName.trim()} onPress={continueWithGroup} />
              </>}

              {step === 'ready' && <>
                <Text style={styles.caption}>INÍCIO DA VISITA</Text>
                <Text accessibilityRole="header" style={styles.title}>Tudo pronto, {groupName}?</Text>
                <Text style={styles.body}>O primeiro desafio será iniciado. Observem a pergunta e escolham uma resposta em até 30 segundos.</Text>
                <Action label="Iniciar desafio" onPress={startChallenge} />
              </>}

              {step === 'challenge' && <>
                <Text style={styles.caption}>DESAFIO 1 DE 1 · {groupName}</Text>
                <View style={styles.timer}>
                  <Text style={styles.timerLabel}>Tempo restante</Text>
                  <Text accessibilityLabel={`${seconds} segundos restantes`}
                    style={[styles.time, seconds <= 10 && styles.urgent]}>{seconds}s</Text>
                </View>
                <Text accessibilityRole="header" style={styles.question}>Em qual dos três Poderes está inserida a Câmara de Vereadores?</Text>
                <Text style={styles.hint}>Toque em uma alternativa para enviar a resposta.</Text>
                {OPTIONS.map(option => (
                  <Pressable key={option} accessibilityRole="button" accessibilityLabel={option}
                    onPress={() => answerChallenge(option)}
                    style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
                    <Text style={styles.optionText}>{option}</Text>
                  </Pressable>
                ))}
              </>}

              {step === 'result' && outcome && <>
                <Text style={styles.caption}>RESULTADO DA VISITA</Text>
                <Text accessibilityRole="header" style={styles.title}>{outcome.result === 'correct'
                  ? 'Resposta correta!' : outcome.result === 'timeout' ? 'Tempo esgotado' : 'Resposta incorreta'}</Text>
                <Text style={styles.body}>Grupo: {groupName}</Text>
                <Text style={styles.body}>Resposta: {outcome.answer ?? 'tempo esgotado'}</Text>
                <Text style={styles.body}>{outcome.result === 'correct'
                  ? 'A Câmara de Vereadores integra o Poder Legislativo.'
                  : 'Não houve acerto. A resposta correta é Legislativo.'}</Text>
                <View style={styles.scoreBox}>
                  <Text style={styles.score}>{calculateScore(outcome.result)}</Text>
                  <Text style={styles.timerLabel}>pontos</Text>
                </View>
                <Action label="Reiniciar" onPress={restart} />
              </>}
            </View>
            <Text style={styles.footer}>Visita Cidadã · Etapa 1</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#f4f7fa' },
  page: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 48 },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 20 },
  eyebrow: { color: '#475569', fontSize: 12, fontWeight: '700', letterSpacing: 1.1 },
  card: { backgroundColor: '#fff', padding: 24, borderRadius: 20, borderWidth: 1, borderColor: '#dbe3ec', gap: 18 },
  caption: { fontSize: 12, color: '#475569', fontWeight: '700', letterSpacing: 0.7 },
  title: { color: '#172b4d', fontSize: 30, fontWeight: '700', lineHeight: 38 },
  question: { color: '#172b4d', fontSize: 24, fontWeight: '700', lineHeight: 33 },
  body: { color: '#334155', fontSize: 17, lineHeight: 26 },
  hint: { color: '#475569', fontSize: 14, lineHeight: 21 },
  input: { borderWidth: 1, borderColor: '#94a3b8', borderRadius: 10, padding: 15, color: '#172b4d', fontSize: 17, minHeight: 52 },
  button: { backgroundColor: '#194f86', borderRadius: 10, minHeight: 54, padding: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  disabled: { backgroundColor: '#64748b', opacity: 0.65 },
  pressed: { opacity: 0.7 },
  option: { borderWidth: 1, borderColor: '#94a3b8', borderRadius: 10, padding: 17, minHeight: 56 },
  optionText: { color: '#172b4d', fontSize: 18, fontWeight: '600' },
  timer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 10, backgroundColor: '#eef4fa' },
  timerLabel: { color: '#334155', fontSize: 16 },
  time: { color: '#194f86', fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  urgent: { color: '#a33122' },
  scoreBox: { alignItems: 'center', paddingVertical: 18, borderRadius: 12, backgroundColor: '#eef4fa' },
  score: { color: '#194f86', fontSize: 52, fontWeight: '700' },
  footer: { color: '#64748b', textAlign: 'center', fontSize: 13 },
});
