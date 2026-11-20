import { getDb } from './_firebase.js';
import { ativarVipPorPagamento, getAccessToken, DIAS_VIP } from './_vip.js';

async function buscarAprovados(token, externalRef) {
  const url = 'https://api.mercadopago.com/v1/payments/search'
    + `?status=approved&external_reference=${encodeURIComponent(externalRef)}`
    + '&sort=date_approved&criteria=desc&limit=10';
  const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'Erro ao consultar transações no Mercado Pago.');
  return data.results || [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { email, userId } = req.query;
  if (!email && !userId) {
    return res.status(400).json({ success: false, error: 'E-mail ou ID do usuário é obrigatório para verificação.' });
  }

  try {
    const token = getAccessToken();
    if (!token) {
      return res.status(500).json({ success: false, error: 'Token do Mercado Pago não configurado na Vercel.' });
    }

    const emailUsuario = email ? String(email).toLowerCase().trim() : null;
    const referencias = [userId, emailUsuario].filter(Boolean);

    // Junta os pagamentos aprovados por uid e por e-mail (pagamentos antigos usavam o e-mail), sem repetir.
    const porId = new Map();
    for (const ref of referencias) {
      for (const p of await buscarAprovados(token, ref)) porId.set(String(p.id), p);
    }

    // Só interessam pagamentos recentes: um Pix aprovado há mais de 30 dias não deve liberar nada.
    const limite = Date.now() - DIAS_VIP * 24 * 60 * 60 * 1000;
    const recentes = [...porId.values()]
      .filter((p) => !p.date_approved || new Date(p.date_approved).getTime() >= limite)
      .sort((a, b) => new Date(a.date_approved || 0) - new Date(b.date_approved || 0));

    const db = getDb();
    let ativadoAgora = false;
    for (const pagamento of recentes) {
      const r = await ativarVipPorPagamento(db, pagamento);
      if (r.ativado) {
        ativadoAgora = true;
        console.log(`👑 VIP ativado pelo pagamento ${pagamento.id}`);
      }
    }

    if (ativadoAgora) {
      return res.status(200).json({
        success: true,
        vip: true,
        ativado: true,
        message: 'Pagamento confirmado com sucesso! Acesso VIP liberado.'
      });
    }

    // vip:true significa "ativado nesta chamada"; quem já era VIP e não tem pagamento novo cai aqui.
    return res.status(200).json({
      success: true,
      vip: false,
      ativado: false,
      message: 'Pagamento ainda não localizado. Conclua o Pix e tente novamente em instantes.'
    });
  } catch (err) {
    console.error('❌ ERRO CRÍTICO NO HANDLER:', err.message);
    return res.status(500).json({ success: false, vip: false, error: err.message });
  }
}
