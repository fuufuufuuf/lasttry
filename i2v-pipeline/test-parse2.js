const content = `# Fashion Video Storyboard - Corduroy Wide-Leg Pants

## First-Frame Analysis Summary

**Model & Styling**: Woman standing in library aisle, reading a book, wearing white crop top with high-waisted tan corduroy pants and crossbody bag. Contemplative, scholarly aesthetic.

**Key Product Features**: High-waisted wide-leg corduroy pants in camel/tan with visible ribbed texture, split wide-leg silhouette, button closure, floor-length hem. Vintage sophisticated look with loose comfortable fit.

**Scene**: Interior library with floor-to-ceiling wooden bookshelves on both sides, warm-lit display area in background, leather armchair visible, stacked books as props.

**Lighting**: Soft mixed natural and ambient interior lighting with warm golden tones, even frontal illumination creating inviting scholarly atmosphere.

---

## Video Storyboard (8-10 seconds)

\`\`\`
[Shot 1] — 4s
Prompt: Medium tracking shot at 1.5x speed of a woman in white crop top and high-waisted tan corduroy wide-leg pants walking briskly through a library aisle between wooden bookshelves while closing a book, soft warm interior lighting with golden tones, elegant and sophisticated movement, commercial fashion photography style, 4K, shallow depth of field, professional quality

[Shot 2] — 3s
Prompt: Close-up dolly in at 1.5x speed of the corduroy pants fabric showing the textured ribbing and flowing wide-leg silhouette as she walks, soft warm interior lighting, luxurious vintage aesthetic, high-end boutique style, 4K, crisp focus on fabric texture, cinematic

[Shot 3] — 3s
Prompt: Medium close-up from side angle at 1.5x speed of the high-waisted button closure and split wide-leg design as the model's hand quickly adjusts the waistband, highlighting the flattering fit and floor-length drape, soft warm interior lighting with bookshelves in background, sophisticated commercial style, 4K, shallow depth of field
\`\`\`

---

## Shot Breakdown

**Shot 1** (Establishing): Shows complete outfit in library setting, model transitioning from reading to walking, demonstrates how the pants flow with movement and complement the crop top styling.

**Shot 2** (Fabric Detail): Highlights the signature corduroy texture and wide-leg movement that drives purchase intent - showcases the vintage premium quality and comfortable drape.

**Shot 3** (Fit Detail): Emphasizes the high-waisted flattering fit and unique split design from side perspective, showing how the pants create a sophisticated elongated silhouette.`;

const shotRegex = /\[Shot (\d+)\][^\n]*?(\d+)s[^\n]*\n+Prompt:\s*(.+?)(?=\n\n\[Shot|\n\n```|\n\n---|\n\n##|$)/gs;

let match;
let count = 0;
const shots = [];
while ((match = shotRegex.exec(content)) !== null) {
  count++;
  shots.push({
    shotNumber: parseInt(match[1]),
    duration: parseInt(match[2]),
    prompt: match[3].trim()
  });
  console.log(`Match ${count}: Shot ${match[1]}, ${match[2]}s`);
}

console.log(`\nTotal matches: ${count}`);
console.log(`Total duration: ${shots.reduce((sum, s) => sum + s.duration, 0)}s`);
