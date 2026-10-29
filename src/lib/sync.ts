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
  writeBatch,
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
import {
  notifyPartnerAssignedTask,
  notifyPartnerCompletedTask,
  notifyPartnerUpdatedShopping,
} from './notificationScheduler';

export interface MyWalletBackupMeta {
  backedUpAt: string;
  transactionsCount: number;
  accountsCount: number;
}

export interface SyncState {
  user: User | null;
  householdId: string | null;
  inviteCode: string | null;
  householdName: string | null;
  status: 'unauthenticated' | 'loading' | 'ready' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: Date | null;
  error: string | null;
  myWalletBackupMeta: MyWalletBackupMeta | null;
  isBackingUp: boolean;
  isRestoring: boolean;
}

export interface SyncActions {
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string, isSignUp: boolean, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  createCloudHousehold: (name?: string) => Promise<string>;
  joinCloudHousehold: (code: string) => Promise<void>;
  clearError: () => void;
  backupMyWalletToCloud: () => Promise<MyWalletBackupMeta>;
  restoreMyWalletFromCloud: () => Promise<{ transactionsCount: number; accountsCount: number }>;
  fetchMyWalletBackupMeta: () => Promise<MyWalletBackupMeta | null>;
}

export const useSync = create<SyncState & SyncActions>((set, get) => ({
  user: null,
  householdId: null,
  inviteCode: null,
  householdName: null,
  status: 'loading',
  lastSyncedAt: null,
  error: null,
  myWalletBackupMeta: null,
  isBackingUp: false,
  isRestoring: false,

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
        myWalletBackupMeta: null,
        isBackingUp: false,
        isRestoring: false,
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

      // 1b. Create secure invite lookup doc (allows direct getDoc lookup without scanning households)
      await setDoc(doc(db, 'invites', code), {
        code,
        householdId: hid,
        householdName: hName,
        createdAt: new Date().toISOString(),
        createdByUid: user.uid,
      });

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

      // 3. Upload user profile (personal wallet stays strictly local on device)
      await setDoc(doc(db, 'users', user.uid), sanitizeForFirestore({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || 'User',
        householdId: hid,
        updatedAt: new Date().toISOString(),
      }));

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
      // Direct invite document lookup (O(1), private, avoids collection listing)
      const inviteSnap = await getDoc(doc(db, 'invites', code));
      let hid: string;
      let hName = 'Shared Household';

      if (inviteSnap.exists()) {
        const invData = inviteSnap.data() as any;
        hid = invData.householdId;
        hName = invData.householdName || 'Shared Household';
      } else {
        // Fallback for legacy households created prior to invites collection
        const q = query(collection(db, 'households'), where('inviteCode', '==', code));
        const snap = await getDocs(q);
        if (snap.empty) {
          throw new Error('No household found with code ' + code);
        }
        const hDoc = snap.docs[0];
        hid = hDoc.id;
        hName = (hDoc.data() as any).name || 'Shared Household';
      }

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
        householdName: hName,
        inviteCode: code,
        status: 'synced',
        lastSyncedAt: new Date(),
      });

      // Start listening and download shared data into Zustand store
      startSyncListeners(user.uid, hid);

      toast({ title: `Joined ${hName}!`, subtitle: 'Syncing shared tasks and wallet...' });
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

  backupMyWalletToCloud: async () => {
    const user = auth.currentUser || get().user;
    if (!user) {
      toast({ title: 'Sign-in required', subtitle: 'Please sign in to backup your personal wallet to Cloud.', tone: 'error' });
      throw new Error('User not signed in');
    }

    set({ isBackingUp: true });
    try {
      const state = useStore.getState();
      const personalTxs = state.transactions.filter((t) => t.scope === 'personal');
      const personalAccs = state.accounts.filter((a) => a.scope === 'personal');
      const personalBudget = state.personalBudget ?? null;

      const backedUpAt = new Date().toISOString();
      const meta: MyWalletBackupMeta = {
        backedUpAt,
        transactionsCount: personalTxs.length,
        accountsCount: personalAccs.length,
      };

      const backupDocData = {
        meta,
        personalBudget,
        accounts: sanitizeForFirestore(personalAccs),
        transactions: sanitizeForFirestore(personalTxs),
        updatedAt: backedUpAt,
      };

      // 1. Write snapshot document under user's private subcollection
      await setDoc(doc(db, 'users', user.uid, 'personalBackup', 'snapshot'), backupDocData);

      // 2. Also record backup meta in user profile for quick reference
      await setDoc(doc(db, 'users', user.uid), { myWalletBackupMeta: meta }, { merge: true });

      set({ myWalletBackupMeta: meta });
      toast({
        title: 'My Wallet backed up to Cloud!',
        subtitle: `Saved ${meta.transactionsCount} transactions and ${meta.accountsCount} accounts.`,
        tone: 'success',
      });
      return meta;
    } catch (err: any) {
      console.error('Failed to backup My Wallet to Cloud:', err);
      const msg = err.message || 'Failed to backup My Wallet';
      toast({ title: 'Backup failed', subtitle: msg, tone: 'error' });
      throw err;
    } finally {
      set({ isBackingUp: false });
    }
  },

  restoreMyWalletFromCloud: async () => {
    const user = auth.currentUser || get().user;
    if (!user) {
      toast({ title: 'Sign-in required', subtitle: 'Please sign in to restore your personal wallet.', tone: 'error' });
      throw new Error('User not signed in');
    }

    set({ isRestoring: true });
    try {
      const snap = await getDoc(doc(db, 'users', user.uid, 'personalBackup', 'snapshot'));
      if (!snap.exists()) {
        toast({
          title: 'No backup found on Cloud',
          subtitle: 'There is no previous backup of My Wallet for this account.',
          tone: 'error',
        });
        throw new Error('No backup found');
      }

      const data = snap.data();
      const rawAccounts: Account[] = Array.isArray(data?.accounts) ? data.accounts : [];
      const rawTxs: Transaction[] = Array.isArray(data?.transactions) ? data.transactions : [];
      const remoteBudget = data?.personalBudget ?? null;

      const state = useStore.getState();

      // Merge personal accounts: keep household accounts, merge personal by ID
      const householdAccounts = state.accounts.filter((a) => a.scope !== 'personal');
      const localPersonalAccounts = state.accounts.filter((a) => a.scope === 'personal');
      const accMap = new Map<string, Account>();
      for (const a of localPersonalAccounts) accMap.set(a.id, a);
      for (const a of rawAccounts) {
        if (a && a.id) accMap.set(a.id, { ...a, scope: 'personal' });
      }
      const mergedAccounts = [...householdAccounts, ...Array.from(accMap.values())];

      // Merge personal transactions: keep household transactions, merge personal by ID
      const householdTxs = state.transactions.filter((t) => t.scope !== 'personal');
      const localPersonalTxs = state.transactions.filter((t) => t.scope === 'personal');
      const txMap = new Map<string, Transaction>();
      for (const t of localPersonalTxs) txMap.set(t.id, t);
      for (const t of rawTxs) {
        if (t && t.id) txMap.set(t.id, { ...t, scope: 'personal' });
      }
      const mergedTxs = [...householdTxs, ...Array.from(txMap.values())];

      useStore.setState({
        accounts: mergedAccounts,
        transactions: mergedTxs,
        personalBudget: remoteBudget !== undefined && remoteBudget !== null ? remoteBudget : state.personalBudget,
      });

      const meta: MyWalletBackupMeta | null = data?.meta ?? null;
      if (meta) {
        set({ myWalletBackupMeta: meta });
      }

      toast({
        title: 'My Wallet restored from Cloud!',
        subtitle: `Restored ${rawTxs.length} transactions and ${rawAccounts.length} accounts.`,
        tone: 'success',
      });

      return { transactionsCount: rawTxs.length, accountsCount: rawAccounts.length };
    } catch (err: any) {
      console.error('Failed to restore My Wallet from Cloud:', err);
      const msg = err.message || 'Failed to restore My Wallet';
      toast({ title: 'Restore failed', subtitle: msg, tone: 'error' });
      throw err;
    } finally {
      set({ isRestoring: false });
    }
  },

  fetchMyWalletBackupMeta: async () => {
    const user = auth.currentUser || get().user;
    if (!user) return null;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid, 'personalBackup', 'snapshot'));
      if (snap.exists()) {
        const meta = snap.data()?.meta as MyWalletBackupMeta | undefined;
        if (meta) {
          set({ myWalletBackupMeta: meta });
          return meta;
        }
      }
      set({ myWalletBackupMeta: null });
      return null;
    } catch (e) {
      console.warn('Could not fetch My Wallet backup meta:', e);
      return null;
    }
  },
}));

