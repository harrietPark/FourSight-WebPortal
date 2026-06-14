// Paste this ENTIRE file into Supabase Dashboard → Edge Functions → generate-object-content
// Do NOT import from ./data or any other web app file.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type GenerateRequest = {
  object_id: string;
  display_name: string;
  material_id: string;
  material_display_name?: string;
  detected_materials?: string[];
  myths?: string[];
  description?: string | null;
  quiz_prompt?: string;
};

type GeneratedText = {
  quiz_question: string;
  quiz_answer: boolean;
  quiz_explanation: string;
  action_item: string;
};

type GeneratedImage = {
  image_url: string | null;
  image_prompt: string;
};

type CachedContent = {
  object_id: string;
  material_id: string;
  image_url?: string | null;
  image_prompt?: string | null;
  quiz_question?: string | null;
  quiz_answer?: boolean | null;
  quiz_explanation?: string | null;
  action_item?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as GenerateRequest;

    if (!body.object_id || !body.display_name || !body.material_id) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const supabase = getSupabaseClient();
    const { data: cached } = await supabase
      .from('generated_object_content')
      .select('*')
      .eq('object_id', body.object_id)
      .eq('material_id', body.material_id)
      .maybeSingle();

    const cachedRow = cached as CachedContent | null;
    const needsText = !cachedRow?.quiz_question || !cachedRow?.action_item;
    const needsImage = !cachedRow?.image_url;

    if (!needsText && !needsImage) {
      return json(cachedRow);
    }

    const [textResult, imageResult] = await Promise.allSettled([
      needsText ? generateTextContent(body) : Promise.resolve(textFromCache(cachedRow!)),
      needsImage ? generateImage(body, supabase) : Promise.resolve(imageFromCache(cachedRow!)),
    ]);

    if (textResult.status === 'rejected') {
      throw textResult.reason;
    }

    const aiText = textResult.value;
    const image =
      imageResult.status === 'fulfilled'
        ? imageResult.value
        : { image_url: cachedRow?.image_url ?? null, image_prompt: cachedRow?.image_prompt ?? '' };

    if (imageResult.status === 'rejected') {
      console.error('Image generation failed:', imageResult.reason);
    }

    const { data, error } = await supabase
      .from('generated_object_content')
      .upsert({
        object_id: body.object_id,
        material_id: body.material_id,
        image_url: image.image_url,
        image_prompt: image.image_prompt,
        quiz_question: aiText.quiz_question,
        quiz_answer: aiText.quiz_answer,
        quiz_explanation: aiText.quiz_explanation,
        action_item: aiText.action_item,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return json(data);
  } catch (error) {
    console.error(error);
    return json({ error: 'Failed to generate content', detail: String(error) }, 500);
  }
});

function getSupabaseClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(url, key);
}

function textFromCache(cached: CachedContent): GeneratedText {
  return {
    quiz_question: cached.quiz_question ?? '',
    quiz_answer: cached.quiz_answer ?? false,
    quiz_explanation: cached.quiz_explanation ?? '',
    action_item: cached.action_item ?? '',
  };
}

function imageFromCache(cached: CachedContent): GeneratedImage {
  return {
    image_url: cached.image_url ?? null,
    image_prompt: cached.image_prompt ?? '',
  };
}

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, '-');
}

async function generateTextContent(body: GenerateRequest): Promise<GeneratedText> {
  const myths = body.myths ?? [];
  const materialName = body.material_display_name ?? body.material_id;
  const detectedMaterials = body.detected_materials ?? [];
  const quizGuidance =
    body.quiz_prompt ??
    `Write a true/false quiz about ${body.display_name} that tests a common myth about its ${materialName} material.`;

  const prompt = `
You are Matterly, a friendly sustainability companion app for Snap Spectacles.

Object: ${body.display_name}
${body.description ? `Object description: ${body.description}` : ''}
Active material: ${materialName}
Detected materials: ${detectedMaterials.join(', ') || materialName}
Known myths about this material:
${myths.map((myth) => `- ${myth}`).join('\n') || '- No myths provided'}

Quiz guidance: ${quizGuidance}

Rules:
- quiz_question MUST mention both "${body.display_name}" and "${materialName}".
- Frame the question around how this specific object uses this material.
- quiz_explanation should connect the object and material, not just the material alone.
- Keep quiz_question under 120 characters when possible.

Return JSON only:
{
  "quiz_question": "A fun yes/no quiz question",
  "quiz_answer": false,
  "quiz_explanation": "One short explanation sentence",
  "action_item": "One practical upstream action under 110 characters"
}
`.trim();

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You create concise, accurate sustainability education content for a mobile app. Always tie quiz questions to both the scanned object and its active material.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI text error: ${await res.text()}`);
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content) as GeneratedText;
}

async function generateImage(body: GenerateRequest, supabase: ReturnType<typeof createClient>): Promise<GeneratedImage> {
  const material = body.detected_materials?.[0] ?? body.material_display_name ?? 'mixed materials';
  const image_prompt =
    `3D render of a ${body.display_name}, glossy plastic toy style, made of ${material}. ` +
    'Vibrant colors, clean white background, soft shadow underneath, isometric view, cute and minimal, no text.';

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: image_prompt,
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid',
      n: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI image error: ${await res.text()}`);
  }

  const data = await res.json();
  const remoteUrl = data.data?.[0]?.url as string | undefined;

  if (!remoteUrl) {
    return { image_url: null, image_prompt };
  }

  const imgRes = await fetch(remoteUrl);
  if (!imgRes.ok) {
    console.warn(`Storage fetch failed (${imgRes.status}), using temporary OpenAI URL`);
    return { image_url: remoteUrl, image_prompt };
  }

  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  const fileName = `objects/${sanitizeFilePart(body.object_id)}-${sanitizeFilePart(body.material_id)}.png`;

  const { error } = await supabase.storage.from('generated-assets').upload(fileName, bytes, {
    contentType: 'image/png',
    upsert: true,
  });

  if (error) {
    console.warn('Storage upload failed, using temporary OpenAI URL:', error.message);
    return { image_url: remoteUrl, image_prompt };
  }

  const { data: publicUrl } = supabase.storage.from('generated-assets').getPublicUrl(fileName);

  return {
    image_url: publicUrl.publicUrl,
    image_prompt,
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
