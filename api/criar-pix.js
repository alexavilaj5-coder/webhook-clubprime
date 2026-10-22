export default async function handler(req, res) {
  // Configura CORS para permitir requisições do seu app web
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    const { email, nome, userId } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'E-mail do usuário é obrigatório.' });
    }

    const emailLimpo = email.toLowerCase().trim();
    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

    if (!ACCESS_TOKEN) {
      return res.status(500).json({ success: false, error: 'Token do Mercado Pago não configurado no servidor.' });
    }

    // Dados da cobrança para o Mercado Pago
    const paymentData = {
      transaction_amount: 1.20,
      description: "Assinatura VIP - Clube PRIME",
      payment_method_id: "pix",
      payer: {
        email: emailLimpo,
        first_name: nome || "Membro"
      },
      // Vincula o external_reference ao UID ou e-mail para o webhook identificar depois
      external_reference: userId || emailLimpo,
      notification_url: "https://webhook-clubprime.vercel.app/api/webhook"
    };

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${emailLimpo}-${Date.now()}`
      },
      body: JSON.stringify(paymentData)
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('Erro Mercado Pago:', data);
      return res.status(400).json({ 
        success: false, 
        error: data.message || 'Erro ao gerar Pix no Mercado Pago.' 
      });
    }

    // Extrai o QR Code e o Pix Copia e Cola da resposta do Mercado Pago
    const pointOfInteraction = data.point_of_interaction;
    const qrCodeBase64 = pointOfInteraction?.transaction_data?.qr_code_base64;
    const qrCodeCopiaCola = pointOfInteraction?.transaction_data?.qr_code;
    const paymentId = data.id;

    if (!qrCodeBase64 || !qrCodeCopiaCola) {
      return res.status(500).json({ success: false, error: 'Não foi possível obter os dados do Pix.' });
    }

    return res.status(200).json({
      success: true,
      paymentId: paymentId,
      qrCodeBase64: `data:image/png;base64,${qrCodeBase64}`,
      qrCodeCopiaCola: qrCodeCopiaCola
    });

  } catch (error) {
    console.error('Erro interno criar-pix:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
