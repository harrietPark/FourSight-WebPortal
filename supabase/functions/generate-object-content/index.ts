import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type GenerateRequest = {
  object_id: string;
  display_name: string;
  material_id?: string;
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

    if (!body.object_id || !body.display_name) {
      return json({ error: 'Missing object_id or display_name' }, 400);
    }

    const supabase = getSupabaseClient();
    const materialHint =
      body.material_id ?? body.detected_materials?.[0] ?? body.material_display_name ?? 'abs';
    const materialId = await resolveMaterialIdFromDb(supabase, materialHint);
    const request = { ...body, material_id: materialId };
    const storagePath = objectImagePath(body.object_id);

    const { data: cachedRows } = await supabase
      .from('generated_object_content')
      .select('*')
      .eq('object_id', request.object_id)
      .order('updated_at', { ascending: false })
      .limit(1);

    const cachedRow = (cachedRows?.[0] ?? null) as CachedContent | null;
    const existingStorageUrl = await getExistingStorageUrl(supabase, storagePath);
    const cachedImageUrl = cachedRow?.image_url ?? existingStorageUrl;
    const needsImage = !cachedImageUrl;
    const needsText = !cachedRow?.quiz_question || !cachedRow?.action_item;

    if (!needsImage && !needsText && cachedRow) {
      return json({
        ...cachedRow,
        image_url: cachedImageUrl,
      });
    }

    let image: GeneratedImage = {
      image_url: cachedImageUrl,
      image_prompt: cachedRow?.image_prompt ?? '',
    };

    if (needsImage) {
      try {
        image = await generateImageWithRetry(request, supabase, storagePath);
      } catch (error) {
        console.error('Image generation failed:', error);
      }
    }

    let aiText: GeneratedText;
    if (needsText) {
      try {
        aiText = await generateTextContent(request);
      } catch (error) {
        console.error('Text generation failed:', error);
        aiText = defaultText(request);
      }
    } else {
      aiText = textFromCache(cachedRow!);
    }

    const payload = {
      object_id: request.object_id,
      material_id: materialId,
      image_url: image.image_url,
      image_prompt: image.image_prompt,
      quiz_question: aiText.quiz_question,
      quiz_answer: aiText.quiz_answer,
      quiz_explanation: aiText.quiz_explanation,
      action_item: aiText.action_item,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveError } = await supabase
      .from('generated_object_content')
      .upsert(payload)
      .select('*')
      .maybeSingle();

    if (saveError) {
      console.warn('generated_object_content save failed; returning payload anyway:', saveError.message);
      return json(payload);
    }

    return json(saved ?? payload);
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

function objectImagePath(objectId: string) {
  return `objects/${sanitizeFilePart(objectId)}.png`;
}

function textFromCache(cached: CachedContent): GeneratedText {
  return {
    quiz_question: cached.quiz_question ?? '',
    quiz_answer: cached.quiz_answer ?? false,
    quiz_explanation: cached.quiz_explanation ?? '',
    action_item: cached.action_item ?? '',
  };
}

function defaultText(body: GenerateRequest): GeneratedText {
  const materialName = body.material_display_name ?? body.detected_materials?.[0] ?? 'this material';
  return {
    quiz_question: `Can you put a ${body.display_name} in your regular curbside recycling bin?`,
    quiz_answer: false,
    quiz_explanation: `${body.display_name} often mixes ${materialName} with other parts, which changes how it should be sorted.`,
    action_item: `Check local drop-off rules before disposing of your ${body.display_name}.`,
  };
}

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, '-');
}

function normalizeMaterialKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const MATERIAL_ALIAS: Record<string, string> = {
  'abs-plastic': 'abs',
  abs: 'abs',
  plastic: 'pp',
  polypropylene: 'pp',
  polyethylene: 'hdpe',
  pet: 'pet',
  paperboard: 'paperboard',
  cardboard: 'paperboard',
  corrugated: 'paperboard',
  aluminum: 'aluminum',
  aluminium: 'aluminum',
  'lcd-glass': 'glass',
  'tempered-glass': 'glass',
  'soda-lime-glass': 'glass',
  glass: 'glass',
  silicone: 'silicone',
  rubber: 'rubber',
  wood: 'wood',
  cotton: 'cotton',
  polyester: 'polyester',
  polycarbonate: 'pc',
  pvc: 'pvc',
  polystyrene: 'ps',
  styrofoam: 'ps',
  foam: 'ps',
  ldpe: 'ldpe',
  hdpe: 'hdpe',
  lithium: 'lithium_compounds',
  bamboo: 'bamboo',
  tpe: 'tpe',
  pbt: 'pbt',
  'pe-lining': 'pe_lining',
};

function resolveMaterialId(materialId: string) {
  const key = normalizeMaterialKey(materialId);
  return MATERIAL_ALIAS[key] ?? key.replace(/-/g, '_');
}

async function resolveMaterialIdFromDb(
  supabase: ReturnType<typeof createClient>,
  materialId: string,
): Promise<string> {
  const candidates = [...new Set([
    resolveMaterialId(materialId),
    normalizeMaterialKey(materialId).replace(/-/g, '_'),
    materialId,
    materialId.toLowerCase(),
  ])];

  for (const candidate of candidates) {
    const { data } = await supabase
      .from('materials')
      .select('material_id')
      .eq('material_id', candidate)
      .maybeSingle();

    if (data?.material_id) {
      return data.material_id;
    }
  }

  const displayHint = materialId.replace(/[-_]/g, ' ').trim();
  if (displayHint.length > 2) {
    const { data: byName } = await supabase
      .from('materials')
      .select('material_id, display_name')
      .ilike('display_name', `%${displayHint}%`)
      .limit(1)
      .maybeSingle();

    if (byName?.material_id) {
      return byName.material_id;
    }
  }

  const { data: anyMaterial } = await supabase.from('materials').select('material_id').limit(1).maybeSingle();

  if (anyMaterial?.material_id) {
    console.warn(`Material "${materialId}" not found; using "${anyMaterial.material_id}"`);
    return anyMaterial.material_id;
  }

  return 'abs';
}

