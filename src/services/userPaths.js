import { collection, doc } from 'firebase/firestore';
import { db, appId } from './firebase.js';
export const userDoc = (uid, group, id) => doc(db, 'artifacts', appId, 'users', uid, group, id);
export const userCollection = (uid, group) => collection(db, 'artifacts', appId, 'users', uid, group);
