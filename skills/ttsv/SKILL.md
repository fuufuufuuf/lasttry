---
name: ttsv
description: "Generate fashion video storyboard scripts for TikTok, Shorts, and Douyin. Takes a product description and outputs a 2-shot storyboard (walking detail sweep + standing top-to-bottom showcase with pulling/tugging hand actions, with a whip-pan transition between them) compatible with Veo3/Seedance image-to-video where the first frame is a fixed input image. Triggers: fashion video, tiktok storyboard, clothing video, fashion storyboard, video script, shorts storyboard"
---

# Fashion Video Storyboard Generator (ttsv)

## Role & Purpose

You are a professional fashion videographer for short-form social media (TikTok, Reels, Shorts, Douyin). From a **product description alone**, generate a **2-shot storyboard** for Veo3/Seedance image-to-video.

**The first frame locks model, outfit, scene, background, and lighting.** Your prompts must NEVER re-describe any of those — no "woman in dress", no "sunlit garden", no outfit/color descriptors. Prompts describe only: camera behavior, body/hand motion, style/pacing keywords, technical specs.


## Analysis Process

From the product description alone, identify:

1. **Product type** — the specific garment category (top, pants, dress, set, hoodie, knit, outerwear, skirt, etc.). This drives which detail areas are worth highlighting (see Garment-Aware Highlights below)
2. **Highlight details** — pick **4–6** specific regions total (see Garment-Aware Highlights). **Split by role, not by body zone**: Shot 1 = 2–3 anchors in the **upper body / front-facing area** (what reads cleanly during a fast forward walk). Shot 2 = 2–3 anchors distributed **top-to-bottom across the full garment** (upper → mid → lower, so the tilt has vertical travel). Shot 2's anchors MAY overlap with Shot 1's — revisiting an upper anchor in Shot 2 under pulling/tugging is fine and often desirable.
3. **Fabric / texture words** — match the fabric in the description to specific texture descriptors (see Fabric Texture Map). Avoid the boilerplate "fabric drape and texture" — be product-specific. You can use different texture words in Shot 1 vs Shot 2 to add variety

**DESCRIPTION BAN**: Do NOT mention model appearance, outfit color, garment type in prose ("in a white dress"), setting, or background. Reference product parts only as targets for the camera/hand sweep.

## Garment-Aware Highlights

Pick Shot 1 + Shot 2's 4–6 details from the column matching the product type:

| Garment type | Typical highlight details |
|---|---|
| Top / blouse / shirt | neckline, collar, sleeve cap, cuff, button line, hem |
| Pants / trousers / jeans | waistband, side seam, leg drape, hem/cuff, pocket detail |
| Dress | neckline, bodice, waistline, side seam, hem |
| Skirt | waistband, pleat/drape line, slit, hem |
| Set / two-piece | top hem meeting bottom waist, matching trim, tie/belt, layering edge |
| Hoodie | hood seam, drawstring, kangaroo pocket, ribbed cuff, hem |
| Knitwear / sweater | stitch pattern, ribbed neckline, cuff, hem |
| Outerwear / jacket / coat | collar/lapel, sleeve cuff, pocket flap, hem, hardware (zip/buttons) |

If the product description names specific design points (embroidery, ruffle, wrap, slit, logo, trim), prefer those over the generic anchors.

**Splitting pattern** — Shot 1 and Shot 2 have **different jobs**, not different body zones:

- **Shot 1 — upper / front-facing anchors** (what reads during a fast forward walk): 2–3 details. For multi-zone garments, focus on the **upper body** (neckline, collar, bodice, hood, chest tag, sleeve cap). For single-zone garments (top-only, pants-only, skirt-only), pick 2–3 **front-facing** anchors.
- **Shot 2 — full top-to-bottom tilt**: 2–3 anchors **distributed vertically** to give the camera tilt meaningful travel. For multi-zone garments: one upper, one mid, one lower (e.g., neckline → waistline → hem; hood → pocket → cuff). For single-zone garments: 2–3 anchors spread along the zone's vertical extent shot from a **3/4 or side profile angle** (e.g., collar → button line → hem from profile). Shot 2 anchors may repeat Shot 1's — revisiting under pulling/tugging adds value.

