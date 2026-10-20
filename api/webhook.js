import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "projeto-01-63111"
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido' });
  }

  try {
    const payload = req.body;
    const customerEmail = payload?.data?.attributes?.customer?.email || payload?.customer?.email;

    if (customerEmail) {
      const snapshot = await db.collection('usuarios').where('email', '==', customerEmail).get();

      if (!snapshot.empty) {
        snapshot.forEach(async (doc) => {
          await doc.ref.update({ vip: true });
        });
        return res.status(200).json({ status: 'sucesso', message: 'VIP ativado com sucesso!' });
      }
    }

    return res.status(200).json({ status: 'recebido', message: 'Pagamento processado' });
  } catch (error) {
    console.error('Erro no Webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
