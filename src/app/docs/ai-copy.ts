import { docs } from "./content";

const normalizeMarkdown = (content: string) =>
  content.replace(/\r\n/g, "\n").trim();

export const docsAiCopy = [
  "# familiar docs bundle for AI use",
  "",
  "This file contains the full current familiar documentation set from /docs in one Markdown payload.",
  "",
  ...docs.flatMap((doc) => [
    `---`,
    "",
    `# ${doc.label}`,
    "",
    `Source: /docs/${doc.slug}`,
    "",
    normalizeMarkdown(doc.content),
    "",
  ]),
].join("\n");
