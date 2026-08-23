import type { Auth } from "firebase/auth"
import type { Firestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

export function firebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)
}

let servicesPromise: Promise<{ db: Firestore; auth: Auth }> | null = null

function getServices(): Promise<{ db: Firestore; auth: Auth }> {
  if (!firebaseConfigured()) {
    return Promise.reject(new Error("Game scoring is not configured on this deployment."))
  }

  servicesPromise ??= (async () => {
    const { initializeApp, getApps } = await import("firebase/app")
    const { getAuth, signInAnonymously } = await import("firebase/auth")
    const { getFirestore } = await import("firebase/firestore")
    const app = getApps()[0] ?? initializeApp(firebaseConfig)
    const auth = getAuth(app)
    if (!auth.currentUser) await signInAnonymously(auth)
    return { db: getFirestore(app), auth }
  })()

  return servicesPromise
}

export async function getDb(): Promise<Firestore> {
  return (await getServices()).db
}

export async function requireUserId(): Promise<string> {
  const { auth } = await getServices()
  if (!auth.currentUser) throw new Error("Sign-in did not complete.")
  return auth.currentUser.uid
}
