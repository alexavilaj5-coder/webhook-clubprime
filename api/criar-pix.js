import { PRECO_VIP, getAccessToken } from './_vip.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Use POST.' });
  }

  try {
    const { email, nome, userId } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, error: 'E-mail do usuário é obrigatório.' });
    }

    const emailLimpo = String(email).toLowerCase().trim();
    const ACCESS_TOKEN = getAccessToken();
    if (!ACCESS_TOKEN) {
      return res.status(500).json({ success: false, error: 'Token do Mercado Pago não configurado no servidor.' });
    }

    const referencia = userId || emailLimpo;

    const paymentData = {
      transaction_amount: PRECO_VIP,
      description: 'Assinatura VIP - Clube PRIME',
      payment_method_id: 'pix',
      payer: { email: emailLimpo, first_name: nome || 'Membro PRIME' },
      external_reference: referencia,
      notification_url: 'https://webhook-clubprime.vercel.app/api/webhook'
    };

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        // Cliques repetidos no mesmo minuto devolvem o mesmo Pix, em vez de criar cobranças duplicadas.
        'X-Idempotency-Key': `${referencia}-${Math.floor(Date.now() / 60000)}`
      },
      body: JSON.stringify(paymentData)
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('Erro retornado pelo Mercado Pago:', data);
      return res.status(400).json({ success: false, error: data.message || 'Erro ao gerar cobrança no Mercado Pago.' });
    }

    const transacao = data.point_of_interaction?.transaction_data;
    if (!transacao?.qr_code_base64 || !transacao?.qr_code) {
      return res.status(500).json({ success: false, error: 'Mercado Pago não retornou os dados do QR Code do Pix.' });
    }

    return res.status(200).json({
      success: true,
      paymentId: data.id,
      qrCodeBase64: `data:image/png;base64,${transacao.qr_code_base64}`,
      qrCodeCopiaCola: transacao.qr_code
    });
  } catch (error) {
    console.error('Erro interno na API criar-pix:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
