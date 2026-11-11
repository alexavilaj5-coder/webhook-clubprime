// Regras de negócio do VIP, compartilhadas por webhook.js, checar-pix.js e criar-pix.js.
export const PRECO_VIP = 19.90;
export const DIAS_VIP = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

export function getAccessToken() {
  return process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
}

// Descobre o documento do usuário a partir do external_reference (uid ou e-mail) e do e-mail do pagador.
async function localizarUsuario(db, externalRef, emailPagador) {
  if (externalRef && !String(externalRef).includes('@')) {
    const snap = await db.collection('usuarios').doc(String(externalRef)).get();
    if (snap.exists) return snap.ref;
  }
  const email = (String(externalRef || '').includes('@') ? externalRef : emailPagador || '').toLowerCase().trim();
  if (email) {
    const q = await db.collection('usuarios').where('email', '==', email).limit(1).get();
    if (!q.empty) return q.docs[0].ref;
  }
  return null;
}

// Ativa (ou renova) o VIP de forma idempotente: cada pagamento só vale UMA vez.
// O controle é o documento pagamentos_pix/{paymentId}, que também alimenta o painel financeiro.
export async function ativarVipPorPagamento(db, payment) {
  if (!payment || payment.status !== 'approved') return { ativado: false, motivo: 'nao_aprovado' };
  if (Number(payment.transaction_amount) < PRECO_VIP) return { ativado: false, motivo: 'valor_incorreto' };

  const paymentId = String(payment.id);
  const emailPagador = payment.payer?.email?.toLowerCase()?.trim() || null;
  const userRef = await localizarUsuario(db, payment.external_reference, emailPagador);
  if (!userRef) return { ativado: false, motivo: 'usuario_nao_encontrado' };

  const pagRef = db.collection('pagamentos_pix').doc(paymentId);

  return db.runTransaction(async (tx) => {
    const [pagSnap, userSnap] = await Promise.all([tx.get(pagRef), tx.get(userRef)]);
    const u = userSnap.data() || {};
    const agora = new Date();

    const registro = {
      paymentId,
      usuarioUid: userRef.id,
      nome: u.nome || payment.payer?.first_name || 'Cliente',
      email: u.email || emailPagador || '',
      whatsapp: u.whatsapp || '',
      valor: Number(payment.transaction_amount),
      dataHora: payment.date_approved || agora.toISOString()
    };

    if (pagSnap.exists) return { ativado: false, motivo: 'ja_processado' };

    // Pagamentos feitos antes desta versão já deram VIP (lastPaymentId): só registra, não soma dias de novo.
    if (u.lastPaymentId && String(u.lastPaymentId) === paymentId) {
      tx.set(pagRef, registro);
      return { ativado: false, motivo: 'ja_processado' };
    }

    // Renovação soma em cima do que ainda resta de VIP.
    let base = agora;
    if (u.vip && u.vipExpiraEm) {
      const atual = new Date(u.vipExpiraEm);
      if (atual > agora) base = atual;
    }
    const expira = new Date(base.getTime() + DIAS_VIP * DIA_MS);

    tx.set(userRef, {
      vip: true,
      vipExpiraEm: expira.toISOString(),
      vipAtivadoEm: agora.toISOString(),
      origemVip: 'pix',
      lastPaymentId: paymentId,
      atualizadoEm: agora.toISOString()
    }, { merge: true });
    tx.set(pagRef, registro);

    return { ativado: true, motivo: 'ativado', vipExpiraEm: expira.toISOString() };
  });
}
