// Direct-instruction version of the p2m skill, written for Nano Banana
// (Gemini Flash Image) rather than for Claude. Keep in sync with
// ../skills/p2m/SKILL.md — this file is the executable version of those rules.

const P2M_GEMINI_PROMPT = `I am providing two reference images.

IMAGE 1 (Model + Scene + Framing Reference):
The first image is the completed model-scene photo. Use it as the SOLE authority for:
- The person: exact facial structure, bone structure, interpupillary distance, hair color and style, skin tone, makeup, visible accessories
- The body: exact body type, proportions, shoulder-waist-hip ratio, limb length, height-to-head ratio — reproduce as seen, do NOT slim, thicken, lengthen, or stylize in any direction
- The pose: exact stance, weight distribution, torso rotation, head tilt, hand placement, facial expression, eye direction
- The camera: exact camera angle, shot type, focal length feel
- The crop/framing: EXACT crop boundaries from Image 1 — if Image 1 is waist-up, the output is waist-up; if head-and-shoulders, the output is head-and-shoulders; if full body, full body. NEVER extend the frame to show body parts that are not visible in Image 1.
- The scene: same location, same structural elements, same furniture, same windows, same walls, same key background objects, same base light direction

CRITICAL: The garment currently worn by the person in Image 1 is being REPLACED. Remove it entirely. It must NOT appear in the output.

IMAGE 2 (Garment Reference ONLY):
The second image is the product photo of the new garment. Extract from it ONLY:
- Exact color (Image 2 is the color authority — maintain this color truth even as Image 1's scene lighting plays across the fabric)
- Fabric texture and weave
- Pattern/print (motif, placement, scale, orientation)
- Construction details (collar, neckline, sleeves, closures, pocket placement, hem, hardware, logos) — reproduce exact counts and positions
- Silhouette and fit as shown

CRITICAL: If Image 2 shows a person wearing the product, completely IGNORE that person. Do not blend, reference, or incorporate any feature of the Image 2 model — not their face, hair, body, or skin tone — into the output. The only person in the output is the person from Image 1.

TASK:
Generate ONE photorealistic fashion photo in which the exact person from Image 1 — with identical face, hair, body, proportions, pose, camera angle, and crop — is now wearing the garment described by Image 2 instead of their original outfit.

The scene from Image 1 is preserved. You MAY subtly reinterpret the scene's lighting: slight drift in direction, color temperature, or softness; gentle additional background bokeh; a touch more atmospheric glow or haze. You MAY NOT change the location, structural elements, furniture, walls, windows, or the overall grading identity of the scene. Never alter the model or the framing.

Output the image only. Do not output any text.`;

module.exports = { P2M_GEMINI_PROMPT };
