export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { email, userId } = req.query;

  if (!email && !userId) {
    return res.status(400).json({ success: false, error: "E-mail ou User ID necessário." });
  }

  try {
    const emailBusca = email ? email.toLowerCase().trim() : null;
    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!ACCESS_TOKEN) {
      return res.status(500).json({ success: false, error: 'Token do Mercado Pago não configurado.' });
    }

    // Consulta os pagamentos recentes no Mercado Pago usando a referência do usuário
    const referenciaBusca = userId || emailBusca;
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&external_reference=${referenciaBusca}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
    });

    const mpData = await mpRes.json();
    const pagamentoAprovado = mpData.results?.find(p => p.status === 'approved');

    if (pagamentoAprovado) {
      return res.status(200).json({ 
        success: true, 
        vip: true, 
        paymentId: pagamentoAprovado.id,
        message: "Pagamento confirmado com sucesso! Acesso VIP liberado." 
      });
    }

    return res.status(200).json({ 
      success: true, 
      vip: false, 
      message: "Pagamento ainda não localizado. Conclua o Pix e tente novamente em instantes." 
    });

  } catch (err) {
    console.error("Erro ao checar Pix:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