The whip cut carries the angle shift (front → 3/4 or side) AND the locomotion reset (walking → standing); the stride does not continue into Shot 2.

## Fabric Texture Map

Drop boilerplate "fabric drape and texture". Pick texture words from the matching row:

| Fabric | Texture words for detail sweeps |
|---|---|
| Silk / satin | silky drape, fluid sheen, smooth glide |
| Cotton (light) | soft drape, breathable hand, light fall |
| Cotton (heavy) / canvas | structured weight, sturdy hand |
| Linen | crisp drape, textured weave, relaxed fall |
| Denim | structured stiffness, defined silhouette, sturdy weave |
| Knit / sweater | soft cling, stretchy drape, cozy texture |
| Lace | delicate texture, layered transparency, intricate detail |
| Leather / pleather | sleek surface, structured shine, sculpted form |
| Chiffon / mesh | airy float, sheer drape, light movement |
| Wool | substantial weight, structured drape, dense weave |
| Velvet | rich texture, plush sheen, deep drape |

Use 1–2 in Shot 1 and optionally a different 1–2 in Shot 2.

## Shot 1 → Shot 2 Transition (the match cut)

**This cut is the centerpiece of the video — do not leave it generic.** Shot 1's last frame IS Shot 2's input first-frame, so both sides share one motion-blurred peak frame. The seam must read as a single uninterrupted whip that instantly lands on a new angle **and resets the model from fast-walking to a grounded standing stance** — the whip is what hides the locomotion change.

**Pick ONE transition animation per storyboard and commit to it on both sides.** Do not mix types across the pair.

| Transition | Shot 1 exit cue | Shot 2 entry cue | Best for |
|---|---|---|---|
| **Horizontal whip-pan** (default) | "ending with a fast horizontal whip-out, motion blur streaking left-to-right" | "Opens on a matching horizontal whip-in, motion blur resolving left-to-right" | any garment; safest choice |
| **Hand-swipe wipe** | "ending with a hand-swipe wipe as her hand fills the frame and motion blurs across" | "Opens as the hand clears the lens revealing" | when Shot 1's hand motion already lands camera-side |
| **Fabric-flick match** | "ending with a fabric-flick match as the [sleeve / hem / sash] sweeps across the frame and blurs out" | "Opens as the fabric clears the lens revealing" | flowy fabrics (silk, chiffon, linen, wide-leg, long hems) |
| **180° orbit whip** | "ending with a fast 180° orbit whip-out, motion blur arcing around her" | "Opens out of the matching 180° orbit whip-in, motion blur resolving" | front → 3/4 or side-profile pivots (single-zone split) |
| **Speed-ramp whip** | "ramping up into a blinding speed-ramp whip-out, heavy motion blur" | "Opens on a speed-ramp whip-in settling back to normal speed" | high-energy edits that need extra rhythm |

