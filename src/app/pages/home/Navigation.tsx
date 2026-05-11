import { FamiliarName } from "@/app/components/familiar-name";


const Navigation = () => (
    <nav className="public-nav width--100 flex--row flex--space-between" aria-label="Primary">
        <a className="landing-nav-brand" href="/" aria-label="familiar home">
          <FamiliarName className="landing-nav-logo" />
          <h1 hidden>familiar</h1>
        </a>
        <div className="flex--row flex--gap-s">
          <a className="landing-nav-link" href="#what-it-fixes">
            About
          </a>
          <a className="landing-nav-link" href="/docs/">
            Docs
          </a>
          <a className="landing-nav-link" href="/setup">
            Setup
          </a>
        </div>
      </nav>
)

export default Navigation