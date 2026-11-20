import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Conexão única com o Firebase Admin, usada por webhook.js e checar-pix.js.
// Nenhuma chave fica no código. As credenciais vêm das variáveis de ambiente da Vercel.
//
// Jeito mais simples (recomendado): UMA variável chamada FIREBASE_SERVICE_ACCOUNT,
// com o conteúdo INTEIRO do arquivo .json baixado do Firebase
// (Configurações do projeto > Contas de serviço > Gerar nova chave privada).
//
// Alternativa: três variáveis separadas
// FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY.

function lerCredenciais() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (json) {
    let conta;
    try {
      conta = JSON.parse(json);
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT não é um JSON válido. Cole o conteúdo inteiro do arquivo .json, do primeiro { ao último }.');
    }
    if (!conta.project_id || !conta.client_email || !conta.private_key) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT está incompleto (faltam project_id, client_email ou private_key).');
    }
    return {
      projectId: conta.project_id,
      clientEmail: conta.client_email,
      privateKey: conta.private_key.replace(/\\n/g, '\n')
    };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  const faltando = [
    !projectId && 'FIREBASE_PROJECT_ID',
    !clientEmail && 'FIREBASE_CLIENT_EMAIL',
    !privateKey && 'FIREBASE_PRIVATE_KEY'
  ].filter(Boolean);

  if (faltando.length) {
    throw new Error('Credenciais do Firebase não configuradas na Vercel. Crie FIREBASE_SERVICE_ACCOUNT ou: ' + faltando.join(', '));
  }

  privateKey = privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
  return { projectId, clientEmail, privateKey };
}

export function getDb() {
  if (!getApps().length) {
    initializeApp({ credential: cert(lerCredenciais()) });
  }
  return getFirestore();
}
