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
    // Apanha o ID de todas as formas possíveis que o Mercado Pago envia
    let paymentId = 
      req.query?.['data.id'] || 
      req.query?.id || 
      req.body?.data?.id || 
      req.body?.id;

    // Se vier em formato de objeto req.query com 'data[id]'
    if (!paymentId && req.query && req.query.data) {
      if (typeof req.query.data === 'object') {
        paymentId = req.query.data.id;
      } else {
        paymentId = req.query.data;
      }
    }

    console.log("LOG - Payment ID Capturado:", paymentId);

    if (paymentId && db) {
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`
        }
      });

      if (mpResponse.ok) {
        const paymentData = await mpResponse.json();
        console.log("LOG - Status no MP:", paymentData.status);

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

            snapshot.forEach(docSnap => {
              const uData = docSnap.data();
              if (uData.email && uData.email.trim().toLowerCase() === cleanEmail) {
                encontrou = true;
                batch.update(docSnap.ref, {
                  vip: true,
                  vipExpiraEm: dataExpiracao,
                  atualizadoEm: new Date().toISOString()
                });
              }
            });

            if (encontrou) {
              await batch.commit();
              console.log("LOG - VIP ATIVADO COM SUCESSO PARA:", cleanEmail);
            } else {
              await usersRef.add({
                email: cleanEmail,
                vip: true,
                vipExpiraEm: dataExpiracao,
                criadoEm: new Date().toISOString(),
                origem: 'mercadopago'
              });
              console.log("LOG - NOVO USUARIO VIP CRIADO PARA:", cleanEmail);
            }
          }
        }
      } else {
        console.error("LOG - Erro ao consultar MP:", await mpResponse.text());
      }
    }

    return res.status(200).send("OK");

  } catch (error) {
    console.error("LOG - Erro no Webhook:", error);
    return res.status(200).send("OK");
  }
}
