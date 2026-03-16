// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD3fdo1NbrgCV2pUv_0dPaPoMN-eqFfx7M",
  authDomain: "lancemate-38db8.firebaseapp.com",
  projectId: "lancemate-38db8",
  storageBucket: "lancemate-38db8.firebasestorage.app",
  messagingSenderId: "441627412874",
  appId: "1:441627412874:web:0778752aec824b1e2be073",
};

// Initialize Firebase
import { getApps, getApp } from "firebase/app";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
