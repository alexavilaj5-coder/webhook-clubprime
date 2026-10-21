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
    // Pega o ID do pagamento enviado pelo Mercado Pago
    const paymentId = req.body?.data?.id || req.query?.['data.id'] || req.query?.id;

    if (paymentId) {
      // Consulta o pagamento na API do Mercado Pago
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`
        }
      });

      if (mpResponse.ok) {
        const paymentData = await mpResponse.json();

        // Se o pagamento foi aprovado
        if (paymentData.status === 'approved') {
          // Tenta pegar o e-mail de todas as formas possíveis
          const payerEmail = paymentData.external_reference || paymentData.payer?.email;

          if (payerEmail && db) {
            const cleanEmail = payerEmail.trim().toLowerCase();
            const agora = new Date();
            const dataExpiracao = new Date(agora.setDate(agora.getDate() + 30)).toISOString();

            // Atualiza no Firestore
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
              console.log("SUCCESS: VIP Ativado no Firestore para:", cleanEmail);
            } else {
              // Se não encontrou o utilizador por e-mail, cria a entrada VIP
              await usersRef.add({
                email: cleanEmail,
                vip: true,
                vipExpiraEm: dataExpiracao,
                criadoEm: new Date().toISOString(),
                origem: 'mercadopago'
              });
              console.log("SUCCESS: Novo usuário VIP criado para:", cleanEmail);
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
