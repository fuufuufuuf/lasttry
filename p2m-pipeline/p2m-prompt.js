// Direct-instruction prompt for Nano Banana (Gemini Flash Image). This file
// is the single source of truth for the p2m behavior — used by the pipeline
// in p2m-pipeline/index.js.

const P2M_GEMINI_PROMPT = `I am providing two reference images.

IMAGE 1 (Body + Framing + Scene-Category Reference):
The first image shows a person wearing some garment in some scene. Use it as the SOLE authority for:
- The body: exact body type, body proportions, shoulder-waist-hip ratio, limb length, skin tone — reproduce AS SEEN. Do NOT slim, thicken, lengthen, or stylize the body in any direction.
- The lower crop / display ratio: the OUTPUT must keep the SAME lower crop boundary as Image 1. If Image 1 shows pants from the abdomen downward, the output shows the same; if Image 1 ends at mid-thigh, the output ends at mid-thigh; if Image 1 is full body, the output is full body. The way the product is framed on the body in Image 1 is the way the product must be framed in the output.
- The scene CATEGORY ONLY: determine whether Image 1 was shot INDOORS or OUTDOORS — the output MUST stay in the same category.

FRAMING (OVERRIDES ALL OTHER FRAMING RULES):
The output is a neck-down garment-forward shot. The frame begins at the base of the neck — the top edge sits at the collarbone or just above it, so the image starts with the upper chest and the neckline of the garment. The frame extends downward to match Image 1's lower boundary exactly (if Image 1 shows pants from the abdomen downward, the output ends at the same point; if Image 1 is full body, the output is full body).

If Image 1's own crop is too tight at the top for the output to start cleanly at the collarbone while keeping Image 1's lower boundary, extend the bottom of the frame downward to reveal the full garment area — keep the top of the frame at the collarbone in all cases.

CRITICAL — GARMENT REPLACEMENT:
The garment currently worn by the person in Image 1 is being REPLACED. Remove it entirely. It must NOT appear in the output.

CRITICAL — SCENE REPLACEMENT (this is a scene change, not a scene preservation):
Do NOT reuse the specific location, structural elements, furniture, walls, windows, props, or background objects from Image 1. Generate a NEW, DIFFERENT scene for the output. The new scene must:
1. Match the indoor/outdoor category of Image 1 exactly.
   - If Image 1 is OUTDOOR (street, park, beach, rooftop, garden, nature, urban exterior, etc.), the output must be OUTDOOR — but in a clearly different outdoor location.
   - If Image 1 is INDOOR (café, studio, home interior, store, hotel lobby, gallery, etc.), the output must be INDOOR — but in a clearly different indoor location.
2. Naturally suit the garment from Image 2 — pick an environment, lighting, and atmosphere that complements the product's style, use case, season, and implied occasion.
3. Use lighting that fits the new scene (new scene → new light direction, color temperature, and mood are expected and encouraged).

POSE:
Because the face is cropped out, facial expression is irrelevant. Allow the body's pose, weight distribution, hand placement, and posture to adapt NATURALLY to the new scene — relaxed, confident, candid. The body should look alive and natural; do not produce a mannequin-stiff stance.

IMAGE 2 (Garment Reference ONLY):
The second image is the product photo of the new garment. Extract from it ONLY:
- Exact color (Image 2 is the color authority — maintain this color truth even as the new scene's lighting plays across the fabric)
- Fabric texture and weave
- Pattern/print (motif, placement, scale, orientation)
- Construction details (collar, neckline, sleeves, closures, pocket placement, hem, hardware, logos) — reproduce exact counts and positions
- Silhouette and fit as shown

Treat Image 2 as a flat garment swatch — read only the fabric, color, pattern, silhouette, and construction from it. The body in the output comes exclusively from Image 1.

TASK:
Generate ONE photorealistic fashion photo in which the body from Image 1 — same body type, same proportions, same skin tone — is wearing the garment described by Image 2, placed in a NEW scene of the same indoor/outdoor category as Image 1 that naturally suits the product. The frame begins at the collarbone and extends down to match Image 1's lower boundary — a neck-down torso/body shot focused on the garment.

Output the image only. Do not output any text.`;

module.exports = { P2M_GEMINI_PROMPT };
