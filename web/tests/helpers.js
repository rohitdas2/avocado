export function memoryStore() {
  const accounts = new Map();
  const sessions = new Map();
  const foods = [];
  const lifts = [];
  const visible = ({ accountId, ...entry }) => entry;
  const remove = (rows, id, accountId) => {
    const index = rows.findIndex(row => row.id === id && row.accountId === accountId);
    if (index < 0) return false;
    rows.splice(index, 1);
    return true;
  };
  return {
    accounts, sessions, foods, lifts,
    async health() {},
    async createAccount(account) {
      if (account.email && [...accounts.values()].some(a => a.email === account.email)) return null;
      const row = { isGuest: false, ...account };
      accounts.set(row.id, row);
      return { ...row };
    },
    async upgradeGuest(id, details) {
      const account = accounts.get(id);
      if (!account?.isGuest || [...accounts.values()].some(a => a.email === details.email)) return null;
      Object.assign(account, details, { isGuest: false });
      for (const [digest, session] of sessions) if (session.accountId === id) sessions.delete(digest);
      return { ...account };
    },
    async accountByEmail(email) { const account = [...accounts.values()].find(a => a.email === email); return account && { ...account }; },
    async accountById(id) { const account = accounts.get(id); return account && { ...account }; },
    async updateAccount(id, name) { const account = accounts.get(id); if (!account) return; account.name = name; return { ...account }; },
    async createSession(session) { sessions.set(session.tokenDigest, { ...session }); },
    async sessionAccount(digest) {
      const session = sessions.get(digest);
      if (!session || session.expiresAt <= new Date()) return;
      const account = accounts.get(session.accountId);
      return account && { ...account };
    },
    async removeSession(digest) { sessions.delete(digest); },
    async changePassword(id, previousPassword, password, currentSession) {
      const account = accounts.get(id);
      if (!account || account.password !== previousPassword) return false;
      account.password = password.password;
      for (const [digest, session] of sessions) if (session.accountId === id && digest !== currentSession) sessions.delete(digest);
      return true;
    },
    async list(date, accountId) { return foods.filter(row => row.date === date && row.accountId === accountId).map(visible); },
    async add(entry, accountId) { foods.push({ ...entry, accountId }); return entry; },
    async remove(id, accountId) { return remove(foods, id, accountId); },
    async listLifts(date, accountId) { return lifts.filter(row => row.date === date && row.accountId === accountId).map(visible); },
    async addLift(entry, accountId) { lifts.push({ ...entry, accountId }); return entry; },
    async removeLift(id, accountId) { return remove(lifts, id, accountId); }
  };
}
