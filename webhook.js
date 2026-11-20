import { getDb } from './_firebase.js';
import { ativarVipPorPagamento, getAccessToken } from './_vip.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const paymentId = req.body?.data?.id || req.query['data.id'] || req.query.id;
    if (!paymentId) return res.status(200).json({ received: true });

    const accessToken = getAccessToken();
    if (!accessToken) {
      console.error('❌ Webhook: token do Mercado Pago não configurado.');
      return res.status(500).json({ error: 'Token não configurado' });
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!mpResponse.ok) {
      console.error(`❌ Webhook: Mercado Pago respondeu ${mpResponse.status} para o pagamento ${paymentId}`);
      return res.status(500).json({ error: 'Falha ao consultar pagamento' });
    }
    const payment = await mpResponse.json();
    console.log(`LOG - Pagamento ${paymentId}: ${payment.status}`);

    if (payment.status !== 'approved') return res.status(200).json({ received: true });

    const resultado = await ativarVipPorPagamento(getDb(), payment);
    console.log(`LOG - Pagamento ${paymentId}: ${resultado.motivo}`);

    // Usuário ainda não encontrado: responde 500 para o Mercado Pago tentar de novo mais tarde.
    if (resultado.motivo === 'usuario_nao_encontrado') {
      return res.status(500).json({ error: 'Usuário não encontrado' });
    }
    return res.status(200).json({ status: 'success', ...resultado });
  } catch (error) {
    console.error('❌ Erro no Webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
