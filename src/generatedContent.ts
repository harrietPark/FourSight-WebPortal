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

function isGeneratedContent(value: unknown): value is GeneratedContent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.quiz_question === 'string' && typeof record.action_item === 'string';
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

export async function fetchCachedContent(
  objectId: string,
  materialId: string,
): Promise<GeneratedContent | null> {
  if (!contentSupabase) {
    return null;
  }

  const { data, error } = await contentSupabase
    .from('generated_object_content')
    .select('*')
    .eq('object_id', objectId)
    .eq('material_id', materialId)
    .maybeSingle();

  if (error || !isGeneratedContent(data)) {
    return null;
  }

  return data;
}

export async function loadGeneratedContent(
  object: ObjectCard,
  detail: MaterialDetail,
): Promise<GeneratedContent | null> {
  if (!contentSupabase) {
    return null;
  }

  const materialId = detail.material.material_id;
  const cached = await fetchCachedContent(object.object_id, materialId);
  const cachedQuizOk =
    Boolean(cached?.quiz_question) && isQuizNatural(cached!.quiz_question, object.display_name);

  if (cached?.image_url && cachedQuizOk && cached.action_item) {
    return cached;
  }

  const { data, error } = await contentSupabase.functions.invoke(functionName, {
    body: {
      object_id: object.object_id,
      display_name: object.display_name,
      description: object.description ?? null,
      material_id: materialId,
      material_display_name: detail.material.display_name,
      detected_materials: object.detected_materials,
      myths: detail.material.myths,
      quiz_prompt: `Write one casual true/false question about recycling or disposing of a ${object.display_name}. Focus on ${detail.material.display_name}. Sound like a friend asking trivia — not a textbook. Never mention unrelated objects like paper cups unless the scanned item is drinkware.`,
    },
  });

  if (error) {
    console.warn('Generated content function failed. Keeping local fallback content.', error);
    return cached ? withNaturalQuiz(cached, object, detail) : null;
  }

  if (!isGeneratedContent(data)) {
    console.warn('Generated content function returned an invalid payload.', data);
    return cached ? withNaturalQuiz(cached, object, detail) : null;
  }

  return withNaturalQuiz(data, object, detail);
}

export async function prefetchObjectImages(
  objects: ObjectCard[],
  materialDetails: Record<string, MaterialDetail>,
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    objects.map(async (object) => {
      const firstMaterial = object.detected_materials[0];
      if (!firstMaterial) {
        return [object.object_id, null] as const;
      }

      const detail = findMaterialDetail(firstMaterial, materialDetails);
      if (!detail) {
        return [object.object_id, null] as const;
      }

      const cached = await fetchCachedContent(object.object_id, detail.material.material_id);
      return [object.object_id, cached?.image_url ?? null] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export async function ensureObjectImage(
  object: ObjectCard,
  materialDetails: Record<string, MaterialDetail>,
): Promise<string | null> {
  const firstMaterial = object.detected_materials[0];
  if (!firstMaterial) {
    return null;
  }

  const detail = findMaterialDetail(firstMaterial, materialDetails);
  if (!detail) {
    return null;
  }

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
