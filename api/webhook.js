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
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: "E-mail não fornecido." });
    }

    const cleanEmail = email.trim().toLowerCase();
    console.log("Ativando VIP via retorno de checkout para:", cleanEmail);

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
        origem: 'checkout_retorno'
      });
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
    }

    return res.status(200).json({ success: true, email: cleanEmail, expiraEm: dataExpiracao });

  } catch (error) {
    console.error("Erro no processamento:", error);
    return res.status(500).json({ error: error.message });
  }
}
