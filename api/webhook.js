import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID || "projeto-01-63111",
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const { data, type } = req.body;
    const paymentId = data?.id || req.query['data.id'] || req.query.id;

    if (type === 'payment' && paymentId) {
      const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
      });

      const paymentData = await mpResponse.json();

      if (mpResponse.ok && paymentData.status === 'approved') {
        const userId = paymentData.external_reference;
        if (userId) {
          const userRef = db.collection('usuarios').doc(userId);
          const userDoc = await userRef.get();
          const userData = userDoc.exists ? userDoc.data() : {};
          const strPaymentId = paymentId.toString();

          // Idempotência no Webhook
          if (userData.lastPaymentId !== strPaymentId) {
            const now = new Date();
            let novaExpiracao = new Date();
            const currentExp = userData.vipExpiraEm ? new Date(userData.vipExpiraEm) : null;

            if (currentExp && currentExp > now) {
              novaExpiracao = new Date(currentExp.getTime() + 30 * 24 * 60 * 60 * 1000);
            } else {
              novaExpiracao = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            }

            await userRef.set({
              vip: true,
              vipExpiraEm: novaExpiracao.toISOString(),
              lastPaymentId: strPaymentId,
              atualizadoEm: now.toISOString()
            }, { merge: true });

            console.log(`✅ VIP processado via Webhook para o UID: ${userId}`);
          }
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Erro no Webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
