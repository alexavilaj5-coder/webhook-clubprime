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
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Apanha o ID de pagamento venha de onde vier (Query, Body ou Search Params)
    const paymentId = req.query?.id || req.body?.data?.id || req.body?.id || req.query?.['data.id'];

    console.log("Webhook acionado. Payment ID capturado:", paymentId);

    if (paymentId && db) {
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`
        }
      });

      if (mpResponse.ok) {
        const paymentData = await mpResponse.json();
        console.log("Status do pagamento no Mercado Pago:", paymentData.status);

        if (paymentData.status === 'approved') {
          const rawEmail = paymentData.external_reference || paymentData.payer?.email;

          if (rawEmail) {
            const cleanEmail = rawEmail.trim().toLowerCase();
            const agora = new Date();
            const dataExpiracao = new Date(agora.setDate(agora.getDate() + 30)).toISOString();

            const usersRef = db.collection('usuarios');
            const snapshot = await usersRef.get();

            let encontrou = false;
            const batch = db.batch();

            snapshot.forEach(doc => {
              const uData = doc.data();
              if (uData.email && uData.email.trim().toLowerCase() === cleanEmail) {
                encontrou = true;
                batch.update(doc.ref, {
                  vip: true,
                  vipExpiraEm: dataExpiracao,
                  atualizadoEm: new Date().toISOString()
                });
              }
            });

            if (encontrou) {
              await batch.commit();
              console.log("SUCESSO: VIP ativado para o email:", cleanEmail);
            } else {
              await usersRef.add({
                email: cleanEmail,
                vip: true,
                vipExpiraEm: dataExpiracao,
                criadoEm: new Date().toISOString(),
                origem: 'mercadopago'
              });
              console.log("SUCESSO: Novo utilizador VIP criado para:", cleanEmail);
            }
          }
        }
      } else {
        console.error("Erro ao consultar API do Mercado Pago:", await mpResponse.text());
      }
    }

    return res.status(200).send("OK");

  } catch (error) {
    console.error("Erro crítico no Webhook:", error);
    return res.status(200).send("OK");
  }
}
