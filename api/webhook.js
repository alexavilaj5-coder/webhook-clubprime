import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getFirebaseAdminApp() {
  if (getApps().length) return getFirestore();

  const projectId = process.env.FIREBASE_PROJECT_ID || "projeto-01-63111";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "firebase-adminsdk-fbsvc@projeto-01-63111.iam.gserviceaccount.com";
  let rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!rawKey) {
    console.error("❌ ERRO: FIREBASE_PRIVATE_KEY não configurada no Webhook.");
    return null;
  }

  let privateKey;
  if (!rawKey.includes('-----BEGIN PRIVATE KEY-----')) {
    privateKey = Buffer.from(rawKey.trim(), 'base64').toString('utf8');
  } else {
    privateKey = rawKey.replace(/^["']|["']$/g, '').trim();
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
  }

  try {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      })
    });
    console.log("✅ Firebase Admin inicializado com sucesso no Webhook!");
    return getFirestore();
  } catch (error) {
    console.error("❌ ERRO AO INICIALIZAR O FIREBASE NO WEBHOOK:", error.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    const db = getFirebaseAdminApp();
    if (!db) {
      throw new Error("Falha crítica ao conectar com o Firestore no Webhook.");
    }

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

      if (!mpResponse.ok) {
        console.error('❌ Erro ao buscar pagamento no Mercado Pago:', paymentData);
        return res.status(400).json({ error: 'Erro ao consultar transação.' });
      }

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
            await db.collection('usuarios').doc(emailPagador).set(dadosVip, { merge: true });
            console.log(`👑 VIP Ativado criando documento por e-mail: ${emailPagador}`);
          }
          return res.status(200).json({ status: 'success' });
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Erro Crítico no Webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}