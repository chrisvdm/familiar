import { AuthCliClient } from "./auth-cli.client";
import Navigation from "./home/Navigation";
import Footer from "./home/Footer";

export const AuthCli = () => (
  <>
    <Navigation />
    <main className="page">
      <div className="page__shell">
        <AuthCliClient />
      </div>
    </main>
    <Footer />
  </>
);
