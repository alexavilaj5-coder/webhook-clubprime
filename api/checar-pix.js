import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

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
const auth = getAuth();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Não autorizado.' });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Token inválido.' });
    }

    const userId = decodedToken.uid;
    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!ACCESS_TOKEN) {
      return res.status(500).json({ success: false, error: 'Token do Mercado Pago não configurado.' });
    }

    // Busca pagamentos vinculados ao external_reference (UID)
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${userId}&sort=date_created&criteria=desc&limit=10`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
    });

    const mpData = await mpRes.json();
    if (!mpRes.ok) {
      return res.status(400).json({ success: false, error: 'Erro ao consultar transações.' });
    }

    const pagamentoAprovado = mpData.results?.find(p => p.status === 'approved');

    if (pagamentoAprovado) {
      const paymentId = pagamentoAprovado.id.toString();
      const userRef = db.collection('usuarios').doc(userId);
      const userDoc = await userRef.get();
      const userData = userDoc.exists ? userDoc.data() : {};

      // Idempotência: Se este pagamento já foi processado, apenas retorna sucesso
      if (userData.lastPaymentId === paymentId) {
        return res.status(200).json({
          success: true,
          vip: true,
          message: "Pagamento já processado anteriormente. VIP ativo."
        });
      }

      // Lógica de acumulação de 30 dias
      const now = new Date();
      let novaExpiracao = new Date();
      const currentExp = userData.vipExpiraEm ? new Date(userData.vipExpiraEm) : null;

      if (currentExp && currentExp > now) {
        // Se ainda está ativo, soma 30 dias em cima da expiração atual
        novaExpiracao = new Date(currentExp.getTime() + 30 * 24 * 60 * 60 * 1000);
      } else {
        // Se expirou ou é novo, soma 30 dias a partir de agora
        novaExpiracao = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }

      const dadosAtualizados = {
        vip: true,
        vipExpiraEm: novaExpiracao.toISOString(),
        lastPaymentId: paymentId,
        atualizadoEm: now.toISOString()
      };

      await userRef.set(dadosAtualizados, { merge: true });

      return res.status(200).json({
        success: true,
        vip: true,
        paymentId: paymentId,
        message: "Pagamento confirmado! Acesso VIP liberado por 30 dias."
      });
    }

    return res.status(200).json({
      success: true,
      vip: false,
      message: "Pagamento ainda não aprovado."
    });

  } catch (err) {
    console.error("Erro em checar-pix:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
