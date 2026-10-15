import { create } from 'zustand';
import type { User } from 'firebase/auth';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  arrayUnion,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { useStore } from '../store';
import type {
  Account,
  HouseholdItem,
  Member,
  MoneyCategory,
  Purchase,
  ShoppingItem,
  Task,
  TaskChecklistItem,
  Transaction,
} from './types';
import { toast } from '../store/ui';

export interface SyncState {
  user: User | null;
  householdId: string | null;
  inviteCode: string | null;
  householdName: string | null;
  status: 'unauthenticated' | 'loading' | 'ready' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: Date | null;
  error: string | null;
}

export interface SyncActions {
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string, isSignUp: boolean, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  createCloudHousehold: (name?: string) => Promise<string>;
  joinCloudHousehold: (code: string) => Promise<void>;
  clearError: () => void;
}

export const useSync = create<SyncState & SyncActions>((set, get) => ({
  user: null,
  householdId: null,
  inviteCode: null,
  householdName: null,
  status: 'loading',
  lastSyncedAt: null,
  error: null,

  clearError: () => set({ error: null }),

  loginWithGoogle: async () => {
    try {
      set({ status: 'loading', error: null });
      const res = await signInWithPopup(auth, googleProvider);
      toast({ title: `Signed in as ${res.user.displayName || res.user.email}` });
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      let msg = err.message || 'Google sign in failed';
      if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Sign in cancelled';
      } else if (err.code === 'auth/operation-not-allowed') {
        msg = 'Google Sign-In is not enabled in Firebase Console (Authentication > Sign-in method).';
      } else if (err.code === 'auth/unauthorized-domain') {
        msg = 'This domain is not authorized in Firebase Console (Authentication > Settings > Authorized domains).';
      }
      set({ status: 'error', error: msg });
      toast({ title: 'Sign-in failed', subtitle: msg, tone: 'error' });
    }
  },

  loginWithEmail: async (email: string, pass: string, isSignUp: boolean, displayName?: string) => {
    try {
      set({ status: 'loading', error: null });
      if (isSignUp) {
        const res = await createUserWithEmailAndPassword(auth, email.trim(), pass);
        if (displayName?.trim()) {
          await updateProfile(res.user, { displayName: displayName.trim() });
        }
        toast({ title: 'Account created successfully' });
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), pass);
        toast({ title: `Welcome back!` });
      }
    } catch (err: any) {
      console.error('Email Auth failed:', err);
      let msg = err.message || 'Authentication failed';
      if (err.code === 'auth/operation-not-allowed') {
        msg = 'Email/Password sign-in is not enabled in Firebase Console (Authentication > Sign-in method).';
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        msg = 'Incorrect email or password.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = 'This email is already registered. Please sign in.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/unauthorized-domain') {
        msg = 'This domain is not authorized in Firebase Console (Authentication > Settings > Authorized domains).';
      }
      set({ status: 'error', error: msg });
      toast({ title: 'Authentication error', subtitle: msg, tone: 'error' });
    }
  },

  logout: async () => {
    try {
      stopSyncListeners();
      await signOut(auth);
      set({
        user: null,
        householdId: null,
        inviteCode: null,
        householdName: null,
        status: 'unauthenticated',
        error: null,
      });
      toast({ title: 'Signed out' });
    } catch (err: any) {
      console.error('Logout failed:', err);
    }
  },

  createCloudHousehold: async (name?: string) => {
    const user = get().user;
    if (!user) throw new Error('Must be signed in to create household');

    set({ status: 'syncing', error: null });
    try {
      const storeState = useStore.getState();
      const hid = storeState.household.id || `h-${Date.now().toString(36)}`;
      const hName = name?.trim() || storeState.household.name || 'Our Home';
      const code = generateInviteCode();

      // 1. Create household doc
      const householdDocData = {
        id: hid,
        name: hName,
        createdAt: new Date().toISOString(),
        memberUids: [user.uid],
        inviteCode: code,
        householdBudget: storeState.householdBudget ?? null,
      };

      await setDoc(doc(db, 'households', hid), sanitizeForFirestore(householdDocData));

      // 2. Upload local household shared data
      await uploadCollection('households', hid, 'members', storeState.members);
      await uploadCollection('households', hid, 'tasks', storeState.tasks);
      await uploadCollection('households', hid, 'checklist', storeState.checklist);
      await uploadCollection('households', hid, 'shopping', storeState.shopping);
      await uploadCollection('households', hid, 'items', storeState.items);
      await uploadCollection('households', hid, 'purchases', storeState.purchases);
      await uploadCollection('households', hid, 'moneyCategories', storeState.moneyCategories);

      // Shared accounts & transactions
      const sharedAccounts = storeState.accounts.filter((a) => a.scope !== 'personal');
      await uploadCollection('households', hid, 'accounts', sharedAccounts);

      const sharedTxs = storeState.transactions.filter((t) => t.scope !== 'personal');
      await uploadCollection('households', hid, 'transactions', sharedTxs);

      // 3. Upload user profile and private personal wallet
      await setDoc(doc(db, 'users', user.uid), sanitizeForFirestore({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || 'User',
        householdId: hid,
        personalBudget: storeState.personalBudget ?? null,
        updatedAt: new Date().toISOString(),
      }));

      const personalAccounts = storeState.accounts.filter((a) => a.scope === 'personal');
      await uploadCollection('users', user.uid, 'personalAccounts', personalAccounts);

      const personalTxs = storeState.transactions.filter((t) => t.scope === 'personal');
      await uploadCollection('users', user.uid, 'personalTransactions', personalTxs);

      // Update sync state
      set({
        householdId: hid,
        householdName: hName,
        inviteCode: code,
        status: 'synced',
        lastSyncedAt: new Date(),
      });

      // Start listening for real-time updates
      startSyncListeners(user.uid, hid);

      toast({ title: 'Household synced to Cloud!', subtitle: `Invite Code: ${code}` });
      return code;
    } catch (err: any) {
      console.error('Failed to create cloud household:', err);
      let msg = err.message || 'Sync setup failed';
      if (err.code === 'permission-denied' || msg.includes('permission')) {
        msg = 'Firestore Security Rules must be published in Firebase Console. Please update rules in Firestore Database > Rules.';
      }
      set({ status: 'error', error: msg });
      toast({ title: 'Sync setup failed', subtitle: msg, tone: 'error' });
      throw err;
    }
  },

  joinCloudHousehold: async (rawCode: string) => {
    const user = get().user;
    if (!user) throw new Error('Must be signed in to join household');

    const code = rawCode.trim().toUpperCase();
    if (!code) throw new Error('Please enter an invite code');

    set({ status: 'syncing', error: null });
    try {
      // Find household with this inviteCode
      const q = query(collection(db, 'households'), where('inviteCode', '==', code));
      const snap = await getDocs(q);
      if (snap.empty) {
        throw new Error('No household found with code ' + code);
      }

      const hDoc = snap.docs[0];
      const hid = hDoc.id;
      const hData = hDoc.data() as any;

      // Add user to household's memberUids
      await updateDoc(doc(db, 'households', hid), {
        memberUids: arrayUnion(user.uid),
      });

      // Update user doc
      await setDoc(doc(db, 'users', user.uid), sanitizeForFirestore({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || 'Member',
        householdId: hid,
        updatedAt: new Date().toISOString(),
      }), { merge: true });

      set({
        householdId: hid,
        householdName: hData.name || 'Shared Household',
        inviteCode: hData.inviteCode,
        status: 'synced',
        lastSyncedAt: new Date(),
      });

      // Start listening and download shared data into Zustand store
      startSyncListeners(user.uid, hid);

      toast({ title: `Joined ${hData.name}!`, subtitle: 'Syncing shared tasks and wallet...' });
    } catch (err: any) {
      console.error('Failed to join cloud household:', err);
      let msg = err.message || 'Failed to join household';
      if (err.code === 'permission-denied' || msg.includes('permission')) {
        msg = 'Firestore Security Rules must be published in Firebase Console.';
      }
      set({ status: 'error', error: msg });
      toast({ title: 'Failed to join household', subtitle: msg, tone: 'error' });
      throw err;
    }
  },
}));