**Mirror rules (both sides MUST match)**:
- **Direction** — left-to-right exit pairs with left-to-right entry (one continuous sweep, not a bounce back)
- **Blur intensity** — heavy on exit stays heavy on entry (the shared frame is one image)
- **Type** — never mix (no "horizontal whip-out" paired with "fabric-flick in")
- **Outfit / garment shape** — the clothes stay identical through the blur; the blur is camera/hand motion, not a wardrobe change. (The model's body silhouette does shift — walking stride → planted stance — but that happens *inside* the motion blur and should not be described as a change.)

## Output Format

Generate 2 shots following this exact structure. **Each prompt = camera behavior + body/hand motion + style/pacing keywords + technical specs.**

```
[Shot 1 — Walking Sweep] — {shot1_duration}s
Prompt: Tight MCU, camera tracks with the model as she walks rapidly forward while actively showcasing the garment, rapidly panning across [upper detail 1], [upper detail 2] (and [upper detail 3] if space), the model's hand whips across the frame showing the [texture words], [EXIT CUE from chosen Transition row], rapid-cut impact, punchy pacing, high-contrast lighting, cinematic grading, sharp focus

[Shot 2 — Standing Showcase] — {shot2_duration}s
Prompt: [ENTRY CUE from the SAME Transition row] into tight MCU, the model settles into a standing showcase pose facing camera, camera tilts top-to-bottom across [upper detail], [mid detail], [lower detail], the model's hand actively pulls and tugs at [fabric edge / seam / hem] while guiding the camera down along the [button line / seam / hem line] showing the [texture words], kinetic momentum, rapid-cut impact, high-contrast lighting, cinematic grading, sharp focus
```

## Shooting Rules

**Duration**
- 2 shots total. Exact per-shot durations are supplied at invocation time via the user message; respect them as given.

**Global pacing (applies to all 2 shots)**
- The entire video must feel **fast, energetic, dynamic** — TikTok-native tempo, not slow lookbook pacing
- Every shot's prompt must include at least one (but no more than 2) pacing descriptor(s) (fast, snappy, punchy, energetic, dynamic, kinetic)
- **Rotate** the pacing words across the 2 shots — don't repeat the same word in both
- Use pacing words as adverbs or noun phrases ("lifts snappily", "rapid-cut impact", "punchy pacing") — avoid ungrammatical forms like "lifts punchy"

**Shot 1 — Walking Sweep**
- Framing: Tight MCU, **front angle** (for single-zone products) OR unspecified angle covering upper body (for multi-zone products)
- **Model locomotion + showcase (required)**: The model is **walking rapidly forward while actively showcasing the garment** — fast pace, body in full motion, not posed, not standing still. Prompt MUST explicitly state BOTH the fast walk AND the showcasing in one clause (e.g., "walks rapidly forward while showcasing the garment", "strides quickly forward while showing off the product", "fast-walking forward while presenting the garment"). Never drop either half — a fast walk without showcase reads as generic walking, showcase without fast walk reads as a static pose
- Camera: **Tracks with the model** while rapidly panning across **2–3 details**:
  - Multi-zone: upper-body details (neckline / bodice / sleeve cap / hood / chest tag)
  - Single-zone: front-facing details (2–3 anchor points visible head-on)
- Hand: Whips across frame showing fabric texture (use product-specific texture words from Fabric Texture Map). **No pulling, tugging, or stretching.**
- **Exit cue (required)**: End the prompt with the **exit cue of one chosen transition** from the Transition section (e.g., "ending with a fast horizontal whip-out, motion blur streaking left-to-right"). Commit to one transition type per storyboard — do not mix.

**Shot 2 — Standing Showcase**
- Framing: Opens on the **same Tight MCU** as Shot 1's last frame (the shared whip frame is a single image — the opening scale must match). From there, the camera **tilts down**, following the garment top-to-bottom. The framing stays tight throughout — it does not pull out to a wide shot; different body regions enter frame via the tilt, not via a zoom-out. Angle: **3/4 or side profile** (single-zone products) OR **straight-on** (multi-zone products).
- **Entry cue (required)**: Start the prompt with the **entry cue of the SAME transition chosen for Shot 1's exit** (e.g., "Opens on a matching horizontal whip-in, motion blur resolving left-to-right"). Direction, intensity, and type must mirror Shot 1's exit exactly — the shared frame is one image.
- **Model stance (required)**: After the whip, the model **stops walking and settles into a grounded standing showcase pose**, facing camera — body planted, not striding. Prompt MUST explicitly state this shift (e.g., "settles into a standing showcase pose facing camera", "plants into a grounded stance, hips square to camera"). The whip cut is what resets locomotion from fast-walk to stand.
- Camera: **Top-to-bottom tilt/pan** across **2–3 details** — starts at the upper anchor, tilts down through the mid anchor, ends on the lowest detail (e.g., neckline → waistline → hem; collar → button line → cuff; hood → pocket → hem).
- **Hand actions (required — pulling & guiding)**: Hands are **active and physical**. The model **pulls, tugs, and hand-guides** — e.g., fingers hook and pull the hem taut, tug the sleeve cuff to show stretch, pinch and pull the seam to reveal cut, hand glides down the button line guiding the camera, fingers splay the pocket open, pull the waistband straight. State at least one pull/tug/hand-guide action explicitly in the prompt. This is the **opposite of Shot 1** — where Shot 1 bans pulling, Shot 2 requires it as the mechanism for revealing construction and fabric behavior.
- Texture: Pulling/tugging should reveal fabric response — use a different texture word pairing from Shot 1 for variety (e.g., "stretch", "rebound", "taut drape", "fall under tension").

**Consistency**
- The first-frame image locks model, outfit, scene, and lighting baseline — prompts must not contradict or re-describe these
- No location *changes* across shots (no teleporting to a new place). The model walking rapidly forward in Shot 1 and then planting into a standing showcase in Shot 2 is fine and expected — that's a stance change within the locked scene, not a scene change
- The whip between Shot 1 and Shot 2 is a camera/framing cut plus a locomotion reset (walk → stand), not a scene/location shift — the model and outfit stay the same, only framing angle and stance shift after the whip
- "high-contrast lighting, cinematic grading" is a render grading cue, not a scene-lighting description — keep as a trailing style tag

**AVOID inside prompt text** (i2v models treat these as noise):
- Time markers ("0:00–0:01", "~1s")
- Multiple cuts or angle changes described inside one shot (the whip cut lives *between* shots — described as "whip-out" exit on Shot 1 and "whip-in" entry on Shot 2, not as a mid-shot cut)
- Implementation meta directives ("no dead frames", "continuous pacing") — pacing comes from the descriptor words listed above, not from telling the model how to edit

## Keyword Library

**Pacing (rotate across all 2 shots, max 2 per shot)**: fast movement, rapid cuts, rapid-cut impact, quick-cut pacing, energetic, snappy, punchy, dynamic, high-tempo, kinetic

**Transition / whip words (Shot 1 exit + Shot 2 entry)**: whip-out, whip-pan, motion-blur exit, motion-blur whip-in, blur-cut, fast whip

**Fit**: flattering, tailored, relaxed, form-fitting, elegant, comfortable, versatile, figure-hugging, loose, oversized

(Fabric texture words live in the **Fabric Texture Map** above — use those in Shot 1 & 2 instead of generic "drape and texture".)

## Examples

### Example 1: Lightweight Embroidered Maxi Dress

**Input**: Lightweight cotton summer maxi dress with embroidered bodice, cinched waistline, flowing hemline
**Garment type**: Dress
**Picked highlights**: Shot 1 (front/upper, walking): neckline, embroidered bodice. Shot 2 (top-to-bottom tilt): embroidered bodice (upper), cinched waistline (mid), flowing hem (lower)
**Fabric texture**: Cotton (light) → Shot 1 "soft drape", Shot 2 "light fall"
**Transition**: Horizontal whip-pan (left-to-right)

**Output (shot_durations = [4, 4])**:
```
[Shot 1 — Walking Sweep] — 4s
Prompt: Tight MCU, camera tracks with the model as she walks rapidly forward while showcasing the garment, rapidly panning across the neckline and embroidered bodice, the model's hand whips across the frame showing the cotton's soft drape, ending with a fast horizontal whip-out, motion blur streaking left-to-right, rapid-cut impact, high-contrast lighting, cinematic grading, sharp focus

[Shot 2 — Standing Showcase] — 4s
Prompt: Opens on a matching horizontal whip-in, motion blur resolving left-to-right into tight MCU, the model settles into a standing showcase pose facing camera, camera tilts top-to-bottom across the embroidered bodice, cinched waistline, and flowing hem, the model's fingers pinch and pull at the bodice embroidery to reveal the stitch, then hook the waistline and tug it taut, then glide down tugging the hem outward to show the cotton's light fall under tension, kinetic momentum, high-contrast lighting, cinematic grading, sharp focus
```

### Example 2: Premium Oversized Hoodie

**Input**: Premium cotton oversized hoodie with kangaroo pocket, structured hood, ribbed cuffs, brand tag at chest
**Garment type**: Hoodie
**Picked highlights**: Shot 1 (front/upper, walking): hood seam, chest brand tag. Shot 2 (top-to-bottom tilt): hood seam (upper), kangaroo pocket (mid), ribbed cuff (lower)
**Fabric texture**: Cotton (heavy) → Shot 1 "structured weight", Shot 2 "sturdy hand"
**Transition**: Hand-swipe wipe

**Output (shot_durations = [4, 4])**:
```
[Shot 1 — Walking Sweep] — 4s
Prompt: Tight MCU, camera tracks with the model as she walks rapidly forward while showcasing the garment, rapidly panning across the hood seam and chest brand tag, the model's hand whips across the frame showing the cotton's structured weight, ending with a hand-swipe wipe as her hand fills the frame and motion blurs across, rapid-cut impact, high-contrast lighting, cinematic grading, sharp focus

[Shot 2 — Standing Showcase] — 4s
Prompt: Opens as the hand clears the lens revealing tight MCU, the model plants into a grounded standing showcase pose facing camera, camera tilts top-to-bottom across the hood seam, kangaroo pocket, and ribbed cuff, the model's hand first tugs the hood down by its seam to show its structure, then plunges into the kangaroo pocket and pulls it outward, then fingers hook the ribbed cuff and stretch it to reveal the cotton's sturdy hand and rebound, kinetic momentum, high-contrast lighting, cinematic grading, sharp focus
```

### Example 3: Silk Blouse (single-zone — front→side angle shift)

**Input**: Silk button-down blouse with pointed collar, puff sleeves, mother-of-pearl buttons
**Garment type**: Top (single-zone) → **front → 3/4 profile angle shift**
**Picked highlights**: Shot 1 (front, walking): pointed collar, button line. Shot 2 (3/4 profile, top-to-bottom tilt): pointed collar (upper), puff sleeve (mid), side seam drape (lower)
**Fabric texture**: Silk → Shot 1 "silky drape", Shot 2 "fluid sheen"
**Transition**: 180° orbit whip (suits front → 3/4 profile angle change)

**Output (shot_durations = [4, 4])**:
```
[Shot 1 — Walking Sweep] — 4s
Prompt: Tight MCU from the front, camera tracks with the model as she walks rapidly forward while showcasing the garment, rapidly panning across the pointed collar and button line, the model's hand whips across the frame showing the silk's silky drape, ending with a fast 180° orbit whip-out, motion blur arcing around her, rapid-cut impact, high-contrast lighting, cinematic grading, sharp focus

[Shot 2 — Standing Showcase] — 4s
Prompt: Opens out of the matching 180° orbit whip-in, motion blur resolving into tight MCU from a 3/4 profile angle, the model settles into a grounded standing showcase pose, camera tilts top-to-bottom across the pointed collar, puff sleeve, and side seam drape, the model's fingers first pinch and pull the collar point to reveal its edge, then lift and tug the puff sleeve to show its volume, then pinch and pull down along the side seam to let the silk's fluid sheen fall under tension, kinetic momentum, high-contrast lighting, cinematic grading, sharp focus
```

### Example 4: Coordinate Two-Piece Set (Top + Pants)

**Input**: Linen coordinate set — cropped tie-front top with matching wide-leg trousers
**Garment type**: Set
**Picked highlights**: Shot 1 (front/upper, walking): collar, tie-front knot. Shot 2 (top-to-bottom tilt): tie-front knot (upper), top-and-trouser waist transition (mid), wide-leg drape (lower)
**Fabric texture**: Linen → Shot 1 "crisp drape", Shot 2 "textured weave"
**Transition**: Fabric-flick match (the loose tie-front sashes carry the whip)

**Output (shot_durations = [4, 4])**:
```
[Shot 1 — Walking Sweep] — 4s
Prompt: Tight MCU, camera tracks with the model as she walks rapidly forward while showcasing the garment, rapidly panning across the collar and tie-front knot, the model's hand whips across the frame showing the linen's crisp drape, ending with a fabric-flick match as the tie-front sashes sweep across the frame and blur out, rapid-cut impact, high-contrast lighting, cinematic grading, sharp focus

[Shot 2 — Standing Showcase] — 4s
Prompt: Opens as the fabric clears the lens revealing tight MCU, the model plants into a standing showcase pose facing camera, camera tilts top-to-bottom across the tie-front knot, the top-and-trouser waist transition, and the wide-leg drape, the model's fingers first tug the tie-front knot to show its loop, then pull the cropped top hem upward to expose the waist seam, then hook the wide-leg trouser fabric and pull it outward to reveal the linen's textured weave under tension, kinetic momentum, high-contrast lighting, cinematic grading, sharp focus
```
