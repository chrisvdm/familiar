import { FamiliarName } from "@/app/components/familiar-name";


const Hero = () => {
    return (
        <header className="hero" id="hero">
        <div className="hero-panel">
          <div className="hero-copy">
            <h1 className="hero-title"><FamiliarName/></h1>
            <p className="hero-subtitle">
              Your scripts, but you can text them.
            </p>
            <p className="hero-detail">
              You have tools that do things — backups, imports, checks, jobs.
              But you have to be at your computer to run them, and they never
              remember what happened last time.
            </p>
            <p className="hero-detail">
              familiar adds three things:{" "}
              <strong>reach</strong> (from any channel),{" "}
              <strong>memory</strong> (context across sessions), and{" "}
              <strong>routing</strong> (the right tool gets the right
              arguments, automatically).
            </p>
          </div>
        </div>
      </header>
    )
}

export default Hero