const admin = require('firebase-admin');

// Inicializa o Firebase Admin na Vercel via Variável de Ambiente
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
  } catch (error) {
    console.error("Erro ao inicializar Firebase Admin:", error);
  }
}

const db = admin.firestore();

module.exports = async function handler(req, res) {
  // Configuração dos cabeçalhos CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Trata a requisição de pré-verificação do navegador (OPTIONS)
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

    // Consulta os últimos 20 pagamentos recebidos no Mercado Pago
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=20`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error('Erro de consulta no Mercado Pago:', mpData);
      return res.status(400).json({ 
        success: false, 
        error: 'Erro ao consultar transações no Mercado Pago.' 
      });
    }

    // FILTRO DE SEGURANÇA:
    // Procura uma transação APROVADA vinculada ao userId ou e-mail do usuário
    const pagamentoValido = mpData.results?.find(p => {
      const eAprovado = p.status === 'approved';
      const mesmaReferencia = userId && p.external_reference === userId;
      const mesmoEmailReferencia = emailUsuario && p.external_reference === emailUsuario;
      const mesmoEmailPayer = emailUsuario && p.payer?.email?.toLowerCase() === emailUsuario;

      return eAprovado && (mesmaReferencia || mesmoEmailReferencia || mesmoEmailPayer);
    });

    if (pagamentoValido) {
      // 🚀 CALCULA EXATAMENTE 30 DIAS DE VIP A PARTIR DE HOJE
      const dataExpiracao = new Date();
      dataExpiracao.setDate(dataExpiracao.getDate() + 30);

      const dadosVip = {
        vip: true,
        vipExpiraEm: dataExpiracao.toISOString(),
        atualizadoEm: new Date().toISOString()
      };

      // SALVA DE FORMA DEFINITIVA NO FIRESTORE
      if (userId) {
        await db.collection('usuarios').doc(userId).set(dadosVip, { merge: true });
      } else if (emailUsuario) {
        const snapshot = await db.collection('usuarios').where('email', '==', emailUsuario).get();
        if (!snapshot.empty) {
          await snapshot.docs[0].ref.set(dadosVip, { merge: true });
        }
      }

      return res.status(200).json({ 
        success: true, 
        vip: true, 
        paymentId: pagamentoValido.id,
        message: "Pagamento confirmado com sucesso! Acesso VIP liberado por 30 dias." 
      });
    }

    return res.status(200).json({ 
      success: true, 
      vip: false, 
      message: "Pagamento ainda não localizado. Conclua o Pix e tente novamente em instantes." 
    });

  } catch (err) {
    console.error("Erro interno ao checar Pix:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
