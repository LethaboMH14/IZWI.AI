const wordsPerMinute = 150;

export function storyScenes(script: string) {
  let cursor = 0;
  return script.split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter(Boolean).map((text) => {
    const start = script.indexOf(text, cursor);
    const end = start + text.length;
    cursor = end;
    return { text, start, end, seconds: Math.max(2, Math.round(text.split(/\s+/).length * 60 / wordsPerMinute)) };
  });
}
