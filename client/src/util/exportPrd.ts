import type { PRD } from "../types";

export function formatPrdAsMarkdown(prd: PRD): string {
  const lines: string[] = [];

  lines.push(`# ${prd.title}`);
  lines.push(`*${prd.subtitle}*`);
  lines.push("");

  lines.push("## 01 Problem Statement");
  lines.push(prd.problemStatement.text);
  lines.push("");

  lines.push("## 02 Target Users");
  for (const user of prd.targetUsers) {
    lines.push(`- ${user.text}`);
  }
  lines.push("");

  lines.push("## 03 Goals");
  for (const goal of prd.goals) {
    lines.push(`- ${goal.text}`);
  }
  lines.push("");

  lines.push("## 04 Functional Requirements");
  for (const req of prd.functionalRequirements) {
    lines.push(`- **[${req.ref}]**: ${req.text}`);
  }
  lines.push("");

  lines.push("## 05 Out of Scope");
  for (const item of prd.outOfScope) {
    lines.push(`- ${item.text}`);
  }
  lines.push("");

  lines.push("## 06 Open Questions");
  for (let i = 0; i < prd.openQuestions.length; i++) {
    lines.push(`Q${i + 1}. ${prd.openQuestions[i].text}`);
  }
  lines.push("");

  return lines.join("\n");
}

export function downloadPrdAsMarkdown(prd: PRD): void {
  const markdownText = formatPrdAsMarkdown(prd);
  const blob = new Blob([markdownText], { type: "text/markdown;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const filename = `${prd.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-PRD.md`;

  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