// =============================================================================
// Helper Utilities
// =============================================================================

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let res = 'NM-';
  for (let i = 0; i < 4; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) return null as unknown as T;
  if (data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(sanitizeForFirestore) as unknown as T;
  }
  const res: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      res[k] = sanitizeForFirestore(v);
    }
  }
  return res as unknown as T;
}

async function uploadCollection(parentCol: string, parentId: string, subCol: string, items: { id: string }[]) {
  for (const item of items) {
    if (!item.id) continue;
    await setDoc(doc(db, parentCol, parentId, subCol, item.id), sanitizeForFirestore(item));
  }
}

// =============================================================================
// Real-time Firestore Listeners & Bi-directional Sync
// =============================================================================

let activeUnsubscribes: Unsubscribe[] = [];
let isApplyingRemote = false;
let storeUnsubscribe: (() => void) | null = null;
let activeUserId: string | null = null;
let activeHouseholdId: string | null = null;

// Keep track of partitioned local slices so we can reconstruct Zustand store state
let remoteHouseholdAccounts: Account[] = [];
let remotePersonalAccounts: Account[] = [];
let remoteHouseholdTxs: Transaction[] = [];
let remotePersonalTxs: Transaction[] = [];

export function getActiveSyncContext() {
  return { userId: activeUserId, householdId: activeHouseholdId };
}

