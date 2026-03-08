const fetch = require('node-fetch');

async function understandModelImage(config, imageUrl, productDesc) {
  const systemPrompt = `You are an expert fashion videographer analyzing e-commerce model images.
Analyze the provided image and extract:
1. Model appearance (pose, expression, body position)
2. Clothing details (fit, fabric, key features visible)
3. Scene/background (environment, props, setting)
4. Lighting conditions (type, direction, mood)
5. Camera angle and framing
6. Product category and recommended showcase actions for video

Format your response as structured JSON with these exact keys:
{
  "model": {
    "pose": "description of pose",
    "expression": "facial expression",
    "position": "body position in frame"
  },
  "clothing": {
    "type": "specific garment type (e.g. maxi dress, cargo pants, bomber jacket, knit sweater, pleated skirt)",
    "fit": "how the clothing fits",
    "fabric": "visible fabric characteristics",
    "keyFeatures": ["feature1", "feature2", ...],
    "highlightAreas": ["the 2-3 most visually striking areas to showcase, e.g. neckline, waist belt, pocket detail, embroidery, zipper"]
  },
  "scene": {
    "environment": "location/setting description",
    "background": "background details",
    "props": "any props or elements"
  },
  "lighting": {
    "type": "lighting type (natural, studio, etc)",
    "direction": "light direction",
    "mood": "lighting mood/atmosphere"
  },
  "camera": {
    "angle": "camera angle",
    "framing": "shot framing (wide, medium, close)"
  },
  "videoActions": {
    "shot1_action": "recommended model action for establishing shot based on this specific product (e.g. spinning to show dress flow, walking to show pants drape, unzipping jacket)",
    "shot2_details": ["2-3 specific detail areas to focus on with close-up, based on visible product features"],
    "shot2_handActions": ["2-3 specific hand interactions suited to this product (e.g. running fingers along embroidery, pulling stretchy waistband, flipping collar, sliding zipper)"],
    "shot3_action": "recommended closing pose/action that best shows the complete look of this specific product"
  }
}`;

  const userMessage = `Product Description: ${productDesc}

Please analyze this model image and provide the structured analysis.`;

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: userMessage },
        {
          type: 'image_url',
          image_url: { url: imageUrl }
        }
      ]
    }
  ];

  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(config.base_url + '/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.api_key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/yourusername/i2v-pipeline',
          'X-Title': 'I2V Pipeline'
        },
        body: JSON.stringify({
          model: config.model || 'anthropic/claude-3.5-sonnet',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages
          ],
          temperature: 0.3,
          max_tokens: 1500
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return analysis;
      } else {
        throw new Error('Claude did not return valid JSON');
      }

    } catch (err) {
      lastError = err;
      console.error(`[Claude] Attempt ${attempt}/${maxRetries} failed:`, err.message);

      if (attempt < maxRetries) {
        // Exponential backoff
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.log(`[Claude] Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw new Error(`Claude image analysis failed after ${maxRetries} attempts: ${lastError.message}`);
}

module.exports = { understandModelImage };