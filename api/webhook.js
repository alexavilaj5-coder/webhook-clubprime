import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId: projectId.trim(),
        clientEmail: clientEmail.trim(),
        privateKey: privateKey.replace(/\\n/g, '\n'),
      })
    });
    console.log("✅ Firebase Admin inicializado com sucesso no Webhook!");
  } else {
    console.error("❌ ERRO: Credenciais do Firebase incompletas nas variáveis de ambiente da Vercel.");
  }
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const { data } = req.body;
    const paymentId = data?.id || req.query['data.id'] || req.query.id;

    console.log(`LOG - Payment ID Capturado: ${paymentId}`);

    if (paymentId) {
      const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;

      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const paymentData = await mpResponse.json();

      console.log(`LOG - Status Pagamento: ${paymentData.status} | E-mail: ${paymentData.payer?.email}`);

      if (paymentData.status === 'approved') {
        const emailPagador = paymentData.payer?.email?.toLowerCase()?.trim();
        const externalRef = paymentData.external_reference;

        const dataExpiracao = new Date();
        dataExpiracao.setDate(dataExpiracao.getDate() + 30);

        const dadosVip = {
          vip: true,
          vipExpiraEm: dataExpiracao.toISOString(),
          atualizadoEm: new Date().toISOString(),
          lastPaymentId: paymentId
        };

        if (externalRef) {
          // Usa .set com merge: true para garantir que cria caso não exista
          await db.collection('usuarios').doc(externalRef).set(dadosVip, { merge: true });
          console.log(`👑 VIP Ativado com sucesso para o UID/Ref: ${externalRef}`);
          return res.status(200).json({ status: 'success' });
        }

        if (emailPagador) {
          const snapshot = await db.collection('usuarios').where('email', '==', emailPagador).get();
          
          if (!snapshot.empty) {
            for (const docSnap of snapshot.docs) {
              await docSnap.ref.set(dadosVip, { merge: true });
            }
            console.log(`👑 VIP Ativado por e-mail para: ${emailPagador}`);
          } else {
            // Se não achar por query, cria um doc com o email como ID para salvaguardar
            await db.collection('usuarios').doc(emailPagador).set(dadosVip, { merge: true });
            console.log(`👑 VIP Ativado criando documento por e-mail: ${emailPagador}`);
          }
          return res.status(200).json({ status: 'success' });
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Erro no Webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
