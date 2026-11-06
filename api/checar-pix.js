const admin = require('firebase-admin');

function getFirebaseFirestore() {
  if (admin.apps.length) return admin.firestore();

  const projectId = "projeto-01-63111";
  const clientEmail = "firebase-adminsdk-fbsvc@projeto-01-63111.iam.gserviceaccount.com";
  
  // Chave nova tratada com conversão direta de barras invertidas para quebras reais
  const rawKey = `-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDLtp1D9TlHAqLO\nc2OdwRt4mJkVkc9cAlPDXwLjoB+6kOFI7oI0SBJnhjnMoOQCd7IZjfs6r3t3CKER\n3L45fkEB19SxCaaHGOqM/ItHbqTt5WRu5uNOpiXmOj2BwT/HSUBNpuFyvpWfPzjX\n6WOb8PhdWoiEkPZ9rqptPT9CxafeIICc/oGFtCMgGRMEQK3VCdbNRX2LM7Qspik9\nIg+gJhhjrNcruGhAhnX3c5xXaNJ8bi3p9RIC7yrY2Xdqdp1FfiXfkvL5WcpNOY8y\nnUsaCnByurKYfuQsWD9DTZ+bXczXNRsx2yuDjjDrmwGSieChMRrWNvv4SkDQyzPt\nQ8r975xjAgMBAAECggEACi00vQclcUpV654wyGwz+HnOfs/aa6oMq1KIZjOnX9U4\nSsHFw4Yjnc1VbNlz46f0Gzn95kgdx8dxyrpJqirjicKIYeQABwtGPzODYx/t875y\n+eXlTl9ymfPxTDoJsdNKLrbj/HX0vWKe7vrithDNb3q61L0aBFxOeRnZiEAv9EdV\nQ7tthVoZP0vDLO21+sMlR3WupxhqZus7A1vsaPF+aOjPjz0y29mAgiIL5YRzQlDA\nJ3Py+yUbOgkCNyctFzBIy5j9HoW+6dSzBOhBz1CnCDtwFm48RoAJdFDcM4aHLAx7\nbdk1f0mZfnDa7JWsS1CLtzgxsyU9O8ab0oVYcgxzlQKBgQDuSxBKbj8OV5EJUiIM\n24D8tfsRzyfof/pnOrcUWAenWf2UKjPdhmf++E4hCdKAzpdEDfIj4xdA+V4U3Ad/\nkI0qBdzX08bquN1r1hCIERsDjabOpHO1zz3CBodlA+B9tfeECmqP9tKAnKkBwZG9\nOQydtfgX8so1aa613e3VSe9U3QKBgQDa2cEfV/aW/rUkGV3G+pjfbYZAn2TbtLhX\nVdatfVTgL7KFNxaJzqlJQ+bz0+s7fB5sgq2um21RYnF8Lhdi3k3oKRVfnCMHM24j\n0/O8pqHXZ0cgetL0fNY3+ZwDouBrsq9rawQmBQJy1us8JEbiEN/TsBKsSaJDf/eC\nqFjtnOACPwKBgQC2rFSQunMcS4Sj4JK5yIvZLqiJvoSZd4I+IIS408MKR7JdIv0f\nlSmkDDXYne8BT14mjYpSeIQbCw9UblhRMj8FN/lUesTCq3USdce2h2ZuEukNAISz\nm2t8kgS5K3+s3xIf5txKAKzeazokXn+az2EchaLquPTKfXmxcbAhEcynAQKBgCpW\n7HTq6KsHtfW47pqbSs4W+10vOS0ERpGm6rR/xdblg20gXjzk/X1OJLVRb3X/qkcl\n9QIN0dVn7TqwFBgtl/btU9Q+ecxf19QYolQCDNeGhI01FfD04eDMarGNZkuPsz5d\n4tyUJYggKjxlbE06JINo0gQA7uKONE1T0niN3AyzAoGBANUkTkndBm6gxlQF/ZLi\nIOxydCd4CnAyJ7wZA7/Hltv9LH1ldzbuVuMWeT6nCbtsh47QWADHy5a0kikYp4SB\naVi4O16PXSVHmXGhTkhDxDZHUPxuGBP7UItorcdVhaFTqYUk+WcDgiRgkxTs6v/7\n/1njYdLKgl1Pb1xLZ+TGFew4\n-----END PRIVATE KEY-----`;

  const privateKey = rawKey.replace(/\\n/g, '\n');

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      })
    });

    console.log("✅ Firebase Admin inicializado com sucesso no checar-pix!");
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

      const db = getFirebaseFirestore();
      if (!db) {
        throw new Error("Falha crítica ao conectar com o banco de dados (Firebase).");
      }

      const dataExpiracao = new Date();
      dataExpiracao.setDate(dataExpiracao.getDate() + 30);

      const dadosVip = {
        vip: true,
        vipExpiraEm: dataExpiracao.toISOString(),
        atualizadoEm: new Date().toISOString(),
        lastPaymentId: pagamentoValido.id
      };

      // Gravação estrita com verificação: se falhar, vai cair no catch e não dá falso positivo
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
      message: "Pagamento ainda não localizado. Conclua o Pix e tente novamente em instantes." 
    });

  } catch (err) {
    console.error("❌ ERRO CRÍTICO NO HANDLER:", err.message);
    return res.status(500).json({ success: false, vip: false, error: err.message });
  }
};
