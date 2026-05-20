import { FamiliarName } from "@/app/components/familiar-name";
import Code from "@/app/components/Code/Code"


const Hero = () => {
    return (
        <header className="hero page__shell padding--large" id="hero">
        <div className="hero-panel">
          <div className="hero-copy flex--row flex--space-between">
            <div className="width--6">
            <h3>
              Your scripts, but you can text them.
            </h3>
            <p className="hero-detail">
              You have tools that do things — backups, imports, checks, jobs.
              But you have to be at your computer to run them, and they never
              remember what happened last time.
            </p>
            <p className="hero-detail">
              familiar gives your scripts three things they don't have:{" "}
              <strong>reach</strong> (from any channel),{" "}
              <strong>memory</strong> (context across sessions), and{" "}
              <strong>routing</strong> (the right tool gets the right
              arguments, automatically).
            </p>

            <div className="margin-top--xl mobile--hidden">
                <span className="section-kicker">Get started</span>
                <Code>{`npx familiar-cli init`}</Code>
                <span>Or via API:</span>
                <Code>{`curl -X POST https://familiar.monster/api/v1/accounts`}</Code>
            </div>
            </div>
            
            <img className="hero__img" src="/img01.svg" alt="drawing of a person texting their tools"/>
            
            
          </div>
        <div className="margin-top--xl mobile--only">
                <span className="section-kicker">Get started</span>
                <Code>{`npx familiar-cli init`}</Code>
                <span>Or via API:</span>
                <Code>{`curl -X POST https://familiar.monster/api/v1/accounts`}</Code>
            </div>
        </div>
      </header>
    )
}

export default Hero