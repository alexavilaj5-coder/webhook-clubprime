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
    const paymentId = req.query?.id || req.body?.data?.id || req.body?.id || req.query?.['data.id'];

    if (paymentId && db) {
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`
        }
      });

      if (mpResponse.ok) {
        const paymentData = await mpResponse.json();

        if (paymentData.status === 'approved') {
          const rawEmail = paymentData.external_reference || paymentData.payer?.email;

          if (rawEmail) {
            const cleanEmail = rawEmail.trim().toLowerCase();
            const agora = new Date();
            const dataExpiracao = new Date(agora.setDate(agora.getDate() + 30)).toISOString();

            const usersRef = db.collection('usuarios');
            const snapshot = await usersRef.get();

            let atualizou = false;
            const batch = db.batch();

            snapshot.forEach(docSnap => {
              const uData = docSnap.data();
              // Verifica se o campo email bate com o comprador
              if (uData.email && uData.email.trim().toLowerCase() === cleanEmail) {
                atualizou = true;
                batch.update(docSnap.ref, {
                  vip: true,
                  vipExpiraEm: dataExpiracao,
                  atualizadoEm: new Date().toISOString()
                });
              }
            });

            if (atualizou) {
              await batch.commit();
              console.log("SUCESSO: VIP ativado para:", cleanEmail);
            } else {
              // Se não encontrou nenhum documento com esse email, cria um novo
              await usersRef.add({
                email: cleanEmail,
                vip: true,
                vipExpiraEm: dataExpiracao,
                criadoEm: new Date().toISOString(),
                origem: 'mercadopago'
              });
              console.log("SUCESSO: Novo documento VIP criado para:", cleanEmail);
            }
          }
        }
      }
    }

    return res.status(200).send("OK");

  } catch (error) {
    console.error("Erro no Webhook:", error);
    return res.status(200).send("OK");
  }
}
