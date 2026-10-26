import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const projectId = "projeto-01-63111";
  const clientEmail = "firebase-adminsdk-fbsvc@projeto-01-63111.iam.gserviceaccount.com";
  
  // Chave nova tratada com conversão direta de barras invertidas para quebras reais
  const rawKey = `-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDLtp1D9TlHAqLO\nc2OdwRt4mJkVkc9cAlPDXwLjoB+6kOFI7oI0SBJnhjnMoOQCd7IZjfs6r3t3CKER\n3L45fkEB19SxCaaHGOqM/ItHbqTt5WRu5uNOpiXmOj2BwT/HSUBNpuFyvpWfPzjX\n6WOb8PhdWoiEkPZ9rqptPT9CxafeIICc/oGFtCMgGRMEQK3VCdbNRX2LM7Qspik9\nIg+gJhhjrNcruGhAhnX3c5xXaNJ8bi3p9RIC7yrY2Xdqdp1FfiXfkvL5WcpNOY8y\nnUsaCnByurKYfuQsWD9DTZ+bXczXNRsx2yuDjjDrmwGSieChMRrWNvv4SkDQyzPt\nQ8r975xjAgMBAAECggEACi00vQclcUpV654wyGwz+HnOfs/aa6oMq1KIZjOnX9U4\nSsHFw4Yjnc1VbNlz46f0Gzn95kgdx8dxyrpJqirjicKIYeQABwtGPzODYx/t875y\n+eXlTl9ymfPxTDoJsdNKLrbj/HX0vWKe7vrithDNb3q61L0aBFxOeRnZiEAv9EdV\nQ7tthVoZP0vDLO21+sMlR3WupxhqZus7A1vsaPF+aOjPjz0y29mAgiIL5YRzQlDA\nJ3Py+yUbOgkCNyctFzBIy5j9HoW+6dSzBOhBz1CnCDtwFm48RoAJdFDcM4aHLAx7\nbdk1f0mZfnDa7JWsS1CLtzgxsyU9O8ab0oVYcgxzlQKBgQDuSxBKbj8OV5EJUiIM\n24D8tfsRzyfof/pnOrcUWAenWf2UKjPdhmf++E4hCdKAzpdEDfIj4xdA+V4U3Ad/\nkI0qBdzX08bquN1r1hCIERsDjabOpHO1zz3CBodlA+B9tfeECmqP9tKAnKkBwZG9\nOQydtfgX8so1aa613e3VSe9U3QKBgQDa2cEfV/aW/rUkGV3G+pjfbYZAn2TbtLhX\nVdatfVTgL7KFNxaJzqlJQ+bz0+s7fB5sgq2um21RYnF8Lhdi3k3oKRVfnCMHM24j\n0/O8pqHXZ0cgetL0fNY3+ZwDouBrsq9rawQmBQJy1us8JEbiEN/TsBKsSaJDf/eC\nqFjtnOACPwKBgQC2rFSQunMcS4Sj4JK5yIvZLqiJvoSZd4I+IIS408MKR7JdIv0f\nlSmkDDXYne8BT14mjYpSeIQbCw9UblhRMj8FN/lUesTCq3USdce2h2ZuEukNAISz\nm2t8kgS5K3+s3xIf5txKAKzeazokXn+az2EchaLquPTKfXmxcbAhEcynAQKBgCpW\n7HTq6KsHtfW47pqbSs4W+10vOS0ERpGm6rR/xdblg20gXjzk/X1OJLVRb3X/qkcl\n9QIN0dVn7TqwFBgtl/btU9Q+ecxf19QYolQCDNeGhI01FfD04eDMarGNZkuPsz5d\n4tyUJYggKjxlbE06JINo0gQA7uKONE1T0niN3AyzAoGBANUkTkndBm6gxlQF/ZLi\nIOxydCd4CnAyJ7wZA7/Hltv9LH1ldzbuVuMWeT6nCbtsh47QWADHy5a0kikYp4SB\naVi4O16PXSVHmXGhTkhDxDZHUPxuGBP7UItorcdVhaFTqYUk+WcDgiRgkxTs6v/7\n/1njYdLKgl1Pb1xLZ+TGFew4\n-----END PRIVATE KEY-----`;

  const privateKey = rawKey.replace(/\\n/g, '\n');

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    })
  });
  console.log("✅ Firebase Admin inicializado com sucesso no Webhook!");
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
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
    console.error('❌ Erro no Webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
