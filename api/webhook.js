import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (rawServiceAccount) {
    try {
      const serviceAccount = JSON.parse(rawServiceAccount);
      initializeApp({
        credential: cert(serviceAccount)
      });
    } catch (err) {
      console.error("Erro no JSON da chave do Firebase:", err.message);
    }
  }
}

let db = null;
try {
  db = getFirestore();
} catch (e) {
  console.error("Erro ao conectar no Firestore Admin:", e.message);
}

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

  if (!db) {
    return res.status(500).json({ error: "Firebase Admin não inicializado corretamente." });
  }

  try {
    const payload = req.body;
    console.log("Webhook InfinitePay recebido:", JSON.stringify(payload));

    // Procura o e-mail em todas as estruturas possíveis que a InfinitePay envia
    const customerEmail = 
      payload?.data?.buyer?.email ||
      payload?.buyer?.email ||
      payload?.customer?.email ||
      payload?.data?.customer?.email ||
      payload?.data?.client?.email ||
      payload?.client?.email ||
      payload?.email;

    if (!customerEmail) {
      console.log("Aviso: Webhook recebido sem e-mail no payload.");
      return res.status(200).json({ message: "Notificação recebida, mas nenhum e-mail foi localizado." });
    }

    const cleanEmail = customerEmail.trim().toLowerCase();

    // Calcula exatamente 30 dias de VIP a partir de agora
    const agora = new Date();
    const dataExpiracao = new Date(agora.setDate(agora.getDate() + 30)).toISOString();

    const usersRef = db.collection('usuarios');
    const snapshot = await usersRef.where('email', '==', cleanEmail).get();

    if (snapshot.empty) {
      await usersRef.add({
        email: cleanEmail,
        vip: true,
        vipExpiraEm: dataExpiracao,
        criadoEm: new Date().toISOString(),
        origem: 'infinitepay_webhook'
      });
      console.log(`Novo usuário VIP criado por 30 dias: ${cleanEmail}`);
    } else {
      const batch = db.batch();
      snapshot.forEach(doc => {
        batch.update(doc.ref, { 
          vip: true,
          vipExpiraEm: dataExpiracao,
          atualizadoEm: new Date().toISOString()
        });
      });
      await batch.commit();
      console.log(`VIP renovado com sucesso por mais 30 dias para: ${cleanEmail}`);
    }

    return res.status(200).json({ success: true, email: cleanEmail, expiraEm: dataExpiracao });

  } catch (error) {
    console.error("Erro interno no processamento do Webhook:", error);
    return res.status(500).json({ error: error.message });
  }
}
