const admin = require('firebase-admin');

// Função para inicializar o Firebase Admin com segurança na Vercel
function getFirebaseAdmin() {
  if (admin.apps.length) return admin.firestore();

  try {
    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!rawServiceAccount) {
      console.error("❌ ERRO: Variável FIREBASE_SERVICE_ACCOUNT não encontrada na Vercel!");
      return null;
    }

    // Trata possíveis quebras de linha/aspas na variável da Vercel
    const serviceAccount = typeof rawServiceAccount === 'string' 
      ? JSON.parse(rawServiceAccount) 
      : rawServiceAccount;

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log("✅ Firebase Admin inicializado com sucesso!");
    return admin.firestore();
  } catch (error) {
    console.error("❌ Erro ao inicializar Firebase Admin:", error.message);
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
    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!ACCESS_TOKEN) {
      console.error('❌ Token do Mercado Pago ausente.');
      return res.status(500).json({ 
        success: false, 
        error: 'Token do Mercado Pago não configurado na Vercel.' 
      });
    }

    // Consulta os pagamentos no Mercado Pago
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

    // Procura transação aprovada vinculada ao usuário
    const pagamentoValido = mpData.results?.find(p => {
      const eAprovado = p.status === 'approved';
      const mesmaReferencia = userId && p.external_reference === userId;
      const mesmoEmailReferencia = emailUsuario && p.external_reference === emailUsuario;
      const mesmoEmailPayer = emailUsuario && p.payer?.email?.toLowerCase() === emailUsuario;

      return eAprovado && (mesmaReferencia || mesmoEmailReferencia || mesmoEmailPayer);
    });

    if (pagamentoValido) {
      console.log(`✅ Pagamento Aprovado Encontrado ID: ${pagamentoValido.id}`);

      // Tenta gravar no Firestore
      const db = getFirebaseAdmin();
      
      if (db) {
        const dataExpiracao = new Date();
        dataExpiracao.setDate(dataExpiracao.getDate() + 30); // 30 Dias

        const dadosVip = {
          vip: true,
          vipExpiraEm: dataExpiracao.toISOString(),
          atualizadoEm: new Date().toISOString()
        };

        try {
          if (userId) {
            await db.collection('usuarios').doc(userId).set(dadosVip, { merge: true });
          } else if (emailUsuario) {
            const snapshot = await db.collection('usuarios').where('email', '==', emailUsuario).get();
            if (!snapshot.empty) {
              await snapshot.docs[0].ref.set(dadosVip, { merge: true });
            }
          }
          console.log("👑 VIP salvo com sucesso no Firestore!");
        } catch (dbErr) {
          console.error("❌ Erro ao salvar VIP no Firestore:", dbErr.message);
        }
      }

      return res.status(200).json({ 
        success: true, 
        vip: true, 
        paymentId: pagamentoValido.id,
        message: "Pagamento confirmado com sucesso! Acesso VIP liberado por 30 dias." 
      });
    }

    console.log("ℹ️ Nenhum pagamento aprovado localizado para este usuário.");
    return res.status(200).json({ 
      success: true, 
      vip: false, 
      message: "Pagamento ainda não localizado. Conclua o Pix e tente novamente em instantes." 
    });

  } catch (err) {
    console.error("❌ Erro fatal no handler:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
