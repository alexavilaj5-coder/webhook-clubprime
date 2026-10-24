import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Inicializa Firebase Admin se ainda não foi inicializado
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
    const { type, data, action } = req.body;

    // O Mercado Pago envia id dentro de data.id ou query.id
    const paymentId = data?.id || req.query['data.id'] || req.query.id;

    console.log(`LOG - Payment ID Capturado: ${paymentId}`);

    if (paymentId) {
      // 1. Consulta o status real do pagamento direto no Mercado Pago
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      });

      const paymentData = await mpResponse.json();

      console.log(`LOG - Status Pagamento: ${paymentData.status} | E-mail: ${paymentData.payer?.email}`);

      // 2. Se foi APROVADO, atualiza no Firestore
      if (paymentData.status === 'approved') {
        const emailPagador = paymentData.payer?.email?.toLowerCase()?.trim();
        const externalRef = paymentData.external_reference; // ID/Email do usuário se passou no criar-pix

        let userQuery;
        if (externalRef) {
          // Busca por UID se passou external_reference
          const userDoc = await db.collection('usuarios').doc(externalRef).get();
          if (userDoc.exists) {
            await userDoc.ref.update({
              vip: true,
              vipExpiraEm: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              lastPaymentId: paymentId
            });
            console.log(`✅ VIP Ativado para UID: ${externalRef}`);
            return res.status(200).json({ status: 'success' });
          }
        }

        // Se não achou por UID, busca por e-mail no Firestore
        if (emailPagador) {
          const snapshot = await db.collection('usuarios').where('email', '==', emailPagador).get();
          
          if (!snapshot.empty) {
            snapshot.forEach(async (docSnap) => {
              await docSnap.ref.update({
                vip: true,
                vipExpiraEm: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                lastPaymentId: paymentId
              });
            });
            console.log(`✅ VIP Ativado para E-mail: ${emailPagador}`);
          } else {
            console.log(`⚠️ Usuário não encontrado no Firestore para o email: ${emailPagador}`);
          }
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Erro no Webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
