const admin = require('firebase-admin');

function getFirebaseAdmin() {
  if (admin.apps.length) return admin.firestore();

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawServiceAccount) {
    throw new Error("VARIÁVEL DE AMBIENTE AUSENTE: FIREBASE_SERVICE_ACCOUNT não está configurada na Vercel.");
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch (e) {
    throw new Error("ERRO NO JSON DA VERCEL: A chave do Firebase não é um JSON válido. Verifique se copiou as aspas e chaves corretamente.");
  }

  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  return admin.firestore();
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

    // Procura transação aprovada
    const pagamentoValido = mpData.results?.find(p => {
      const eAprovado = p.status === 'approved';
      const mesmaReferencia = userId && p.external_reference === userId;
      const mesmoEmailReferencia = emailUsuario && p.external_reference === emailUsuario;
      const mesmoEmailPayer = emailUsuario && p.payer?.email?.toLowerCase() === emailUsuario;

      return eAprovado && (mesmaReferencia || mesmoEmailReferencia || mesmoEmailPayer);
    });

    if (pagamentoValido) {
      console.log(`✅ Pagamento Aprovado Encontrado ID: ${pagamentoValido.id}`);

      // TENTA SALVAR NO FIRESTORE (Se falhar, agora vai mostrar o erro exato na tela!)
      try {
        const db = getFirebaseAdmin();
        const dataExpiracao = new Date();
        dataExpiracao.setDate(dataExpiracao.getDate() + 30); // 30 dias

        const dadosVip = {
          vip: true,
          vipExpiraEm: dataExpiracao.toISOString(),
          atualizadoEm: new Date().toISOString()
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

      } catch (dbErr) {
        console.error("❌ ERRO AO SALVAR NO FIRESTORE:", dbErr.message);
        // Retorna o erro exato para você ver no app o que está impedindo de salvar
        return res.status(500).json({ 
          success: false, 
          error: "Pagamento aprovado, mas falhou ao salvar no banco: " + dbErr.message 
        });
      }

      return res.status(200).json({ 
        success: true, 
        vip: true, 
        paymentId: pagamentoValido.id,
        message: "Pagamento confirmado e salvo no banco com sucesso!" 
      });
    }

    return res.status(200).json({ 
      success: true, 
      vip: false, 
      message: "Pagamento ainda não localizado. Conclua o Pix e tente novamente em instantes." 
    });

  } catch (err) {
    console.error("❌ ERRO CRÍTICO NO HANDLER:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
