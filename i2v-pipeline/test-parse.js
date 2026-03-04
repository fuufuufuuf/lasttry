const content = `# Fashion Video Storyboard

**Total Duration**: 10 seconds
**Product**: Denim Cargo Overalls with Adjustable Straps

---

**[Shot 1] — 4s**

Prompt: Medium shot of a woman in medium-wash denim cargo overalls with wide-leg fit standing confidently in an urban alleyway with colorful geometric mural wall, soft golden hour lighting from the left, relaxed pose with one hand in pocket, commercial streetwear photography style, 4K, shallow depth of field, professional quality

---

**[Shot 2] — 3s**

Prompt: Close-up dolly in of the adjustable shoulder straps and chest cargo pockets on the denim overalls, showing the structured denim fabric texture and functional button details, soft golden hour lighting, urban alleyway with colorful mural background, high-end boutique aesthetic, 4K, crisp focus

---

**[Shot 3] — 3s**

Prompt: Medium close-up of the wide-leg silhouette and side cargo pockets with the model's hand adjusting the strap, highlighting the relaxed fit and utility-style design, soft golden hour lighting, urban alleyway setting with geometric mural wall, trendy commercial style, 4K, cinematic, shallow depth of field`;

// Try simpler regex
const shotRegex = /\[Shot (\d+)\][^\n]*?(\d+)s[^\n]*\n+Prompt:\s*(.+?)(?=\n\n---|\n\n\*\*\[Shot|$)/gs;

let match;
let count = 0;
while ((match = shotRegex.exec(content)) !== null) {
  count++;
  console.log(`Match ${count}:`, {
    shotNumber: parseInt(match[1]),
    duration: parseInt(match[2]),
    prompt: match[3].trim().substring(0, 100)
  });
}

console.log(`\nTotal matches: ${count}`);
