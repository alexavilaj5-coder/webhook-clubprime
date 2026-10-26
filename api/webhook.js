import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  
  // Chave estática com alinhamento absoluto à esquerda (coluna 0)
  const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDM4mFZWohuwWAg
mdxIp3nvh1M7tSmrK03xRj24mNRZ5PZ4shQIug+gX5pLG63u6VqpY0FSsvLjbie0
jRe2E0rjycE4zqesFoVbiTexVB0SI77A6vp3VSca2iYRqoNWkGPsW2x2idvPfubH
xzYdoJG+xIe+C5lo+G1LeNc/g1yOkmwLET3d7Xo4LN0NpsDMI0aLX5pd/sy6039t
6fs9yO3J4xobYbPK+7RI2e2kNrj2+mGDDjGMxtH5WMhcpVucBc7qH52A4oouOyhO
fafd+aBUkPIgdO0R/YtbW4EqyGBkFNgD1cfPLv7s3OXU5KWwEaTpzwZfPQCROgS1
4nHrnw7PAgMBAAECggEABLwpBcvUbvYKU7AnabwJ7GHTQZ3MaoewrT/M7Pds1bsE
TmiT+Y1BqTIsbbBXeVFsf/eqqpxqH2lygqpNsi6JKSSGuHP5Zte9magp+lYrg2zO
25FSqO/CqWZoDmzc/8lZSQmzD8/cNzppxcb/CcY/nnBwtqqr9ZB9B75+MwCR/G8W
EpItXKXg52G6d+15hQmGZEXExrNCD3IudJM7v2JBlLoHnJ3Oe2JyaHgmfRzzvU50
39+z6YntDVq7T26XFrL6/K4fEg5Ipxbtw7ztlMUvQ2vtxLQ5AYTAkf+U28z3t1vs
Djjrn8UEbAObyE9Gd7DRTB1E7x0ofXMAsBVRI2xcYQKBgQDlwjDNDRyBiE24xu5T
6PFdkSwc45yRY46AIOiVrzLdCuqCwbYj+jfeb41pDW0SSvZvDc7HqLJsMfiM+4sa
mbIMfUF77CKUVhnJhSq8vokrSxvL1oR2dEQpUevcpkeNs+GxoJJvWsbaCIFqscbx
bk/Bk6loiCSj+rsJUeV6Ou0R0QKBgQDkSObxRI4uqYt3siBU72QJdrWG7n7njmWz
5Acwt8sCR9fHEvt1YcwnBvEVmUhF6gNgKiwUdd8FqNp1FuKXdySnz6AkdVHOvLfb
nnUuHatQj8HpBdkIdr9mvUmTZdUluidv3V2+FGFEf84fD5dpWBCbLwKuB2mR0Wd6G
CpMwscKenwKBgCAFlqOdhjGPe7WbFDBhsPInf4xvNK0WwQ+ehowGJQKluNWMhgQx
pYO87GqN0nvQMtR7iixNmMB3nnqXvGVyslwHQQ8ydAdUkLeDdddkft2n1DHurfuM
nbMuNfV/9VM+tGHGXPZGDh19v/AmQyXdwtnD2UZAeGW05TsQXw/HrMIthAoGAfNvW
3J1XevQmoQgfIPVybK6t6KgnZvT+cV7GBAJymcO7pFmgiXo9FBd64wpcekjdIcrP
Iz25BrptCd/DfX6f4NzxxR8Z6I5VrVuiBOYMM8ACzi0lSmF1GaxiFoJM8JWcZvM+
vrgnHuevGRltyuAobAbsh3BwwyaoS/4atWZ0gRcCgYEAnx9fJwlQa/BmVy2v0dq1
nzgQ2nhVLUj++oFYk1VkzG89dtICc4y+gETI9AuAmyF2/nEzB6nMsg9vCwW9Qoihn
ndBiFNW8MPK3yHuiCgFEyLDAjO7n37poI3jDC+08e9RgZNzJT4fXtivSQ0Wz+W6Gw
RS7BwECU+Br3kqH118mqDU4=
-----END PRIVATE KEY-----`;

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
