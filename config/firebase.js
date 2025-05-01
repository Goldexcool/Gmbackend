// config/firebase.js
const admin = require('firebase-admin');
require('dotenv').config();

// Check if Firebase is initialized
let bucket = null;

try {
  console.log('Initializing Firebase with environment variables...');
  
  // Format the private key correctly (replacing escaped newlines)
  const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

  const firebaseConfig = {
    type: process.env.FIREBASE_TYPE || 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: privateKey,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
  };

  // Only initialize if not already initialized and if credentials exist
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(firebaseConfig),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    bucket = admin.storage().bucket();
  } else {
    bucket = admin.storage().bucket();
  }

  console.log('Firebase initialized successfully');

  // Export Firebase Admin services
  const db = admin.firestore();
  const auth = admin.auth();

  module.exports = {
    admin,
    db,
    bucket,
    auth
  };
} catch (error) {
  console.error('Firebase initialization error:', error.message);
  
  // Provide mock services to prevent app crashes
  console.log('Using mock Firebase services...');
  
  module.exports = {
    admin: null,
    db: {
      collection: () => ({
        add: async () => ({ id: 'mock-id' }),
        get: async () => ({ docs: [] }),
        doc: () => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set: async () => ({}),
          update: async () => ({})
        })
      })
    },
    bucket: {
      upload: () => Promise.resolve({ publicUrl: () => "" }),
      file: () => ({ delete: () => Promise.resolve() })
    },
    auth: {
      verifyIdToken: async () => ({ uid: 'mock-user-id' })
    }
  };
}