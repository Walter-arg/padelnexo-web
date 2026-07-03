import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD4hHUTo91MlrPSjcX2MgrRYMO28SyGLkc",
  authDomain: "padelnexo-7e4d5.firebaseapp.com",
  projectId: "padelnexo-7e4d5",
  storageBucket: "padelnexo-7e4d5.firebasestorage.app",
  messagingSenderId: "553114005250",
  appId: "1:553114005250:web:165d91c22422db4bb1dc1b",
  measurementId: "G-QN1VBWMMH7",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
