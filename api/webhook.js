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
    console.log("Payload recebido:", JSON.stringify(payload));

    // Permite que o app envie diretamente o e-mail ao clicar em "Verificar Pagamento"
    let customerEmail = payload?.email || payload?.data?.buyer?.email || payload?.buyer?.email || payload?.customer?.email;

    if (!customerEmail) {
      const payloadString = JSON.stringify(payload);
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matches = payloadString.match(emailRegex);
      if (matches && matches.length > 0) {
        customerEmail = matches[0];
      }
    }

    if (!customerEmail) {
      console.log("Nenhum e-mail identificado na requisição.");
      return res.status(400).json({ success: false, error: "E-mail não identificado. Informe o e-mail." });
    }

    const cleanEmail = customerEmail.trim().toLowerCase();
    console.log("Processando liberação VIP para:", cleanEmail);

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
        origem: 'checkout_verificado'
      });
      console.log(`Novo VIP criado para: ${cleanEmail}`);
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
    console.error("Erro no processamento:", error);
    return res.status(500).json({ error: error.message });
  }
}
