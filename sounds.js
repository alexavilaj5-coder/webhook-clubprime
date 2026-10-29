// =============================================================
// MÓDULO DE SONS E VIBRAÇÃO (MODO SILENCIOSO / MUDO)
// =============================================================

/**
 * Som leve e sutil de clique (MUDO)
 */
export function somCliqueLeve() {
  // Modo mudo ativado
}

/**
 * Som de sucesso / resgate de cupom (MUDO)
 */
export function somSucesso() {
  // Modo mudo ativado
}

/**
 * Som de ativação do VIP (MUDO)
 */
export function somAtivacaoVip() {
  // Modo mudo ativado
}

/**
 * Função unificada de Vibração (MUDO)
 */
export function vibrar(tipo = 'leve') {
  // Modo mudo ativado
}

// Expõe globalmente no window mantendo a compatibilidade do sistema
window.reproduzirEfeito = function(acao) {
  // Modo mudo ativado - NENHUM SOM OU VIBRAÇÃO SERÁ REPRODUZIDO
};