export function stopSyncListeners() {
  for (const unsub of activeUnsubscribes) {
    try {
      unsub();
    } catch (e) {
      /* ignore */
    }
  }
  activeUnsubscribes = [];

  if (storeUnsubscribe) {
    storeUnsubscribe();
    storeUnsubscribe = null;
  }

  activeUserId = null;
  activeHouseholdId = null;
}

export function startSyncListeners(userId: string, householdId: string) {
  stopSyncListeners();
  activeUserId = userId;
  activeHouseholdId = householdId;

  // 1. Household metadata listener
  const hUnsub = onSnapshot(doc(db, 'households', householdId), (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    isApplyingRemote = true;
    try {
      useStore.setState((s) => ({
        household: {
          ...s.household,
          id: householdId,
          name: data.name ?? s.household.name,
        },
        householdBudget: data.householdBudget !== undefined ? data.householdBudget : s.householdBudget,
      }));
      useSync.setState({
        householdName: data.name,
        inviteCode: data.inviteCode,
        lastSyncedAt: new Date(),
      });
    } finally {
      isApplyingRemote = false;
    }
  });
  activeUnsubscribes.push(hUnsub);

  // 2. Members listener
  const memUnsub = onSnapshot(collection(db, 'households', householdId, 'members'), (snapshot) => {
    const members = snapshot.docs.map((d) => d.data() as Member);
    if (members.length > 0) {
      isApplyingRemote = true;
      try {
        useStore.setState((s) => {
          // If currentMemberId not in list, fallback to first member
          const exists = members.some((m) => m.id === s.currentMemberId);
          return {
            members,
            currentMemberId: exists ? s.currentMemberId : members[0].id,
          };
        });
      } finally {
        isApplyingRemote = false;
      }
    }
  });
  activeUnsubscribes.push(memUnsub);

  // 3. Tasks listener
  const tasksUnsub = onSnapshot(collection(db, 'households', householdId, 'tasks'), (snapshot) => {
    const tasks = snapshot.docs.map((d) => d.data() as Task);
    isApplyingRemote = true;
    try {
      useStore.setState({ tasks });
      useSync.setState({ lastSyncedAt: new Date() });
    } finally {
      isApplyingRemote = false;
    }
  });
  activeUnsubscribes.push(tasksUnsub);

  // 4. Checklist listener
  const checkUnsub = onSnapshot(collection(db, 'households', householdId, 'checklist'), (snapshot) => {
    const checklist = snapshot.docs.map((d) => d.data() as TaskChecklistItem);
    isApplyingRemote = true;
    try {
      useStore.setState({ checklist });
    } finally {
      isApplyingRemote = false;
    }
  });
  activeUnsubscribes.push(checkUnsub);

  // 5. Shopping listener
  const shopUnsub = onSnapshot(collection(db, 'households', householdId, 'shopping'), (snapshot) => {
    const shopping = snapshot.docs.map((d) => d.data() as ShoppingItem);
    isApplyingRemote = true;
    try {
      useStore.setState({ shopping });
      useSync.setState({ lastSyncedAt: new Date() });
    } finally {
      isApplyingRemote = false;
    }
  });
  activeUnsubscribes.push(shopUnsub);

  // 6. Items listener
  const itemsUnsub = onSnapshot(collection(db, 'households', householdId, 'items'), (snapshot) => {
    const items = snapshot.docs.map((d) => d.data() as HouseholdItem);
    isApplyingRemote = true;
    try {
      useStore.setState({ items });
    } finally {
      isApplyingRemote = false;
    }
  });
  activeUnsubscribes.push(itemsUnsub);

  // 7. Purchases listener
  const purchasesUnsub = onSnapshot(collection(db, 'households', householdId, 'purchases'), (snapshot) => {
    const purchases = snapshot.docs.map((d) => d.data() as Purchase);
    isApplyingRemote = true;
    try {
      useStore.setState({ purchases });
    } finally {
      isApplyingRemote = false;
    }
  });
  activeUnsubscribes.push(purchasesUnsub);

  // 8. Money Categories listener
  const catsUnsub = onSnapshot(collection(db, 'households', householdId, 'moneyCategories'), (snapshot) => {
    const cats = snapshot.docs.map((d) => d.data() as MoneyCategory);
    if (cats.length > 0) {
      isApplyingRemote = true;
      try {
        useStore.setState({ moneyCategories: cats });
      } finally {
        isApplyingRemote = false;
      }
    }
  });
  activeUnsubscribes.push(catsUnsub);

  // 9. Shared Household Accounts listener
  const hAccUnsub = onSnapshot(collection(db, 'households', householdId, 'accounts'), (snapshot) => {
    remoteHouseholdAccounts = snapshot.docs.map((d) => ({ ...(d.data() as Account), scope: 'household' }));
    updateCombinedAccounts();
  });
  activeUnsubscribes.push(hAccUnsub);

  // 10. Shared Household Transactions listener
  const hTxUnsub = onSnapshot(collection(db, 'households', householdId, 'transactions'), (snapshot) => {
    remoteHouseholdTxs = snapshot.docs.map((d) => ({ ...(d.data() as Transaction), scope: 'household' }));
    updateCombinedTransactions();
  });
  activeUnsubscribes.push(hTxUnsub);

  // 11. User's Private Personal Accounts listener (STRICTLY PRIVATE)
  const pAccUnsub = onSnapshot(collection(db, 'users', userId, 'personalAccounts'), (snapshot) => {
    remotePersonalAccounts = snapshot.docs.map((d) => ({ ...(d.data() as Account), scope: 'personal' }));
    updateCombinedAccounts();
  });
  activeUnsubscribes.push(pAccUnsub);

  // 12. User's Private Personal Transactions listener (STRICTLY PRIVATE)
  const pTxUnsub = onSnapshot(collection(db, 'users', userId, 'personalTransactions'), (snapshot) => {
    remotePersonalTxs = snapshot.docs.map((d) => ({ ...(d.data() as Transaction), scope: 'personal' }));
    updateCombinedTransactions();
  });
  activeUnsubscribes.push(pTxUnsub);

  // 13. Listen to local Zustand store mutations and sync to Firestore
  setupStoreSyncPush(userId, householdId);
}

