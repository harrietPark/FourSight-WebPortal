import { createClient } from '@supabase/supabase-js';
import type { MaterialDetail, ObjectCard } from './data';

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

const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function loadGeneratedContent(
  object: ObjectCard,
  detail: MaterialDetail,
): Promise<GeneratedContent | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: {
      object_id: object.object_id,
      display_name: object.display_name,
      material_id: detail.material.material_id,
      material_display_name: detail.material.display_name,
      detected_materials: object.detected_materials,
      myths: detail.material.myths,
    },
  });

  if (error) {
    console.warn('Generated content function failed. Keeping local fallback content.', error);
    return null;
  }

  return data as GeneratedContent;
}
