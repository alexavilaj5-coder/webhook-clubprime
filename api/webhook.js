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
      console.error("Erro no JSON do Firebase:", err.message);
    }
  }
}

let db = null;
try {
  db = getFirestore();
} catch (e) {
  console.error("Erro ao conectar no Firestore:", e.message);
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
    return res.status(500).json({ error: "Banco de dados não conectado." });
  }

  try {
    const payload = req.body;
    // Imprime o JSON inteiro no console da Vercel para sabermos a estrutura exata
    console.log("=== PAYLOAD COMPLETO DA INFINITEPAY ===", JSON.stringify(payload, null, 2));

    let customerEmail = 
      payload?.data?.buyer?.email ||
      payload?.buyer?.email ||
      payload?.customer?.email ||
      payload?.data?.customer?.email ||
      payload?.data?.client?.email ||
      payload?.client?.email ||
      payload?.data?.metadata?.email ||
      payload?.metadata?.email ||
      payload?.email;

    if (!customerEmail) {
      const payloadString = JSON.stringify(payload);
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matches = payloadString.match(emailRegex);
      if (matches && matches.length > 0) {
        customerEmail = matches[0];
      }
    }

    if (!customerEmail) {
      console.log("ALERTA: Nenhum e-mail encontrado no payload da InfinitePay.");
      return res.status(200).json({ message: "Recebido, mas sem e-mail." });
    }

    const cleanEmail = customerEmail.trim().toLowerCase();
    console.log("E-MAIL EXTRAÍDO COM SUCESSO:", cleanEmail);

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
      console.log(`Novo usuário VIP criado: ${cleanEmail}`);
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
      console.log(`VIP renovado para: ${cleanEmail}`);
    }

    return res.status(200).json({ success: true, email: cleanEmail, expiraEm: dataExpiracao });

  } catch (error) {
    console.error("Erro fatal no webhook:", error);
    return res.status(500).json({ error: error.message });
  }
}
