/** Close a dangling fence so streaming markdown still renders the open block. */
export function stabilizeMarkdown(source: string): string {
  const fences = source.match(/```/g)?.length ?? 0;
  if (fences % 2 === 1) return `${source}\n\`\`\``;
  return source;
}
