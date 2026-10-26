import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  // Chave decodificada de Base64 em tempo de execução (imune a cortes da Vercel)
  const privateKeyBase64 = "LS0tLS1CRUdJTiBQUklWQVRFIEtFWy0tLS0tCk1JSUV2UUlCQURBTkJna3FoamtpRzkwQkFRRUZBQVNDQktjd2dnU2pBZ0VBQW9JQkFRRE00bUZaV29odXdXQWcKbWR4SXAzbnZoMU03dFNtcktmM1hSaiI0bU5SWjVaWjRzaFFJdWcrZ1g1cExHNjN1NlZxcFkwRlNzdkxqYmllMApqUmUyRTByanljRTR6cWVzRm9WYmlUZXhWQjBTSTc3QTZ2cDNWU2NhMmlZUlFvTldrR1BzVzJ4MmlkdlBmdWJICnh6WWRvSkcreEllLUM1bG8rRzFMZU5jL2cxeU9rbXdMRVQzZDdYbzRMSTBOcHNETUkwYUxYNXBkL3N5NjAzOXQKNmZzOXlPSjNceG9iWWJQays3UjJlMmtucmozK21HRERqR014dEY1V01oY3BWdWNCYzdxSDUyQTRvb3VPeWhPCmZhZmQrYUJVa1BJZ2RPMFIvWXRiVzRFcXlHQmtmTmdEMWNmUEx2N3MzT1hVMUtXd0VhVHB6d1pmUFFDUk9nUzEKNG5Icm53N1BhZ01iQUFFQ2dnRUFMS3dwQmN2VWJ2WUtVN0FuYWJ3SjdHVFFaM01hb2V3clQvTTdQZHMxYnNFClRtaVQrWTFCcVRJc2JiQlhldkZzZi9lcXFweHFIMmx5Z3FwTnNpNkJKU1NHdUhQNlp0ZTltYWdwK2xZcmcyek8KMjVGU3FPL0NxV1pvRG16Yy84bFpTUW16RDgvY056cHB4Y2IvQ2NZL25uQnd0cXFyOVpCOUItNStNd0NSL0c4VwpFcEl0WEtYZzUyRzZkKzE1aFFtR1pFWEV4ck5DRzNJdWRKTTd2MkpCbExvSG5KM09lMkp5YUhnTWZScnp2VTUwCjM5K3o2WW50RFZxN1QyNlhGckw2L0s0ZkVnNUlweGJ0dzd6dGxNVXBRMnZ0eExRNUFZVEFrZiVVMjJ6M3QxdnMKRGpqcm44VUViQU9ieUU5R2Q3RFI4VEExR3gwZm9YTUFzQlZSSTJ4Y1lRS0JnUURsd2pETkRSeUJpRTI0eHU1VgolUEZka1N3YzQ1eVJZNjZBSUlpVnJ6TGRDdXFDYndiSi9qZmViNDFwRFcwU1N6dlZkYzdIcWxKc01maU00c2EKbWJJTWZVZjc3Q0tVVmhuaFNxOHZva3JTeHZMMW9SMmRFUXBVZXZjcGtlTnMrR3hvSkpJV3NiYUNJRnFzYnh4CmJrL0JrNmxvaUNTaityc0pVRXYnT3BSMFBRS0JnUURrc09ieFJJNHVxeVQzc2lCVTcyUUpkcldHN243bmptV3oKNUFjd3Q4c0NSOWZIRXZ0MVljd25CdkVWbVVoRjZnTkdLaXdVZGQ4RlFuUDExRlVrWGR5U256NkFrZFZIT3ZMRmIKbm5VMUhhdFFqOEhwQmRrSWRyOW12VW1UWmRVbHVpZHYzVjItRkdGRWY4NGZENWRwV0JDYkx3S3VCNm1SMFdkNkIKQ3BNd3NjS2VueHdLamdDQUZscU9kaGpHUGU3V2JGREJoc1BJbmY0eHZOSzBXd1FlZm93R2pRSWxsdE5XTWhnUXgKcFlPMzhHcU4wbnZRTXRSN2l4aU5tTUIzbm5xWGZHVnlzbHdIUVE4eWRBZEFrTGVEZGRkZGZmdDIybjFESHVyZnVN \\nbnBNdU5mVi85Vk0gdEdHSFBYWkdEaDE5di9BbVF5WGR3dG5EMlpaRWdHdzA1VHNRUHdDL0hyTUl0aEFvR0FmTndX \\nM0oxWGV2UW1vUWdmSVBZdmI2azdLa2duWlQtY1ZGN0dCQUp5bUMwN3BGbWdpWG85RkJkNjR3cGNla2pkSWNyUA \\nJkejVCcnB0Q2QvRGZYNmY0Tnp4eFI4ejZJNVRyVnVpQk9ZTU04QUN6aTBsU21GMUdheGlGb0pNNEpXb1p2TSs \\ndnduSHVldkdSbHR5dUFvYkFic2gzQnd3eWFvUy80YXRXWjBnUkNDZ0VdQW54OWZKd2FRL0JtdVkydjBkcTE \\nnbnpHcTJuaFZMVWpqK29GWWsxVmt6Rzg5ZHRJQ3M0eSxnRVRJOUF1QW15RjIvbkV6QjZuTXNnOTZ3Q1dXOVFvaWhu \\nbmRCaUZOVzhNUEszeUh1aUNnRkV5TERBalE3bjM3cG9JM2pEQzAwOGU5UmdabkpUMDRmWHRpdlNRMFd6K1c2R3c \\nUlM3QndFQ1UrQnIzS3FsMTExOG1xRFU0PQotLS0tLUVORCBQUklWQVRFIEtFWy0tLS0t";

  const privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');

  if (projectId && clientEmail) {
    initializeApp({
      credential: cert({
        projectId: projectId.trim(),
        clientEmail: clientEmail.trim(),
        privateKey: privateKey,
      })
    });
    console.log("✅ Firebase Admin inicializado com sucesso no Webhook!");
  } else {
    console.error("❌ ERRO: Credenciais do Firebase incompletas nas variáveis de ambiente da Vercel.");
  }
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
