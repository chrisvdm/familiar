import { createE2EClient } from "./harness.ts";

type SharedAccount = {
  token: string;
  accountId: string;
  integrationId: string;
};

let cachedAccount: SharedAccount | null = null;
let pendingAccount: Promise<SharedAccount> | null = null;

export const getSharedAccount = async (): Promise<SharedAccount> => {
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

export const resetSharedAccount = () => {
  cachedAccount = null;
  pendingAccount = null;
};
