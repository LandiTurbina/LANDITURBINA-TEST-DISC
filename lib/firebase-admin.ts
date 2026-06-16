import "server-only";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getDatabase,
  get,
  push,
  ref as databaseRef,
  set,
  update,
  type DatabaseReference,
} from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCKIekIOjBRWGwzWm67-rYLw1xwWXOc6F8",
  authDomain: "landimentoria.firebaseapp.com",
  databaseURL: "https://landimentoria-default-rtdb.firebaseio.com",
  projectId: "landimentoria",
  storageBucket: "landimentoria.firebasestorage.app",
  messagingSenderId: "352587122829",
  appId: "1:352587122829:web:c9097b32396887844dbac4",
};

function getFirebaseDatabase() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getDatabase(app);
}

function wrapRef(firebaseRef: DatabaseReference) {
  return {
    key: firebaseRef.key,
    get: () => get(firebaseRef),
    set: (value: unknown) => set(firebaseRef, value),
    update: (value: Record<string, unknown>) => update(firebaseRef, value),
    push: () => wrapRef(push(firebaseRef)),
  };
}

export function getAdminDb() {
  const database = getFirebaseDatabase();

  return {
    ref(path = "") {
      return wrapRef(databaseRef(database, path));
    },
  };
}
