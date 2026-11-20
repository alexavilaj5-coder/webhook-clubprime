// =============================================================
// MÓDULO DE SONS E VIBRAÇÃO
// Sons sintetizados via Web Audio API (sem arquivos de áudio).
// =============================================================

let ctx = null;
let somAtivo = true;
let vibracaoAtiva = true;

try {
  somAtivo = localStorage.getItem('somAtivo') !== 'false';
  vibracaoAtiva = localStorage.getItem('vibracaoAtiva') !== 'false';
} catch (e) { /* storage indisponível: mantém padrão */ }

/** Liga/desliga o som (e lembra a escolha). */
export function setSomAtivo(valor) {
  somAtivo = !!valor;
  try { localStorage.setItem('somAtivo', String(somAtivo)); } catch (e) {}
}

/** Liga/desliga a vibração (e lembra a escolha). */
export function setVibracaoAtiva(valor) {
  vibracaoAtiva = !!valor;
  try { localStorage.setItem('vibracaoAtiva', String(vibracaoAtiva)); } catch (e) {}
}

function obterContexto() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Navegadores deixam o áudio "suspenso" até haver um toque do usuário
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Destrava o áudio no primeiro toque/clique (exigência de iOS e Chrome)
['pointerdown', 'touchstart', 'keydown'].forEach((evento) => {
  window.addEventListener(evento, () => obterContexto(), { once: true, passive: true });
});

function tom({ freq, inicio = 0, duracao = 0.12, tipo = 'sine', volume = 0.15 }) {
  const c = obterContexto();
  if (!c || !somAtivo) return;

  const t0 = c.currentTime + inicio;
  const osc = c.createOscillator();
  const ganho = c.createGain();

  osc.type = tipo;
  osc.frequency.setValueAtTime(freq, t0);

  // Envelope curto para evitar "estalos"
  ganho.gain.setValueAtTime(0.0001, t0);
  ganho.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
  ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);

  osc.connect(ganho).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duracao + 0.02);
}

/** Som leve e sutil de clique */
export function somCliqueLeve() {
  tom({ freq: 880, duracao: 0.05, tipo: 'triangle', volume: 0.08 });
}

/** Som de sucesso / resgate de cupom */
export function somSucesso() {
  tom({ freq: 523.25, inicio: 0,    duracao: 0.12 }); // Dó
  tom({ freq: 659.25, inicio: 0.10, duracao: 0.12 }); // Mi
  tom({ freq: 783.99, inicio: 0.20, duracao: 0.22 }); // Sol
}

/** Som de ativação do VIP */
export function somAtivacaoVip() {
  tom({ freq: 523.25,  inicio: 0,    duracao: 0.14, tipo: 'triangle' });
  tom({ freq: 659.25,  inicio: 0.12, duracao: 0.14, tipo: 'triangle' });
  tom({ freq: 783.99,  inicio: 0.24, duracao: 0.14, tipo: 'triangle' });
  tom({ freq: 1046.5,  inicio: 0.36, duracao: 0.35, tipo: 'triangle' });
}

/** Vibração unificada: 'leve' | 'media' | 'forte' | 'sucesso' */
export function vibrar(tipo = 'leve') {
  if (!vibracaoAtiva || !('vibrate' in navigator)) return; // iOS Safari não suporta
  const padroes = {
    leve: 10,
    media: 25,
    forte: 50,
    sucesso: [20, 40, 20],
  };
  try { navigator.vibrate(padroes[tipo] ?? padroes.leve); } catch (e) {}
}

// Expõe globalmente no window mantendo a compatibilidade do sistema
window.reproduzirEfeito = function (acao) {
  switch (acao) {
    case 'clique':
    case 'click':
      somCliqueLeve(); vibrar('leve'); break;
    case 'sucesso':
    case 'cupom':
      somSucesso(); vibrar('sucesso'); break;
    case 'vip':
      somAtivacaoVip(); vibrar('forte'); break;
    default:
      somCliqueLeve(); vibrar('leve');
  }
};
