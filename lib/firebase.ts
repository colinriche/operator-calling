import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { firebaseClientConfig } from "./firebase-env";

// The project is `operator-calling`, hard-coded in lib/firebase-env.ts. The
// Admin SDK resolves through that same module, so the project the browser signs
// in against is always the project the server verifies those tokens with.
//
// The config is a constant, so there is no build-time placeholder branch:
// `next build` prerenders with the same real config it will run with.
const firebaseConfig = firebaseClientConfig();

const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

export { auth, db, storage };
export default app;
