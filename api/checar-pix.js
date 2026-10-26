const admin = require('firebase-admin');

function getFirebaseFirestore() {
  if (admin.apps.length) return admin.firestore();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  // Chave privada blindada em array para evitar qualquer erro de formatação na Vercel
  const privateKey = [
    "-----BEGIN PRIVATE KEY-----",
    "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDM4mFZWohuwWAg",
    "mdxIp3nvh1M7tSmrK03xRj24mNRZ5PZ4shQIug+gX5pLG63u6VqpY0FSsvLjbie0",
    "jRe2E0rjycE4zqesFoVbiTexVB0SI77A6vp3VSca2iYRqoNWkGPsW2x2idvPfubH",
    "xzYdoJG+xIe+C5lo+G1LeNc/g1yOkmwLET3d7Xo4LN0NpsDMI0aLX5pd/sy6039t",
    "6fs9yO3J4xobYbPK+7RI2e2kNrj2+mGDDjGMxtH5WMhcpVucBc7qH52A4oouOyhO",
    "fafd+aBUkPIgdO0R/YtbW4EqyGBkFNgD1cfPLv7s3OXU5KWwEaTpzwZfPQCROgS1",
    "4nHrnw7PAgMBAAECggEABLwpBcvUbvYKU7AnabwJ7GHTQZ3MaoewrT/M7Pds1bsE",
    "TmiT+Y1BqTIsbbBXeVFsf/eqqpxqH2lygqpNsi6JKSSGuHP5Zte9magp+lYrg2zO",
    "25FSqO/CqWZoDmzc/8lZSQmzD8/cNzppxcb/CcY/nnBwtqqr9ZB9B75+MwCR/G8W",
    "EpItXKXg52G6d+15hQmGZEXExrNCD3IudJM7v2JBlLoHnJ3Oe2JyaHgmfRzzvU50",
    "39+z6YntDVq7T26XFrL6/K4fEg5Ipxbtw7ztlMUvQ2vtxLQ5AYTAkf+U28z3t1vs",
    "Djjrn8UEbAObyE9Gd7DRTB1E7x0ofXMAsBVRI2xcYQKBgQDlwjDNDRyBiE24xu5T",
    "6PFdkSwc45yRY46AIOiVrzLdCuqCwbYj+jfeb41pDW0SSvZvDc7HqLJsMfiM+4sa",
    "mbIMfUF77CKUVhnJhSq8vokrSxvL1oR2dEQpUevcpkeNs+GxoJJvWsbaCIFqscbx",
    "bk/Bk6loiCSj+rsJUeV6Ou0R0QKBgQDkSObxRI4uqYt3siBU72QJdrWG7n7njmWz",
    "5Acwt8sCR9fHEvt1YcwnBvEVmUhF6gNgKiwUdd8FqNp1FuKXdySnz6AkdVHOvLfb",
    "nnUuHatQj8HpBdkIdr9mvUmTZdUluidv3V2+FGFEf84fD5dpWBCbLwKuB2mR0Wd6G",
    "CpMwscKenwKBgCAFlqOdhjGPe7WbFDBhsPInf4xvNK0WwQ+ehowGJQKluNWMhgQx",
    "pYO87GqN0nvQMtR7iixNmMB3nnqXvGVyslwHQQ8ydAdUkLeDdddkft2n1DHurfuM",
    "nbMuNfV/9VM+tGHGXPZGDh19v/AmQyXdwtnD2UZAeGW05TsQXw/HrMIthAoGAfNvW",
    "3J1XevQmoQgfIPVybK6t6KgnZvT+cV7GBAJymcO7pFmgiXo9FBd64wpcekjdIcrP",
    "Iz25BrptCd/DfX6f4NzxxR8Z6I5VrVuiBOYMM8ACzi0lSmF1GaxiFoJM8JWcZvM+",
    "vrgnHuevGRltyuAobAbsh3BwwyaoS/4atWZ0gRcCgYEAnx9fJwlQa/BmVy2v0dq1",
    "nzgQ2nhVLUj++oFYk1VkzG89dtICc4y+gETI9AuAmyF2/nEzB6nMsg9vCwW9Qoihn",
    "ndBiFNW8MPK3yHuiCgFEyLDAjO7n37poI3jDC+08e9RgZNzJT4fXtivSQ0Wz+W6Gw",
    "RS7BwECU+Br3kqH118mqDU4=",
    "-----END PRIVATE KEY-----"
  ].join('\n');

  if (!projectId || !clientEmail) {
    console.error("❌ ERRO: As credenciais do Firebase não estão configuradas corretamente.");
    return null;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId.trim(),
        clientEmail: clientEmail.trim(),
        privateKey: privateKey,
      })
    });

    console.log("✅ Firebase Admin inicializado com sucesso!");
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

      return eAprovado && (mesmaReferencia || mesmoEmailReferencia || mesmoEmailPayer);
    });

    if (pagamentoValido) {
      console.log(`✅ Pagamento Aprovado Encontrado ID: ${pagamentoValido.id}`);

      try {
        const db = getFirebaseFirestore();
        if (db) {
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
        }
      } catch (dbErr) {
        console.error("❌ Erro interno ao salvar no Firestore:", dbErr.message);
      }

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
      message: "Pagamento ainda não localizado. Conclua o Pix e tente novamente em instantes." 
    });

  } catch (err) {
    console.error("❌ ERRO CRÍTICO NO HANDLER:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