async function getExistingStorageUrl(
  supabase: ReturnType<typeof createClient>,
  path: string,
): Promise<string | null> {
  const { data } = supabase.storage.from('generated-assets').getPublicUrl(path);
  const url = data.publicUrl;

  try {
    const head = await fetch(url, { method: 'HEAD' });
    return head.ok ? url : null;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRateLimitWaitMs(errorText: string) {
  const match = errorText.match(/try again in (\d+(?:\.\d+)?)s/i);
  if (!match) {
    return 13_000;
  }

  return Math.ceil(Number(match[1]) * 1000) + 500;
}

async function generateTextContent(body: GenerateRequest): Promise<GeneratedText> {
  const myths = body.myths ?? [];
  const materialName = body.material_display_name ?? body.detected_materials?.[0] ?? body.material_id ?? 'material';
  const detectedMaterials = body.detected_materials ?? [];
  const isDrinkware = /cup|mug|coffee|soda|bottle/i.test(body.display_name);
  const relevantMyths = myths.filter((myth) => {
    const lower = myth.toLowerCase();
    const isDrinkMyth = /paper cup|coffee cup|takeaway cup|mug|soda cup/i.test(lower);
    return isDrinkware || !isDrinkMyth;
  });
  const quizGuidance =
    body.quiz_prompt ??
    `Write one casual true/false question about recycling or disposing of a ${body.display_name}. Focus on ${materialName}.`;

  const prompt = `
You are Matterly, a friendly sustainability companion app for Snap Spectacles.

Object: ${body.display_name}
${body.description ? `Object description: ${body.description}` : ''}
Active material: ${materialName}
Detected materials: ${detectedMaterials.join(', ') || materialName}
Relevant myths:
${relevantMyths.map((myth) => `- ${myth}`).join('\n') || '- Mixed materials often need special drop-off, not curbside bins.'}

Quiz guidance: ${quizGuidance}

Rules:
- quiz_question must sound like casual trivia a friend would ask — one sentence, ends with "?".
- NEVER start with "True or false:" or "For this ${body.display_name},".
- NEVER mention unrelated objects (e.g. paper cups when the object is a monitor or laptop).
- The question must be about "${body.display_name}" and "${materialName}" only.
- quiz_answer is true or false based on real recycling/disposal facts.
- quiz_explanation: one short sentence connecting the object and material.
- action_item: one practical upstream action under 110 characters.

Return JSON only:
{
  "quiz_question": "Can you put an old monitor in curbside recycling?",
  "quiz_answer": false,
  "quiz_explanation": "Electronics need e-waste drop-off because they mix metals, plastics, and glass.",
  "action_item": "Find a local e-waste drop-off before replacing old electronics."
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
            'You create concise, natural-sounding sustainability trivia for a mobile app. Questions must match the scanned object — never reuse drinkware myths for electronics or furniture.',
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

async function generateImageWithRetry(
  body: GenerateRequest,
  supabase: ReturnType<typeof createClient>,
  storagePath: string,
  maxAttempts = 4,
): Promise<GeneratedImage> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await generateImage(body, supabase, storagePath);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const message = lastError.message;

      if (!message.includes('rate_limit') && !message.includes('Rate limit')) {
        throw lastError;
      }

      const waitMs = parseRateLimitWaitMs(message);
      console.warn(`Image rate limit hit; retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxAttempts})`);
      await sleep(waitMs);
    }
  }

  throw lastError ?? new Error('Image generation failed after retries');
}

async function generateImage(
  body: GenerateRequest,
  supabase: ReturnType<typeof createClient>,
  storagePath: string,
): Promise<GeneratedImage> {
  const material = body.detected_materials?.[0] ?? body.material_display_name ?? 'mixed materials';
  const image_prompt =
    `Single ${body.display_name}, cute 3D product icon, isometric view, glossy toy render, ` +
    `${material} material accents, centered on pure white background, soft shadow, vibrant colors, no text, no people, no watermark.`;
  const imageModel = Deno.env.get('OPENAI_IMAGE_MODEL') ?? 'gpt-image-1';

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: imageModel,
      prompt: image_prompt,
      size: '1024x1024',
      quality: 'low',
      n: 1,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI image error: ${await res.text()}`);
  }

  const data = await res.json();
  const imageBase64 = data.data?.[0]?.b64_json as string | undefined;
  const remoteUrl = data.data?.[0]?.url as string | undefined;

  let bytes: Uint8Array | null = null;

  if (imageBase64) {
    bytes = decodeBase64Image(imageBase64);
  } else if (remoteUrl) {
    const imgRes = await fetch(remoteUrl);
    if (!imgRes.ok) {
      console.warn(`Image download failed (${imgRes.status})`);
      return { image_url: remoteUrl, image_prompt };
    }
    bytes = new Uint8Array(await imgRes.arrayBuffer());
  }

  if (!bytes) {
    return { image_url: null, image_prompt };
  }

  const { error } = await supabase.storage.from('generated-assets').upload(storagePath, bytes, {
    contentType: 'image/png',
    upsert: true,
  });

  if (error) {
    console.warn('Storage upload failed:', error.message);
    return { image_url: null, image_prompt };
  }

  const { data: publicUrl } = supabase.storage.from('generated-assets').getPublicUrl(storagePath);

  return {
    image_url: publicUrl.publicUrl,
    image_prompt,
  };
}

function decodeBase64Image(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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
