import { FamiliarName } from "@/app/components/familiar-name";
const Footer = () => {
    return (
        <footer className="footer margin-top--xl border-top padding-top--xl">
        
        <div className="flex--row flex--space-between width-100">
            <div>
                <FamiliarName height={24} width={75}/>
                <p className="footer-copy">
                    Your scripts, with a conversation layer.
                </p>
            </div>

            <div className="flex--row flex--gap-s">
                <a href="/contact">Contact</a>
                <a href="/docs">Docs</a>
                <a href="/setup">Setup</a>
            </div>

        </div>
        
        <div>© 2026 familiar</div>
        
        
      </footer>
    )
}

export default Footer;