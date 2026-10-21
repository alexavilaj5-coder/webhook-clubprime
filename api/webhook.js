import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

export default async function handler(req, res) {
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const payload = req.body;
    console.log("Recebido Webhook InfinitePay:", JSON.stringify(payload));

    const customerEmail = 
      payload?.data?.buyer?.email ||
      payload?.buyer?.email ||
      payload?.customer?.email ||
      payload?.data?.customer?.email ||
      payload?.email;

    if (!customerEmail) {
      console.log("Nenhum e-mail localizado no payload do Webhook.");
      return res.status(200).json({ message: "Notificação recebida sem e-mail." });
    }

    const cleanEmail = customerEmail.trim().toLowerCase();

    // Calcula 30 dias a partir de HOJE
    const agora = new Date();
    const dataExpiracao = new Date(agora.setDate(agora.getDate() + 30)).toISOString();

    const usersRef = db.collection('usuarios');
    const snapshot = await usersRef.where('email', '==', cleanEmail).get();

    if (snapshot.empty) {
      // Cria o registro novo com VIP ativo por 30 dias
      await usersRef.add({
        email: cleanEmail,
        vip: true,
        vipExpiraEm: dataExpiracao,
        criadoEm: new Date().toISOString(),
        origem: 'infinitepay_webhook'
      });
      console.log(`Novo usuário VIP por 30 dias criado: ${cleanEmail}`);
    } else {
      // Atualiza o registro existente renovando mais 30 dias
      const batch = db.batch();
      snapshot.forEach(doc => {
        batch.update(doc.ref, { 
          vip: true,
          vipExpiraEm: dataExpiracao,
          atualizadoEm: new Date().toISOString()
        });
      });
      await batch.commit();
      console.log(`VIP renovado por 30 dias para: ${cleanEmail}`);
    }

    return res.status(200).json({ success: true, email: cleanEmail, expiraEm: dataExpiracao });

  } catch (error) {
    console.error("Erro no processamento do Webhook:", error);
    return res.status(500).json({ error: error.message });
  }
}