function updateCombinedAccounts() {
  isApplyingRemote = true;
  try {
    const combined = [...remoteHouseholdAccounts, ...remotePersonalAccounts];
    if (combined.length > 0) {
      useStore.setState({ accounts: combined });
    }
  } finally {
    isApplyingRemote = false;
  }
}

function updateCombinedTransactions() {
  isApplyingRemote = true;
  try {
    const combined = [...remoteHouseholdTxs, ...remotePersonalTxs];
    useStore.setState({ transactions: combined });
    useSync.setState({ lastSyncedAt: new Date() });
  } finally {
    isApplyingRemote = false;
  }
}

/**
 * Subscribes to local Zustand store updates and pushes changes to Firestore.
 */
function setupStoreSyncPush(userId: string, householdId: string) {
  if (storeUnsubscribe) storeUnsubscribe();

  let prev = useStore.getState();

  storeUnsubscribe = useStore.subscribe((next) => {
    if (isApplyingRemote) {
      prev = next;
      return;
    }

    // A. Tasks diff
    if (next.tasks !== prev.tasks) {
      syncArrayDiff(prev.tasks, next.tasks, {
        onSet: (t) => setDoc(doc(db, 'households', householdId, 'tasks', t.id), sanitizeForFirestore(t)),
        onDelete: (id) => deleteDoc(doc(db, 'households', householdId, 'tasks', id)),
      });
    }

    // B. Checklist diff
    if (next.checklist !== prev.checklist) {
      syncArrayDiff(prev.checklist, next.checklist, {
        onSet: (c) => setDoc(doc(db, 'households', householdId, 'checklist', c.id), sanitizeForFirestore(c)),
        onDelete: (id) => deleteDoc(doc(db, 'households', householdId, 'checklist', id)),
      });
    }

    // C. Shopping diff
    if (next.shopping !== prev.shopping) {
      syncArrayDiff(prev.shopping, next.shopping, {
        onSet: (s) => setDoc(doc(db, 'households', householdId, 'shopping', s.id), sanitizeForFirestore(s)),
        onDelete: (id) => deleteDoc(doc(db, 'households', householdId, 'shopping', id)),
      });
    }

    // D. Items diff
    if (next.items !== prev.items) {
      syncArrayDiff(prev.items, next.items, {
        onSet: (i) => setDoc(doc(db, 'households', householdId, 'items', i.id), sanitizeForFirestore(i)),
        onDelete: (id) => deleteDoc(doc(db, 'households', householdId, 'items', id)),
      });
    }

    // E. Purchases diff
    if (next.purchases !== prev.purchases) {
      syncArrayDiff(prev.purchases, next.purchases, {
        onSet: (p) => setDoc(doc(db, 'households', householdId, 'purchases', p.id), sanitizeForFirestore(p)),
        onDelete: (id) => deleteDoc(doc(db, 'households', householdId, 'purchases', id)),
      });
    }

    // F. Money Categories diff
    if (next.moneyCategories !== prev.moneyCategories) {
      syncArrayDiff(prev.moneyCategories, next.moneyCategories, {
        onSet: (c) => setDoc(doc(db, 'households', householdId, 'moneyCategories', c.id), sanitizeForFirestore(c)),
        onDelete: (id) => deleteDoc(doc(db, 'households', householdId, 'moneyCategories', id)),
      });
    }

    // G. Members diff
    if (next.members !== prev.members) {
      syncArrayDiff(prev.members, next.members, {
        onSet: (m) => setDoc(doc(db, 'households', householdId, 'members', m.id), sanitizeForFirestore(m)),
        onDelete: (id) => deleteDoc(doc(db, 'households', householdId, 'members', id)),
      });
    }

    // H. Accounts diff (Partitioned by scope)
    if (next.accounts !== prev.accounts) {
      const prevShared = prev.accounts.filter((a) => a.scope !== 'personal');
      const nextShared = next.accounts.filter((a) => a.scope !== 'personal');
      syncArrayDiff(prevShared, nextShared, {
        onSet: (a) => setDoc(doc(db, 'households', householdId, 'accounts', a.id), sanitizeForFirestore(a)),
        onDelete: (id) => deleteDoc(doc(db, 'households', householdId, 'accounts', id)),
      });

      const prevPersonal = prev.accounts.filter((a) => a.scope === 'personal');
      const nextPersonal = next.accounts.filter((a) => a.scope === 'personal');
      syncArrayDiff(prevPersonal, nextPersonal, {
        onSet: (a) => setDoc(doc(db, 'users', userId, 'personalAccounts', a.id), sanitizeForFirestore(a)),
        onDelete: (id) => deleteDoc(doc(db, 'users', userId, 'personalAccounts', id)),
      });
    }

    // I. Transactions diff (Partitioned by scope)
    if (next.transactions !== prev.transactions) {
      const prevShared = prev.transactions.filter((t) => t.scope !== 'personal');
      const nextShared = next.transactions.filter((t) => t.scope !== 'personal');
      syncArrayDiff(prevShared, nextShared, {
        onSet: (t) => setDoc(doc(db, 'households', householdId, 'transactions', t.id), sanitizeForFirestore(t)),
        onDelete: (id) => deleteDoc(doc(db, 'households', householdId, 'transactions', id)),
      });

      const prevPersonal = prev.transactions.filter((t) => t.scope === 'personal');
      const nextPersonal = next.transactions.filter((t) => t.scope === 'personal');
      syncArrayDiff(prevPersonal, nextPersonal, {
        onSet: (t) => setDoc(doc(db, 'users', userId, 'personalTransactions', t.id), sanitizeForFirestore(t)),
        onDelete: (id) => deleteDoc(doc(db, 'users', userId, 'personalTransactions', id)),
      });
    }

    // J. Household metadata diff (Name, Budget)
    if (next.household.name !== prev.household.name || next.householdBudget !== prev.householdBudget) {
      updateDoc(doc(db, 'households', householdId), sanitizeForFirestore({
        name: next.household.name,
        householdBudget: next.householdBudget ?? null,
      })).catch(console.error);
    }

    prev = next;
  });
}