// =============================================================================
// Helper Utilities
// =============================================================================

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let res = 'NM-';
  for (let i = 0; i < 6; i++) {
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
  const validItems = items.filter((item) => item && item.id);
  if (validItems.length === 0) return;

  const CHUNK_SIZE = 450;
  for (let i = 0; i < validItems.length; i += CHUNK_SIZE) {
    const chunk = validItems.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const item of chunk) {
      batch.set(doc(db, parentCol, parentId, subCol, item.id), sanitizeForFirestore(item));
    }
    await batch.commit();
  }
}

// =============================================================================
// Real-time Firestore Listeners & Bi-directional Sync
// =============================================================================

let activeUnsubscribes: Unsubscribe[] = [];
let isApplyingRemote = false;
let isBulkImporting = false;
let storeUnsubscribe: (() => void) | null = null;
let activeUserId: string | null = null;
let activeHouseholdId: string | null = null;

export function setBulkImporting(val: boolean) {
  isBulkImporting = val;
}

export function getIsBulkImporting() {
  return isBulkImporting;
}

// Keep track of partitioned shared household slices from Firestore
let remoteHouseholdAccounts: Account[] = [];
let remoteHouseholdTxs: Transaction[] = [];

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
      if (data.inviteCode) {
        setDoc(doc(db, 'invites', data.inviteCode), {
          code: data.inviteCode,
          householdId,
          householdName: data.name || 'Our Home',
          createdAt: data.createdAt || new Date().toISOString(),
          createdByUid: userId,
        }, { merge: true }).catch(() => {});
      }
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
  let isInitialTasksSnapshot = true;
  const tasksUnsub = onSnapshot(collection(db, 'households', householdId, 'tasks'), (snapshot) => {
    const tasks = snapshot.docs.map((d) => d.data() as Task);
    if (isInitialTasksSnapshot) {
      isInitialTasksSnapshot = false;
    } else {
      const currentMemberId = useStore.getState().currentMemberId;
      const members = useStore.getState().members;
      for (const change of snapshot.docChanges()) {
        const task = change.doc.data() as Task;
        if (change.type === 'added' && task.assigneeId === currentMemberId) {
          const partner = members.find((m) => m.id !== currentMemberId);
          notifyPartnerAssignedTask(task, partner?.name || 'Your partner').catch(() => {});
        } else if (change.type === 'modified' && task.completed) {
          const partner = members.find((m) => m.id !== currentMemberId);
          notifyPartnerCompletedTask(task, partner?.name || 'Your partner').catch(() => {});
        }
      }
    }
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
  let isInitialShopSnapshot = true;
  const shopUnsub = onSnapshot(collection(db, 'households', householdId, 'shopping'), (snapshot) => {
    const shopping = snapshot.docs.map((d) => d.data() as ShoppingItem);
    if (isInitialShopSnapshot) {
      isInitialShopSnapshot = false;
    } else {
      const addedItems: ShoppingItem[] = [];
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added') {
          addedItems.push(change.doc.data() as ShoppingItem);
        }
      }
      if (addedItems.length > 0) {
        const currentMemberId = useStore.getState().currentMemberId;
        const members = useStore.getState().members;
        const partner = members.find((m) => m.id !== currentMemberId);
        notifyPartnerUpdatedShopping(addedItems, partner?.name || 'Your partner').catch(() => {});
      }
    }
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

  // Listen to local Zustand store mutations and sync shared household data to Firestore
  setupStoreSyncPush(userId, householdId);
}

function updateCombinedAccounts() {
  if (isBulkImporting) return;
  isApplyingRemote = true;
  try {
    // Preserve local personal accounts strictly on this device
    const localPersonal = useStore.getState().accounts.filter((a) => a.scope === 'personal');
    const combined = [...remoteHouseholdAccounts, ...localPersonal];
    if (combined.length > 0) {
      useStore.setState({ accounts: combined });
    }
  } finally {
    isApplyingRemote = false;
  }
}

function updateCombinedTransactions() {
  if (isBulkImporting) return;
  isApplyingRemote = true;
  try {
    // Preserve local personal transactions strictly on this device
    const localPersonal = useStore.getState().transactions.filter((t) => t.scope === 'personal');
    const combined = [...remoteHouseholdTxs, ...localPersonal];
    useStore.setState({ transactions: combined });
    useSync.setState({ lastSyncedAt: new Date() });
  } finally {
    isApplyingRemote = false;
  }
}

/**
 * Subscribes to local Zustand store updates and pushes changes to Firestore.
 */
function setupStoreSyncPush(_userId: string, householdId: string) {
  if (storeUnsubscribe) storeUnsubscribe();

  let prev = useStore.getState();

  storeUnsubscribe = useStore.subscribe((next) => {
    if (isApplyingRemote || isBulkImporting) {
      prev = next;
      return;
    }

    // A. Tasks diff
    if (next.tasks !== prev.tasks) {
      syncBatchDiff(prev.tasks, next.tasks, (id) => doc(db, 'households', householdId, 'tasks', id));
    }

    // B. Checklist diff
    if (next.checklist !== prev.checklist) {
      syncBatchDiff(prev.checklist, next.checklist, (id) => doc(db, 'households', householdId, 'checklist', id));
    }

    // C. Shopping diff
    if (next.shopping !== prev.shopping) {
      syncBatchDiff(prev.shopping, next.shopping, (id) => doc(db, 'households', householdId, 'shopping', id));
    }

    // D. Items diff
    if (next.items !== prev.items) {
      syncBatchDiff(prev.items, next.items, (id) => doc(db, 'households', householdId, 'items', id));
    }

    // E. Purchases diff
    if (next.purchases !== prev.purchases) {
      syncBatchDiff(prev.purchases, next.purchases, (id) => doc(db, 'households', householdId, 'purchases', id));
    }

    // F. Money Categories diff
    if (next.moneyCategories !== prev.moneyCategories) {
      syncBatchDiff(prev.moneyCategories, next.moneyCategories, (id) => doc(db, 'households', householdId, 'moneyCategories', id));
    }

    // G. Members diff
    if (next.members !== prev.members) {
      syncBatchDiff(prev.members, next.members, (id) => doc(db, 'households', householdId, 'members', id));
    }

    // H. Accounts diff (Only shared household accounts sync to Cloud)
    if (next.accounts !== prev.accounts) {
      const prevShared = prev.accounts.filter((a) => a.scope !== 'personal');
      const nextShared = next.accounts.filter((a) => a.scope !== 'personal');
      syncBatchDiff(prevShared, nextShared, (id) => doc(db, 'households', householdId, 'accounts', id));
    }

    // I. Transactions diff (Only shared household transactions sync to Cloud)
    if (next.transactions !== prev.transactions) {
      const prevShared = prev.transactions.filter((t) => t.scope !== 'personal');
      const nextShared = next.transactions.filter((t) => t.scope !== 'personal');
      syncBatchDiff(prevShared, nextShared, (id) => doc(db, 'households', householdId, 'transactions', id));
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

function syncBatchDiff<T extends { id: string }>(
  prevList: T[],
  nextList: T[],
  getDocRef: (id: string) => any,
) {
  const prevMap = new Map(prevList.map((x) => [x.id, x]));
  const nextMap = new Map(nextList.map((x) => [x.id, x]));

  const toSet: T[] = [];
  for (const item of nextList) {
    const prevItem = prevMap.get(item.id);
    if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
      toSet.push(item);
    }
  }

  const toDelete: string[] = [];
  for (const item of prevList) {
    if (!nextMap.has(item.id)) {
      toDelete.push(item.id);
    }
  }

  if (toSet.length === 0 && toDelete.length === 0) return;

  // Single or small operation: run directly
  if (toSet.length + toDelete.length <= 3) {
    for (const item of toSet) {
      setDoc(getDocRef(item.id), sanitizeForFirestore(item)).catch((err) => console.error(`Error saving item ${item.id}:`, err));
    }
    for (const id of toDelete) {
      deleteDoc(getDocRef(id)).catch((err) => console.error(`Error deleting item ${id}:`, err));
    }
    return;
  }

  // Large or bulk mutations: batch in chunks of 450 items
  const ops: Array<{ type: 'set'; item: T } | { type: 'delete'; id: string }> = [
    ...toSet.map((item) => ({ type: 'set' as const, item })),
    ...toDelete.map((id) => ({ type: 'delete' as const, id })),
  ];

  const CHUNK_SIZE = 450;
  (async () => {
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const op of chunk) {
        if (op.type === 'set') {
          batch.set(getDocRef(op.item.id), sanitizeForFirestore(op.item));
        } else {
          batch.delete(getDocRef(op.id));
        }
      }
      await batch.commit().catch((err) => console.error('Batch sync error:', err));
    }
  })();
}

export function syncArrayDiff<T extends { id: string }>(
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

export interface BulkSyncImportParams {
  userId: string;
  householdId: string;
  importPreview: {
    ourWalletTxs: Transaction[];
    myWalletTxs: Transaction[];
    newAccounts?: Account[];
    updatedAccounts?: Array<Partial<Account> & { id: string }>;
    newCategories?: MoneyCategory[];
    tasks: Task[];
    inventoryItems?: HouseholdItem[];
  };
  cleanPersonalScope?: boolean;
}

/**
 * Pushes bulk-imported workbook entities to Firestore efficiently via batched writes
 * without causing reactive snapshot feedback loops.
 */
export async function bulkSyncImportToCloud(params: BulkSyncImportParams): Promise<void> {
  const { householdId, importPreview } = params;
  const state = useStore.getState();

  try {
    // 1. Sync shared accounts if any new or updated (personal accounts stay strictly on device)
    const sharedAccounts = state.accounts.filter((a) => a.scope !== 'personal');
    const hasSharedNew = Boolean(importPreview.newAccounts && importPreview.newAccounts.some((a) => a.scope !== 'personal'));
    const hasSharedUpdated = Boolean(importPreview.updatedAccounts && importPreview.updatedAccounts.some((a) => a.scope !== 'personal'));
    if (hasSharedNew || hasSharedUpdated) {
      await uploadCollection('households', householdId, 'accounts', sharedAccounts);
      remoteHouseholdAccounts = sharedAccounts;
    }

    // 2. Sync categories if any new
    if (importPreview.newCategories && importPreview.newCategories.length > 0) {
      await uploadCollection('households', householdId, 'moneyCategories', state.moneyCategories);
    }

    // 3. Sync tasks if any
    if (importPreview.tasks && importPreview.tasks.length > 0) {
      const newTasksOnly = state.tasks.slice(state.tasks.length - importPreview.tasks.length);
      await uploadCollection('households', householdId, 'tasks', newTasksOnly);
    }

    // 4. Sync shared transactions ONLY (personal transactions stay strictly on this device)
    if (importPreview.ourWalletTxs.length > 0) {
      const sharedTxs = state.transactions.filter((t) => t.scope !== 'personal');
      await uploadCollection('households', householdId, 'transactions', sharedTxs);
      remoteHouseholdTxs = sharedTxs;
    }

    // 5. Sync inventory items if any
    if (importPreview.inventoryItems && importPreview.inventoryItems.length > 0) {
      await uploadCollection('households', householdId, 'items', state.items);
    }

    useSync.setState({ lastSyncedAt: new Date() });
  } catch (err) {
    console.error('[bulkSyncImportToCloud] Error during cloud sync push:', err);
    throw err;
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
        if (uData.myWalletBackupMeta) {
          useSync.setState({ myWalletBackupMeta: uData.myWalletBackupMeta });
        } else {
          useSync.getState().fetchMyWalletBackupMeta().catch(() => {});
        }

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
      } else {
        useSync.getState().fetchMyWalletBackupMeta().catch(() => {});
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
