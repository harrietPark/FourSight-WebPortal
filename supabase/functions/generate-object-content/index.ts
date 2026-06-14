import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    if (cached) {
      return json(cached);
    }

    const [aiText, image] = await Promise.all([
      generateTextContent(body),
      generateImage(body, supabase),
    ]);

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
    return json({ error: 'Failed to generate content' }, 500);
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

async function generateImage(
  body: GenerateRequest,
  supabase: SupabaseClient,
): Promise<GeneratedImage> {
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
  const url = data.data?.[0]?.url as string | undefined;

  if (!url) {
    return { image_url: null, image_prompt };
  }

  const imgRes = await fetch(url);
  if (!imgRes.ok) {
    throw new Error(`Failed to fetch generated image: ${imgRes.status}`);
  }

  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  const fileName = `objects/${body.object_id}-${body.material_id}.png`;

  const { error } = await supabase.storage.from('generated-assets').upload(fileName, bytes, {
    contentType: 'image/png',
    upsert: true,
  });

  if (error) {
    throw error;
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
