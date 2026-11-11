import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Conexão única com o Firebase Admin, usada por webhook.js e checar-pix.js.
// As credenciais vêm só das variáveis de ambiente da Vercel:
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// (valores do arquivo JSON baixado em Firebase > Configurações do projeto > Contas de serviço)

function lerCredenciais() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  const faltando = [
    !projectId && 'FIREBASE_PROJECT_ID',
    !clientEmail && 'FIREBASE_CLIENT_EMAIL',
    !privateKey && 'FIREBASE_PRIVATE_KEY'
  ].filter(Boolean);

  if (faltando.length) {
    throw new Error(`Variáveis de ambiente do Firebase não configuradas na Vercel: ${faltando.join(', ')}`);
  }

  // Aceita a chave com "\n" escrito como texto e remove aspas coladas por engano.
  privateKey = privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
  return { projectId, clientEmail, privateKey };
}

export function getDb() {
  if (!getApps().length) {
    initializeApp({ credential: cert(lerCredenciais()) });
  }
  return getFirestore();
}
