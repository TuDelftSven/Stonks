import { ArrowRight, ChartNoAxesCombined, LockKeyhole, Upload } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <div className="login-grid">
        <section className="login-brand" aria-labelledby="login-title">
          <div className="brand-mark" aria-hidden="true">
            <ChartNoAxesCombined size={22} strokeWidth={2.2} />
          </div>
          <p className="eyebrow">Personal portfolio analytics</p>
          <h1 id="login-title">Your DEGIRO portfolio, kept separate.</h1>
          <p className="login-intro">
            Upload DEGIRO exports and review performance, holdings, dividends,
            costs, MWRR, and stock-level CAGR in one private workspace.
          </p>
          <div className="trust-row">
            <span><LockKeyhole size={16} /> Private per account</span>
            <span><Upload size={16} /> Import replaces only your files</span>
          </div>
        </section>

        <section className="login-card" aria-label="Sign in">
          <div>
            <p className="eyebrow">Account access</p>
            <h2>Sign in to continue</h2>
            <p>
              Cloudflare Access verifies the email address. Portfolio data is
              then loaded only for that account.
            </p>
          </div>
          <a className="primary-button login-button" href="/dashboard">
            Continue with email <ArrowRight size={17} />
          </a>
          <p className="privacy-note">
            No DEGIRO username or password is requested. Only exported CSV files
            are processed.
          </p>
        </section>
      </div>
    </main>
  );
}
