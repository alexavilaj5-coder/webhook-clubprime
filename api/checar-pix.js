import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Inicializa o Firebase Admin SDK na Vercel
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

export default async function handler(req, res) {
  // Configura CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { email, userId } = req.query;

  if (!email && !userId) {
    return res.status(400).json({ success: false, error: "E-mail ou User ID necessário para a consulta." });
  }

  try {
    const emailBusca = email ? email.toLowerCase().trim() : null;
    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

    if (!ACCESS_TOKEN) {
      return res.status(500).json({ success: false, error: 'Token do Mercado Pago não configurado.' });
    }

    // 1. Encontra o usuário no Firestore
    let userRef = null;
    let userDocId = userId;

    if (userId) {
      userRef = db.collection('usuarios').doc(userId);
    } else if (emailBusca) {
      const snapshot = await db.collection('usuarios').where('email', '==', emailBusca).get();
      if (!snapshot.empty) {
        userRef = snapshot.docs[0].ref;
        userDocId = snapshot.docs[0].id;
      }
    }

    if (!userRef) {
      return res.status(404).json({ success: false, error: "Usuário não encontrado no banco de dados." });
    }

    const userDoc = await userRef.get();
    const userData = userDoc.data();

    // Se já estiver VIP, retorna sucesso direto
    if (userData.vip) {
      return res.status(200).json({ success: true, vip: true, message: "Assinatura VIP já ativa!" });
    }

    // 2. Consulta os pagamentos recentes no Mercado Pago usando o external_reference
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&external_reference=${userDocId || emailBusca}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
    });

    const mpData = await mpRes.json();
    const pagamentoAprovado = mpData.results?.find(p => p.status === 'approved');

    // 3. Se encontrou pagamento aprovado, libera o VIP no Firestore na hora!
    if (pagamentoAprovado) {
      const dataExpiracao = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      await userRef.update({
        vip: true,
        vipExpiraEm: dataExpiracao,
        lastPaymentId: pagamentoAprovado.id
      });

      return res.status(200).json({ 
        success: true, 
        vip: true, 
        message: "Pagamento confirmado com sucesso! Acesso VIP liberado." 
      });
    }

    return res.status(200).json({ 
      success: true, 
      vip: false, 
      message: "Nenhum pagamento aprovado encontrado ainda. Tente novamente em alguns segundos." 
    });

  } catch (err) {
    console.error("Erro ao checar Pix:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
