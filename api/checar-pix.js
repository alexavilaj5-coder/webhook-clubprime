const admin = require('firebase-admin');

function getFirebaseFirestore() {
  if (admin.apps.length) return admin.firestore();

  const projectId = process.env.FIREBASE_PROJECT_ID || "projeto-01-63111";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "firebase-adminsdk-fbsvc@projeto-01-63111.iam.gserviceaccount.com";
  let rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!rawKey) {
    console.error("❌ ERRO: FIREBASE_PRIVATE_KEY não configurada.");
    return null;
  }

  let privateKey;
  // Se não tiver o cabeçalho PEM, decodifica do Base64 da Vercel
  if (!rawKey.includes('-----BEGIN PRIVATE KEY-----')) {
    privateKey = Buffer.from(rawKey.trim(), 'base64').toString('utf8');
  } else {
    privateKey = rawKey.replace(/^["']|["']$/g, '').trim();
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      })
    });

    console.log("✅ Firebase Admin inicializado com sucesso via Variável de Ambiente!");
    return admin.firestore();
  } catch (error) {
    console.error("❌ ERRO AO INICIALIZAR O FIREBASE:", error.message);
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { email, userId } = req.query;

  if (!email && !userId) {
    return res.status(400).json({ 
      success: false, 
      error: "E-mail ou ID do usuário é obrigatório para verificação." 
    });
  }

  try {
    const emailUsuario = email ? email.toLowerCase().trim() : null;
    const ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!ACCESS_TOKEN) {
      return res.status(500).json({ 
        success: false, 
        error: 'Token do Mercado Pago não configurado na Vercel.' 
      });
    }

    const db = getFirebaseFirestore();
    if (!db) {
      throw new Error("Falha crítica ao conectar com o banco de dados (Firebase).");
    }

    // Buscar dados atuais do usuário para verificar o lastPaymentId
    let lastPaymentIdUtilizado = null;
    if (userId) {
      const userDoc = await db.collection('usuarios').doc(userId).get();
      if (userDoc.exists) lastPaymentIdUtilizado = userDoc.data().lastPaymentId;
    } else if (emailUsuario) {
      const snapshot = await db.collection('usuarios').where('email', '==', emailUsuario).get();
      if (!snapshot.empty) lastPaymentIdUtilizado = snapshot.docs[0].data().lastPaymentId;
    }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=20`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error('❌ Erro Mercado Pago:', mpData);
      return res.status(400).json({ 
        success: false, 
        error: 'Erro ao consultar transações no Mercado Pago.' 
      });
    }

    const pagamentoValido = mpData.results?.find(p => {
      const eAprovado = p.status === 'approved';
      const mesmaReferencia = userId && p.external_reference === userId;
      const mesmoEmailReferencia = emailUsuario && p.external_reference === emailUsuario;
      const mesmoEmailPayer = emailUsuario && p.payer?.email?.toLowerCase() === emailUsuario;

      if (!eAprovado || (!mesmaReferencia && !mesmoEmailReferencia && !mesmoEmailPayer)) {
        return false;
      }

      // TRAVA 1: Não aceitar o mesmo ID de pagamento que já foi usado antes
      if (lastPaymentIdUtilizado && p.id.toString() === lastPaymentIdUtilizado.toString()) {
        return false;
      }

      // TRAVA 2: O pagamento tem de ter sido criado recentemente (ex: nas últimas 3 horas)
      const dataPagamento = new Date(p.date_approved || p.date_created);
      const diferencaHoras = (new Date() - dataPagamento) / (1000 * 60 * 60);
      if (diferencaHoras > 3) {
        return false;
      }

      return true;
    });

    if (pagamentoValido) {
      console.log(`✅ Novo Pagamento Aprovado Encontrado ID: ${pagamentoValido.id}`);

      const dataExpiracao = new Date();
      dataExpiracao.setDate(dataExpiracao.getDate() + 30);

      const dadosVip = {
        vip: true,
        vipExpiraEm: dataExpiracao.toISOString(),
        atualizadoEm: new Date().toISOString(),
        lastPaymentId: pagamentoValido.id
      };

      if (userId) {
        await db.collection('usuarios').doc(userId).set(dadosVip, { merge: true });
      } else if (emailUsuario) {
        const snapshot = await db.collection('usuarios').where('email', '==', emailUsuario).get();
        if (!snapshot.empty) {
          await snapshot.docs[0].ref.set(dadosVip, { merge: true });
        } else {
          await db.collection('usuarios').doc(emailUsuario).set(dadosVip, { merge: true });
        }
      }
      console.log("👑 VIP salvo com sucesso no Firestore!");

      return res.status(200).json({ 
        success: true, 
        vip: true, 
        paymentId: pagamentoValido.id,
        message: "Pagamento confirmado com sucesso! Acesso VIP liberado." 
      });
    }

    return res.status(200).json({ 
      success: true, 
      vip: false, 
      message: "Pagamento recente não localizado. Conclua o Pix e tente novamente em instantes." 
    });

  } catch (err) {
    console.error("❌ ERRO CRÍTICO NO HANDLER:", err.message);
    return res.status(500).json({ success: false, vip: false, error: err.message });
  }
};