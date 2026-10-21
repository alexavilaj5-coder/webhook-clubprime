export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { email, nome } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'E-mail não informado' });
    }

    // Gera um identificador único aleatório para cumprir a exigência do Mercado Pago
    const idempotencyKey = 'idemp_' + Math.random().toString(36).substring(2) + Date.now();

    const bodyPayment = {
      transaction_amount: 1.20,
      description: 'Assinatura VIP Club Prime (30 dias)',
      payment_method_id: 'pix',
      payer: {
        email: email.trim().toLowerCase(),
        first_name: nome || 'Membro Prime'
      },
      external_reference: email.trim().toLowerCase(),
      notification_url: 'https://webhook-clubprime.vercel.app/api/webhook'
    };

    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(bodyPayment)
    });

    const data = await mpRes.json();

    if (!mpRes.ok) {
      return res.status(500).json({ error: data.message || 'Erro ao gerar Pix no Mercado Pago' });
    }

    const qrCodeBase64 = data.point_of_interaction?.transaction_data?.qr_code_base64;
    const qrCodeCopiaCola = data.point_of_interaction?.transaction_data?.qr_code;

    return res.status(200).json({
      success: true,
      qrCodeBase64: qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : null,
      qrCodeCopiaCola: qrCodeCopiaCola
    });

  } catch (error) {
    console.error("Erro ao gerar Pix:", error);
    return res.status(500).json({ error: error.message });
  }
}
