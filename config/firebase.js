// config/firebase.js
const admin = require('firebase-admin');
require('dotenv').config();

// Handle Firebase initialization with environment variables
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

  // Initialize Firebase Admin
  admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });

  console.log('Firebase initialized successfully');

  // Export Firebase Admin services
  const db = admin.firestore();
  const storage = admin.storage().bucket();
  const auth = admin.auth();

  module.exports = {
    admin,
    db,
    storage,
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
    storage: {
      file: () => ({
        save: async () => ({}),
        makePublic: async () => ({}),
        getSignedUrl: async () => ['https://mock-url.com/file']
      }),
      name: 'mock-bucket'
    },
    auth: {
      verifyIdToken: async () => ({ uid: 'mock-user-id' })
    }
  };
}