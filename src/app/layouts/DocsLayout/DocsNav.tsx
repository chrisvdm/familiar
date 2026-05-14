import { docs, getDocBySlug } from "@/app/docs/content";

const DocsNav = ({activeSlug}: {activeSlug:string}) => {
      const activeDoc = getDocBySlug(activeSlug);
      const cookbookIndex = docs.find((entry) => entry.slug === "cookbook") ?? null;
      const cookbookRecipes = docs.filter(
        (entry) => entry.slug.startsWith("cookbook-") && entry.slug !== "cookbook",
      );
      const topLevelDocs = docs.filter(
        (entry) => !entry.slug.startsWith("cookbook-") || entry.slug === "cookbook",
      );
      const isCookbookGroupActive =
        activeDoc?.slug === "cookbook" || activeDoc?.slug.startsWith("cookbook-");
      
    const showCookbookSections =
        cookbookIndex !== null &&
        isCookbookGroupActive &&
        cookbookIndex.sections.length > 0;
    return (

          <nav aria-label="Documentation">
            <ol className="docs-nav">
              {topLevelDocs.map((entry) => (
                <li key={entry.slug} className="docs-nav-item">
                  <a
                    className={
                      entry.slug === activeDoc?.slug ||
                      (entry.slug === "cookbook" && isCookbookGroupActive)
                        ? "docs-nav-link docs-nav-link-active"
                        : "docs-nav-link"
                    }
                    href={`/docs/${entry.slug}`}
                  >
                    {entry.label}
                  </a>
                  {entry.slug === cookbookIndex?.slug ? (
                    <>
                      {showCookbookSections ? (
                        <ul
                          className="docs-page-sections"
                          aria-label={`${entry.label} sections`}
                        >
                          {cookbookIndex.sections.map((section) => (
                            <li key={section.anchor} className="docs-subnav-item">
                              <a
                                className="docs-subnav-link"
                                href={`/docs/${cookbookIndex.slug}#${section.anchor}`}
                              >
                                {section.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {cookbookRecipes.length > 0 ? (
                        <ul className="docs-child-nav" aria-label="Cookbook recipes">
                          {cookbookRecipes.map((recipe) => (
                            <li key={recipe.slug} className="docs-subnav-item">
                              <a
                                className={
                                  recipe.slug === activeDoc?.slug
                                    ? "docs-subnav-link docs-subnav-link-active"
                                    : "docs-subnav-link"
                                }
                                href={`/docs/${recipe.slug}`}
                              >
                                {recipe.label}
                              </a>
                              {recipe.slug === activeDoc?.slug &&
                              recipe.sections.length > 0 ? (
                                <ul
                                  className="docs-child-sections"
                                  aria-label={`${recipe.label} sections`}
                                >
                                  {recipe.sections.map((section) => (
                                    <li
                                      key={section.anchor}
                                      className="docs-subnav-item"
                                    >
                                      <a
                                        className="docs-subnav-link"
                                        href={`/docs/${recipe.slug}#${section.anchor}`}
                                      >
                                        {section.title}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                </li>
              ))}
            </ol>
          </nav>
    )
}

export default DocsNav