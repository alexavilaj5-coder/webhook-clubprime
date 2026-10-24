import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID || "projeto-01-63111",
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  });
}

const auth = getAuth();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido. Use POST.' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token de autenticação não fornecido.' });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Token de autenticação inválido ou expirado.' });
    }

    const userId = decodedToken.uid;
    const emailUser = decodedToken.email;
    const { nome } = req.body;

    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!ACCESS_TOKEN) {
      return res.status(500).json({ success: false, error: 'Token do Mercado Pago não configurado no servidor.' });
    }

    // Preço oficial corrigido para R$ 19,90
    const paymentData = {
      transaction_amount: 19.90,
      description: "Assinatura VIP 30 Dias - Clube PRIME",
      payment_method_id: "pix",
      payer: {
        email: emailUser,
        first_name: nome || "Membro PRIME"
      },
      external_reference: userId,
      notification_url: "https://webhook-clubprime.vercel.app/api/webhook"
    };

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${userId}-${Date.now()}`
      },
      body: JSON.stringify(paymentData)
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('Erro Mercado Pago:', data);
      return res.status(400).json({ success: false, error: data.message || 'Erro ao gerar cobrança no Mercado Pago.' });
    }

    const pointOfInteraction = data.point_of_interaction;
    const qrCodeBase64 = pointOfInteraction?.transaction_data?.qr_code_base64;
    const qrCodeCopiaCola = pointOfInteraction?.transaction_data?.qr_code;
    const paymentId = data.id;

    if (!qrCodeBase64 || !qrCodeCopiaCola) {
      return res.status(500).json({ success: false, error: 'Mercado Pago não retornou os dados do QR Code.' });
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
