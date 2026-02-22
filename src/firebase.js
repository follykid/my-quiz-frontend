// src/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database"; // 這是 Realtime Database 的核心

const firebaseConfig = {
  apiKey: "AIzaSyAW50XInUSYmSsT0ww1YZafU2bZlJeOnLc",
  authDomain: "knowledgeking-a7209.firebaseapp.com",
  databaseURL: "https://knowledgeking-a7209-default-rtdb.firebaseio.com",
  projectId: "knowledgeking-a7209",
  storageBucket: "knowledgeking-a7209.firebasestorage.app",
  messagingSenderId: "121602685475",
  appId: "1:121602685475:web:230ebd9c56d8eacdeecf96",
  measurementId: "G-MC0CNXQX39"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 獲取資料庫實例並導出
export const db = getDatabase(app);