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
    const paymentId = req.body?.data?.id || req.query?.['data.id'] || req.query?.id;

    if (paymentId && db) {
      // Consulta o status real no Mercado Pago
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`
        }
      });

      if (mpResponse.ok) {
        const paymentData = await mpResponse.json();

        if (paymentData.status === 'approved') {
          // Pega o e-mail do comprador retornado pelo Mercado Pago
          const rawEmail = paymentData.external_reference || paymentData.payer?.email;

          if (rawEmail) {
            const cleanEmail = rawEmail.trim().toLowerCase();
            const agora = new Date();
            const dataExpiracao = new Date(agora.setDate(agora.getDate() + 30)).toISOString();

            const usersRef = db.collection('usuarios');
            const snapshot = await usersRef.get();

            let encontrou = false;
            const batch = db.batch();

            // Percorre os documentos para garantir a correspondência do e-mail
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
              console.log("VIP ATIVADO COM SUCESSO PARA:", cleanEmail);
            } else {
              // Se o utilizador não existia no Firestore, cria o documento
              await usersRef.add({
                email: cleanEmail,
                vip: true,
                vipExpiraEm: dataExpiracao,
                criadoEm: new Date().toISOString(),
                origem: 'mercadopago'
              });
              console.log("NOVO UTILIZADOR VIP CRIADO PARA:", cleanEmail);
            }
          }
        }
      }
    }

    return res.status(200).send("OK");

  } catch (error) {
    console.error("Erro interno no Webhook:", error);
    return res.status(200).send("OK");
  }
}
