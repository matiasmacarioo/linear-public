import fs from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

const apiKey = process.env.LINEAR_API_KEY;
const issueIdentifier = process.argv[2] || process.env.ISSUE_ID;

if (!apiKey) {
  console.error("Missing LINEAR_API_KEY environment variable.");
  process.exit(1);
}

if (!issueIdentifier) {
  console.error("Usage: node scripts/sync-linear-issue.mjs <ISSUE-ID>");
  process.exit(1);
}

const query = `
  query Issue($id: String!) {
    issue(id: $id) {
      identifier
      title
      description
      url
      priorityLabel
      state { name }
      team { name }
      project { name }
      labels { nodes { name } }
    }
  }
`;

const response = await fetch("https://api.linear.app/graphql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: apiKey,
    "public-file-urls-expire-in": "60"
  },
  body: JSON.stringify({ query, variables: { id: issueIdentifier } })
});

const payload = await response.json();

if (!response.ok || payload.errors) {
  console.error("Linear API error:", JSON.stringify(payload, null, 2));
  process.exit(1);
}

const issue = payload.data?.issue;
if (!issue) {
  console.error(`Issue ${issueIdentifier} not found.`);
  process.exit(1);
}

let description = issue.description || "";

// Linear API may return <linear-image> JSON blocks or standard Markdown images.
description = description.replace(/<linear-image>(\{[\s\S]*?\})<\/linear-image>/g, (match, json) => {
  try {
    const data = JSON.parse(json);
    const attrs = data.attrs || data;
    return `![${attrs.title || "image"}](${attrs.src})`;
  } catch {
    return "";
  }
});
description = description.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, (match, src) => `![image](${src})`);

const imageRegex = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
const images = [...description.matchAll(imageRegex)].map((match, index) => ({
  index: index + 1,
  alt: match[1] || `image-${index + 1}`,
  src: match[2]
}));

const assetsDir = path.join("assets", issue.identifier);
await fs.rm(assetsDir, { recursive: true, force: true });
await fs.mkdir(assetsDir, { recursive: true });

const downloaded = [];
for (const image of images) {
  const imageResponse = await fetch(image.src, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!imageResponse.ok) {
    console.error(`Could not download image ${image.index}: ${imageResponse.status}`);
    continue;
  }

  const contentType = imageResponse.headers.get("content-type") || "image/png";
  const extension = contentType.includes("jpeg")
    ? "jpg"
    : contentType.includes("gif")
      ? "gif"
      : contentType.includes("webp")
        ? "webp"
        : "png";

  const filename = `image-${image.index}.${extension}`;
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  await fs.writeFile(path.join(assetsDir, filename), buffer);
  downloaded.push({ index: image.index, filename });
}

let markdown = description;
let markdownImageIndex = 0;
markdown = markdown.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, () => {
  markdownImageIndex += 1;
  return `\n\n@@IMAGE_${markdownImageIndex}@@\n\n`;
});

let bodyHtml = await marked.parse(markdown);
for (const image of downloaded) {
  bodyHtml = bodyHtml.replace(
    `@@IMAGE_${image.index}@@`,
    `<img src="assets/${issue.identifier}/${image.filename}" alt="Imagen ${image.index}">`
  );
}
bodyHtml = bodyHtml.replace(/@@IMAGE_\d+@@/g, "");

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const labels = (issue.labels?.nodes || []).map((label) => label.name).join(", ") || "—";
const project = issue.project?.name || "—";
const team = issue.team?.name || "—";
const status = issue.state?.name || "—";
const priority = issue.priorityLabel || "—";

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(issue.identifier)} - ${escapeHtml(issue.title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2328; line-height: 1.55; max-width: 980px; margin: 40px auto; padding: 0 20px; }
  h1 { font-size: 28px; border-bottom: 1px solid #d0d7de; padding-bottom: 10px; }
  h2 { font-size: 20px; margin-top: 28px; }
  .meta { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 8px; padding: 14px 18px; margin: 18px 0; }
  .meta div { margin: 4px 0; }
  blockquote { border-left: 4px solid #d0d7de; color: #656d76; margin: 12px 0; padding: 4px 14px; background: #f6f8fa; }
  code { background: #f6f8fa; padding: 2px 5px; border-radius: 4px; }
  img { max-width: 100%; height: auto; border: 1px solid #d0d7de; border-radius: 6px; margin: 12px 0; }
  footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #d0d7de; color: #656d76; font-size: 13px; }
  a { color: #0969da; }
</style>
</head>
<body>
<h1>${escapeHtml(issue.title)}</h1>

<div class="meta">
  <div><strong>Estado:</strong> ${escapeHtml(status)}</div>
  <div><strong>Equipo:</strong> ${escapeHtml(team)}</div>
  <div><strong>Proyecto:</strong> ${escapeHtml(project)}</div>
  <div><strong>Labels:</strong> ${escapeHtml(labels)}</div>
  <div><strong>Prioridad:</strong> ${escapeHtml(priority)}</div>
  <div><strong>Issue original:</strong> <a href="${escapeHtml(issue.url)}">${escapeHtml(issue.url)}</a></div>
</div>

<h2>Descripción</h2>
${bodyHtml}

<footer>Snapshot generado desde Linear. No se actualiza automáticamente.</footer>
</body>
</html>
`;

await fs.writeFile(`${issue.identifier}.html`, html, "utf8");
console.log(`Synced ${issue.identifier}: ${downloaded.length} image(s).`);
