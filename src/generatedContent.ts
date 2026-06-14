import { createClient } from '@supabase/supabase-js';
import { findMaterialDetail, type MaterialDetail, type ObjectCard } from './data';
import { isQuizNatural, makeQuiz } from './quiz';

export type GeneratedContent = {
  image_url?: string | null;
  image_prompt?: string | null;
  quiz_question: string;
  quiz_answer: boolean;
  quiz_explanation?: string | null;
  action_item: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const functionName =
  (import.meta.env.VITE_GENERATE_CONTENT_FUNCTION as string | undefined) ??
  'generate-object-content';

export const contentSupabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const IMAGE_GENERATION_GAP_MS = 13_000;
let lastImageInvokeAt = 0;
let imageInvokeQueue = Promise.resolve();

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForImageGenerationSlot() {
  const now = Date.now();
  const waitMs = Math.max(0, IMAGE_GENERATION_GAP_MS - (now - lastImageInvokeAt));
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastImageInvokeAt = Date.now();
}

function enqueueImageGeneration<T>(task: () => Promise<T>): Promise<T> {
  const run = imageInvokeQueue.then(task, task);
  imageInvokeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function isGeneratedContent(value: unknown): value is GeneratedContent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  const hasImage = typeof record.image_url === 'string' && record.image_url.length > 0;
  const hasQuiz = typeof record.quiz_question === 'string';
  return hasImage || hasQuiz;
}

function storageImagePath(objectId: string) {
  return `objects/${objectId.replace(/[^a-zA-Z0-9-_]/g, '-')}.png`;
}

async function fetchStorageImageUrl(objectId: string): Promise<string | null> {
  if (!contentSupabase) {
    return null;
  }

  const { data } = contentSupabase.storage.from('generated-assets').getPublicUrl(storageImagePath(objectId));

  try {
    const response = await fetch(data.publicUrl, { method: 'HEAD' });
    return response.ok ? data.publicUrl : null;
  } catch {
    return null;
  }
}

export async function fetchCachedContent(
  objectId: string,
  materialId?: string,
): Promise<GeneratedContent | null> {
  if (!contentSupabase) {
    return null;
  }

  if (materialId) {
    const { data, error } = await contentSupabase
      .from('generated_object_content')
      .select('*')
      .eq('object_id', objectId)
      .eq('material_id', materialId)
      .maybeSingle();

    if (!error && isGeneratedContent(data)) {
      return data;
    }
  }

  const { data: byObject, error: byObjectError } = await contentSupabase
    .from('generated_object_content')
    .select('*')
    .eq('object_id', objectId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!byObjectError && isGeneratedContent(byObject)) {
    return byObject;
  }

  const storageUrl = await fetchStorageImageUrl(objectId);
  if (!storageUrl) {
    return null;
  }

  return {
    image_url: storageUrl,
    quiz_question: '',
    quiz_answer: false,
    action_item: '',
  };
}

function withNaturalQuiz(
  content: GeneratedContent,
  object: ObjectCard,
  detail: MaterialDetail,
): GeneratedContent {
  if (isQuizNatural(content.quiz_question, object.display_name)) {
    return content;
  }

  const localQuiz = makeQuiz(
    detail.material.myths,
    object.display_name,
    detail.material.display_name,
  );

  return {
    ...content,
    quiz_question: localQuiz.question,
    quiz_answer: localQuiz.answer,
    quiz_explanation: localQuiz.explanation,
  };
}

export async function loadGeneratedContent(
  object: ObjectCard,
  detail?: MaterialDetail,
): Promise<GeneratedContent | null> {
  if (!contentSupabase) {
    return null;
  }

  const materialId = detail?.material.material_id;
  const cached = await fetchCachedContent(object.object_id, materialId);
  const cachedQuizOk =
    Boolean(cached?.quiz_question) &&
    cached!.quiz_question.length > 0 &&
    isQuizNatural(cached!.quiz_question, object.display_name);

  if (cached?.image_url && cachedQuizOk && cached.action_item) {
    return detail ? withNaturalQuiz(cached, object, detail) : cached;
  }

  const needsImage = !cached?.image_url;

  const invokeGeneration = async () => {
    const { data, error } = await contentSupabase!.functions.invoke(functionName, {
      body: {
        object_id: object.object_id,
        display_name: object.display_name,
        description: object.description ?? null,
        material_id: materialId,
        material_display_name: detail?.material.display_name ?? object.detected_materials[0],
        detected_materials: object.detected_materials,
        myths: detail?.material.myths ?? [],
        quiz_prompt: detail
          ? `Write one casual true/false question about recycling or disposing of a ${object.display_name}. Focus on ${detail.material.display_name}. Sound like a friend asking trivia — not a textbook. Never mention unrelated objects like paper cups unless the scanned item is drinkware.`
          : undefined,
      },
    });

    if (error) {
      console.warn('Generated content function failed. Keeping local fallback content.', error);
      if (cached?.image_url) {
        return detail ? withNaturalQuiz(cached, object, detail) : cached;
      }
      return null;
    }

    if (!isGeneratedContent(data)) {
      console.warn('Generated content function returned an invalid payload.', data);
      if (cached?.image_url) {
        return detail ? withNaturalQuiz(cached, object, detail) : cached;
      }
      return null;
    }

    if (!detail) {
      return data;
    }

    return withNaturalQuiz(data, object, detail);
  };

  const result = needsImage
    ? await enqueueImageGeneration(async () => {
        await waitForImageGenerationSlot();
        return invokeGeneration();
      })
    : await invokeGeneration();

  return result;
}

export async function prefetchObjectImages(
  objects: ObjectCard[],
  materialDetails: Record<string, MaterialDetail>,
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    objects.map(async (object) => {
      const cached = await fetchCachedContent(object.object_id);
      return [object.object_id, cached?.image_url ?? null] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export async function ensureObjectImagesSequential(
  objects: ObjectCard[],
  materialDetails: Record<string, MaterialDetail>,
  onProgress?: (objectId: string, imageUrl: string | null) => void,
): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {};

  for (const object of objects) {
    const imageUrl = await ensureObjectImage(object, materialDetails);
    results[object.object_id] = imageUrl;
    onProgress?.(object.object_id, imageUrl);
  }

  return results;
}

export async function ensureObjectImage(
  object: ObjectCard,
  materialDetails: Record<string, MaterialDetail>,
): Promise<string | null> {
  const firstMaterial = object.detected_materials[0];
  const detail = firstMaterial ? findMaterialDetail(firstMaterial, materialDetails) : undefined;
  const content = await loadGeneratedContent(object, detail);
  return content?.image_url ?? null;
}

export function subscribeToGeneratedImages(
  onImageReady: (objectId: string, imageUrl: string) => void,
) {
  if (!contentSupabase) {
    return () => {};
  }

  const channel = contentSupabase
    .channel('matterly-generated-images')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'generated_object_content' },
      (payload) => {
        const row = payload.new as { object_id?: string; image_url?: string | null };
        if (row.object_id && row.image_url) {
          onImageReady(row.object_id, row.image_url);
        }
      },
    )
    .subscribe();

  const pollId = window.setInterval(async () => {
    const { data } = await contentSupabase
      .from('generated_object_content')
      .select('object_id, image_url')
      .not('image_url', 'is', null);

    for (const row of data ?? []) {
      if (row.object_id && row.image_url) {
        onImageReady(row.object_id, row.image_url);
      }
    }
  }, 15_000);

  return () => {
    window.clearInterval(pollId);
    void contentSupabase.removeChannel(channel);
  };
}
