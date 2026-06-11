import { createE2EClient } from "./harness.ts";

let cachedAccount: {
  token: string;
  accountId: string;
  integrationId: string;
} | null = null;
let pendingAccount: Promise<typeof cachedAccount> | null = null;

export const getSharedAccount = async () => {
  if (cachedAccount) {
    return cachedAccount;
  }
  if (pendingAccount) {
    return pendingAccount;
  }
  const client = createE2EClient();
  pendingAccount = client.createAccount().then((account) => {
    cachedAccount = account;
    pendingAccount = null;
    return account;
  });
  return pendingAccount;
};
