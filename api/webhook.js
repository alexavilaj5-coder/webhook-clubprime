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

  // O Mercado Pago envia notificações por POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { type, data } = req.body;

    // Queremos apenas os eventos do tipo "payment"
    if (type === 'payment' && data && data.id) {
      const paymentId = data.id;

      // Consulta o status real da transação diretamente na API do Mercado Pago
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`
        }
      });

      if (!mpResponse.ok) {
        return res.status(200).send("OK (Erro ao consultar MP)");
      }

      const paymentData = await mpResponse.json();

      // Verifica se o pagamento foi aprovado
      if (paymentData.status === 'approved') {
        const payerEmail = paymentData.payer?.email || paymentData.external_reference;

        if (payerEmail && db) {
          const cleanEmail = payerEmail.trim().toLowerCase();
          const agora = new Date();
          const dataExpiracao = new Date(agora.setDate(agora.getDate() + 30)).toISOString();

          const usersRef = db.collection('usuarios');
          const snapshot = await usersRef.where('email', '==', cleanEmail).get();

          if (snapshot.empty) {
            await usersRef.add({
              email: cleanEmail,
              vip: true,
              vipExpiraEm: dataExpiracao,
              criadoEm: new Date().toISOString(),
              origem: 'mercadopago'
            });
          } else {
            const batch = db.batch();
            snapshot.forEach(doc => {
              batch.update(doc.ref, {
                vip: true,
                vipExpiraEm: dataExpiracao,
                atualizadoEm: new Date().toISOString()
              });
            });
            await batch.commit();
          }
        }
      }
    }

    // Retorna 200 pro Mercado Pago não ficar reenviando
    return res.status(200).send("OK");

  } catch (error) {
    console.error("Erro no Webhook:", error);
    return res.status(200).send("OK (Tratado)");
  }
}
