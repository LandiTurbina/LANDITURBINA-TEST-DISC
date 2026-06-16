import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase, ref, push, get } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCKIekIOjBRWGwzWm67-rYLw1xwWXOc6F8",
  authDomain: "landimentoria.firebaseapp.com",
  databaseURL: "https://landimentoria-default-rtdb.firebaseio.com",
  projectId: "landimentoria",
  storageBucket: "landimentoria.firebasestorage.app",
  messagingSenderId: "352587122829",
  appId: "1:352587122829:web:c9097b32396887844dbac4"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const database = getDatabase(app);

export async function getPreviousTest(telefone: string) {
  try {
    const sanitizePhone = (phone: string) => phone.replace(/\D/g, '');
    const userPhone = sanitizePhone(telefone);
    if (!userPhone) return null;

    const testRef = ref(database, `users/${userPhone}/tests`);
    const snapshot = await get(testRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      const tests = Object.values(data) as any[];
      tests.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      return tests.length > 0 ? tests[0] : null;
    }
    return null;
  } catch (error) {
    console.error("Firebase error getting previous test:", error);
    return null;
  }
}

export async function saveDiscResult(data: any) {
  try {
    const sanitizePhone = (phone: string) => phone.replace(/\D/g, '');
    const userPhone = sanitizePhone(data.user.telefone);

    if (!userPhone) throw new Error("Telefone é obrigatório para salvar o resultado.");

    const testRef = ref(database, `users/${userPhone}/tests`);
    await push(testRef, {
      timestamp: new Date().toISOString(),
      leadData: data.user,
      rawAnswers: data.answers,
      rawScores: data.result.rawScores,
      percentages: data.result.percentages,
      primaryProfile: data.result.primaryProfile,
      secondaryProfile: data.result.secondaryProfile
    });
    return true;
  } catch (error) {
    console.error("Firebase error saving result:", error);
    return false;
  }
}
