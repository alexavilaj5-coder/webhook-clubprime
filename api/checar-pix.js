const admin = require('firebase-admin');

function getFirebaseFirestore() {
  if (admin.apps.length) return admin.firestore();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  // Chave decodificada de Base64 em tempo de execução
  const privateKeyBase64 = "LS0tLS1CRUdJTiBQUklWQVRFIEtFWy0tLS0tCk1JSUV2UUlCQURBTkJna3FoamtpRzkwQkFRRUZBQVNDQktjd2dnU2pBZ0VBQW9JQkFRRE00bUZaV29odXdXQWcKbWR4SXAzbnZoMU03dFNtcktmM1hSaiI0bU5SWjVaWjRzaFFJdWcrZ1g1cExHNjN1NlZxcFkwRlNzdkxqYmllMApqUmUyRTByanljRTR6cWVzRm9WYmlUZXhWQjBTSTc3QTZ2cDNWU2NhMmlZUlFvTldrR1BzVzJ4MmlkdlBmdWJICnh6WWRvSkcreEllLUM1bG8rRzFMZU5jL2cxeU9rbXdMRVQzZDdYbzRMSTBOcHNETUkwYUxYNXBkL3N5NjAzOXQKNmZzOXlPSjNceG9iWWJQays3UjJlMmtucmozK21HRERqR014dEY1V01oY3BWdWNCYzdxSDUyQTRvb3VPeWhPCmZhZmQrYUJVa1BJZ2RPMFIvWXRiVzRFcXlHQmtmTmdEMWNmUEx2N3MzT1hVMUtXd0VhVHB6d1pmUFFDUk9nUzEKNG5Icm53N1BhZ01iQUFFQ2dnRUFMS3dwQmN2VWJ2WUtVN0FuYWJ3SjdHVFFaM01hb2V3clQvTTdQZHMxYnNFClRtaVQrWTFCcVRJc2JiQlhldkZzZi9lcXFweHFIMmx5Z3FwTnNpNkJKU1NHdUhQNlp0ZTltYWdwK2xZcmcyek8KMjVGU3FPL0NxV1pvRG16Yy84bFpTUW16RDgvY056cHB4Y2IvQ2NZL25uQnd0cXFyOVpCOUItNStNd0NSL0c4VwpFcEl0WEtYZzUyRzZkKzE1aFFtR1pFWEV4ck5DRzNJdWRKTTd2MkpCbExvSG5KM09lMkp5YUhnTWZScnp2VTUwCjM5K3o2WW50RFZxN1QyNlhGckw2L0s0ZkVnNUlweGJ0dzd6dGxNVXBRMnZ0eExRNUFZVEFrZiVVMjJ6M3QxdnMKRGpqcm44VUViQU9ieUU5R2Q3RFI4VEExR3gwZm9YTUFzQlZSSTJ4Y1lRS0JnUURsd2pETkRSeUJpRTI0eHU1VgolUEZka1N3YzQ1eVJZNjZBSUlpVnJ6TGRDdXFDYndiSi9qZmViNDFwRFcwU1N6dlZkYzdIcWxKc01maU00c2EKbWJJTWZVZjc3Q0tVVmhuaFNxOHZva3JTeHZMMW9SMmRFUXBVZXZjcGtlTnMrR3hvSkpJV3NiYUNJRnFzYnh4CmJrL0JrNmxvaUNTaityc0pVRXYnT3BSMFBRS0JnUURrc09ieFJJNHVxeVQzc2lCVTcyUUpkcldHN243bmptV3oKNUFjd3Q4c0NSOWZIRXZ0MVljd25CdkVWbVVoRjZnTkdLaXdVZGQ4RlFuUDExRlVrWGR5U256NkFrZFZIT3ZMRmIKbm5VMUhhdFFqOEhwQmRrSWRyOW12VW1UWmRVbHVpZHYzVjItRkdGRWY4NGZENWRwV0JDYkx3S3VCNm1SMFdkNkIKQ3BNd3NjS2VueHdLamdDQUZscU9kaGpHUGU3V2JGREJoc1BJbmY0eHZOSzBXd1FlZm93R2pRSWxsdE5XTWhnUXgKcFlPMzhHcU4wbnZRTXRSN2l4aU5tTUIzbm5xWGZHVnlzbHdIUVE4eWRBZEFrTGVEZGRkZGZmdDIybjFESHVyZnVN \\nbnBNdU5mVi85Vk0gdEdHSFBYWkdEaDE5di9BbVF5WGR3dG5EMlpaRWdHdzA1VHNRUHdDL0hyTUl0aEFvR0FmTndX \\nM0oxWGV2UW1vUWdmSVBZdmI2azdLa2duWlQtY1ZGN0dCQUp5bUMwN3BGbWdpWG85RkJkNjR3cGNla2pkSWNyUA \\nkjVCcnB0Q2QvRGZYNmY0Tnp4eFI4ejZJNVRyVnVpQk9ZTU04QUN6aTBsU21GMUdheGlGb0pNNEpXb1p2TSs \\ndnduSHVldkdSbHR5dUFvYkFic2gzQnd3eWFvUy80YXRXWjBnUkNDZ0VdQW54OWZKd2FRL0JtdVkydjBkcTE \\nbnpHcTJuaFZMVWpqK29GWWsxVmt6Rzg5ZHRJQ3M0eSxnRVRJOUF1QW15RjIvbkV6QjZuTXNnOTZ3Q1dXOVFvaWhu \\nbmRCaUZOVzhNUEszeUh1aUNnRkV5TERBalE3bjM3cG9JM2pEQzAwOGU5UmdabkpUMDRmWHRpdlNRMFd6K1c2R3c \\UlM3QndFQ1UrQnIzS3FsMTExOG1xRFU0PQotLS0tLUVORCBQUklWQVRFIEtFWy0tLS0t";

  const privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');

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