function syncArrayDiff<T extends { id: string }>(
  prevList: T[],
  nextList: T[],
  callbacks: { onSet: (item: T) => Promise<any>; onDelete: (id: string) => Promise<any> },
) {
  const prevMap = new Map(prevList.map((x) => [x.id, x]));
  const nextMap = new Map(nextList.map((x) => [x.id, x]));

  // Added or updated
  for (const item of nextList) {
    const prevItem = prevMap.get(item.id);
    if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
      callbacks.onSet(item).catch((err) => console.error(`Error saving item ${item.id}:`, err));
    }
  }

  // Deleted
  for (const item of prevList) {
    if (!nextMap.has(item.id)) {
      callbacks.onDelete(item.id).catch((err) => console.error(`Error deleting item ${item.id}:`, err));
    }
  }
}

// =============================================================================
// Auth State Initializer Hook
// =============================================================================

export function initSyncAuth() {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      stopSyncListeners();
      useSync.setState({
        user: null,
        householdId: null,
        inviteCode: null,
        householdName: null,
        status: 'unauthenticated',
        error: null,
      });
      return;
    }

    useSync.setState({ user, status: 'loading' });

    try {
      // Check user document in Firestore
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const uData = userSnap.data();
        const hid = uData.householdId;
        if (hid) {
          // Fetch household info
          const hSnap = await getDoc(doc(db, 'households', hid));
          if (hSnap.exists()) {
            const hData = hSnap.data();
            useSync.setState({
              householdId: hid,
              householdName: hData.name,
              inviteCode: hData.inviteCode,
              status: 'synced',
              lastSyncedAt: new Date(),
            });
            startSyncListeners(user.uid, hid);
            return;
          }
        }
      }

      // Signed in, but no household connected yet
      useSync.setState({
        status: 'ready',
        householdId: null,
        householdName: null,
        inviteCode: null,
      });
    } catch (err: any) {
      console.error('Failed to init user sync profile:', err);
      useSync.setState({ status: 'error', error: err.message });
    }
  });
}
