import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (rawServiceAccount) {
    try {
      const serviceAccount = JSON.parse(rawServiceAccount);
      initializeApp({ credential: cert(serviceAccount) });
    } catch (err) {
      console.error("Erro no JSON do Firebase:", err.message);
    }
  }
}

let db = null;
try {
  db = getFirestore();
} catch (e) {
  console.error("Erro no Firestore:", e.message);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { type, data } = req.body;

    if ((type === 'payment' || req.body.action === 'payment.created') && data && data.id) {
      const paymentId = data.id;

      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`
        }
      });

      if (!mpResponse.ok) {
        return res.status(200).send("OK (Erro ao consultar MP)");
      }

      const paymentData = await mpResponse.json();

      if (paymentData.status === 'approved') {
        const payerEmail = paymentData.payer?.email || paymentData.external_reference;

        if (payerEmail && db) {
          const cleanEmail = payerEmail.trim().toLowerCase();
          const agora = new Date();
          const dataExpiracao = new Date(agora.setDate(agora.getDate() + 30)).toISOString();

          const usersRef = db.collection('usuarios');
          const snapshot = await usersRef.where('email', '==', cleanEmail).get();

          if (!snapshot.empty) {
            const batch = db.batch();
            snapshot.forEach(doc => {
              batch.update(doc.ref, {
                vip: true,
                vipExpiraEm: dataExpiracao,
                atualizadoEm: new Date().toISOString()
              });
            });
            await batch.commit();
            console.log("VIP Ativado com sucesso para:", cleanEmail);
          } else {
            // Se não achou documento prévio, cria um novo
            await usersRef.add({
              email: cleanEmail,
              vip: true,
              vipExpiraEm: dataExpiracao,
              criadoEm: new Date().toISOString(),
              origem: 'mercadopago'
            });
          }
        }
      }
    }

    return res.status(200).send("OK");

  } catch (error) {
    console.error("Erro no Webhook:", error);
    return res.status(200).send("OK (Tratado)");
  }
}
