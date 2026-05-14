import { docs, getDocBySlug } from "@/app/docs/content";


const PageSections = ({ activeSlug }: { activeSlug: string }) => {
  const activeDoc = getDocBySlug(activeSlug) || null;
      return activeDoc.sections.length > 0 ? (
        <ul
          className="docs-page-sections"
          aria-label={`${activeDoc.label} sections`}>
            <h4>In this page</h4>
                      {activeDoc.sections.map((section) => (
                        <li key={section.anchor} className="page-section-item margin--small">
                          <a
                            className="docs-subnav-link"
                            href={`/docs/${activeDoc.slug}#${section.anchor}`}
                          >
                            {section.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null
}

export default PageSections;