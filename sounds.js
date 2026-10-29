// =============================================================
// MÓDULO DE SONS LEVES E VIBRAÇÃO (Web Audio API & Vibration API)
// =============================================================

// Cria um contexto de áudio seguro para navegadores
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Som leve de clique ou toque (ex: botões, abas)
 */
export function somCliqueLeve() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.03, ctx.currentTime); // Volume bem baixo e suave
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {
    // Ignora se o navegador bloquear autoplay sem interação
  }
}

/**
 * Som de sucesso / resgate de cupom
 */
export function somSucesso() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Acorde agradável (duas notas sequenciais)
    [523.25, 659.25, 783.99].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + index * 0.08);

      gain.gain.setValueAtTime(0.05, now + index * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.08 + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.08);
      osc.stop(now + index * 0.08 + 0.2);
    });
  } catch (e) {}
}

/**
 * Som triunfal e festivo para ativação do VIP
 */
export function somAtivacaoVip() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notas = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50]; // Escala alegre

    notas.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.07);

      gain.gain.setValueAtTime(0.08, now + index * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.07 + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.07);
      osc.stop(now + index * 0.07 + 0.25);
    });
  } catch (e) {}
}

/**
 * Função unificada de Vibração (Celulares / PWA)
 * @param {string} tipo - 'leve', 'sucesso', 'vip'
 */
export function vibrar(tipo = 'leve') {
  if (!navigator.vibrate) return; // Se o dispositivo não suporta vibração

  switch (tipo) {
    case 'leve':
      navigator.vibrate(25); // Toque rápido e sutil
      break;
    case 'sucesso':
      navigator.vibrate([40, 60, 40]); // Padrão duplo leve
      break;
    case 'vip':
      navigator.vibrate([80, 100, 80, 100, 150]); // Vibração comemorativa mais longa
      break;
    default:
      navigator.vibrate(30);
  }
}

// Expõe globalmente no window para facilitar chamadas diretas no HTML ou app.js se preferir
window.reproduzirEfeito = function(acao) {
  if (acao === 'clique') {
    somCliqueLeve();
    vibrar('leve');
  } else if (acao === 'sucesso') {
    somSucesso();
    vibrar('sucesso');
  } else if (acao === 'vip') {
    somAtivacaoVip();
    vibrar('vip');
  }
};
