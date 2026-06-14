import { createClient } from '@supabase/supabase-js';

export type UserData = {
  user_id: string;
  created_at: string;
  display_name: string;
};

export type ObjectCard = {
  object_id: string;
  user_id: string;
  display_name: string;
  detected_materials: string[];
  description?: string | null;
  ai_confidence?: number | null;
  ocr_text?: string | null;
  created_at: string;
};

export type Material = {
  material_id: string;
  display_name: string;
  recyclability_short: string;
  recyclability_long?: string | null;
  common_fate_short: string;
  common_fate_long?: string | null;
  persistence_short: string;
  persistence_long?: string | null;
  myths: string[];
};

export type ImpactMetric = {
  material_id: string;
  co2_convert_value?: number | null;
  water_convert_value?: number | null;
  electricity_convert_value?: number | null;
  co2_bar_percent?: number | null;
  water_bar_percent?: number | null;
  electricity_bar_percent?: number | null;
};

export type LifecycleStep = {
  id: string;
  material_id: string;
  step_order: number;
  step_title: string;
  step_text_long?: string | null;
};

export type MaterialDetail = {
  material: Material;
  impact: ImpactMetric;
  lifecycle: LifecycleStep[];
};

export type AppData = {
  user: UserData;
  objects: ObjectCard[];
  materialDetails: Record<string, MaterialDetail>;
  isFallback: boolean;
};

const fallbackUser: UserData = {
  user_id: 'demo-user',
  display_name: 'SJ',
  created_at: '2026-06-13T10:00:00Z',
};

const fallbackObjects: ObjectCard[] = [
  {
    object_id: 'coffee-cup',
    user_id: fallbackUser.user_id,
    display_name: 'Coffee Cup',
    detected_materials: ['Plastic', 'Cardboard'],
    description: 'A takeaway cup with mixed paperboard and plastic lining.',
    ai_confidence: 0.91,
    created_at: '2026-06-13T12:24:00Z',
  },
  {
    object_id: 'soda-cup',
    user_id: fallbackUser.user_id,
    display_name: 'Soda Cup',
    detected_materials: ['Plastic'],
    description: 'A disposable drink cup with a plastic body and straw.',
    ai_confidence: 0.88,
    created_at: '2026-06-13T09:10:00Z',
  },
  {
    object_id: 'paper-coffee-cup',
    user_id: fallbackUser.user_id,
    display_name: 'Paper Coffee Cup',
    detected_materials: ['Polyethylene', 'Paperboard'],
    description: 'A paper cup with a thin polymer lining.',
    ai_confidence: 0.94,
    created_at: '2026-06-11T15:18:00Z',
  },
];

const fallbackMaterials: Record<string, MaterialDetail> = {
  polyethylene: {
    material: {
      material_id: 'polyethylene',
      display_name: 'Polyethylene',
      recyclability_short: 'Recyclable',
      recyclability_long:
        'PET and PE linings are technically recyclable, but many municipal systems lack the specialized equipment to separate them from paperboard.',
      common_fate_short: 'Often Landfilled',
      common_fate_long:
        'Because of the mixed material structure, many lined cups and films are sorted out or sent to landfill.',
      persistence_short: '20-500 yrs',
      persistence_long:
        'Plastic linings can break into microplastics that persist in soil and water for centuries.',
      myths: [
        'A paper cup with a plastic lining is not always accepted in the paper recycling bin.',
        'Rinsing helps reduce contamination, but it does not solve mixed-material separation.',
      ],
    },
    impact: {
      material_id: 'polyethylene',
      co2_convert_value: 0.11,
      water_convert_value: 1.5,
      electricity_convert_value: 0.04,
      co2_bar_percent: 42,
      water_bar_percent: 68,
      electricity_bar_percent: 31,
    },
    lifecycle: [
      {
        id: 'pe-1',
        material_id: 'polyethylene',
        step_order: 1,
        step_title: 'Extraction',
        step_text_long: 'Crude oil is refined into polymer beads through high-heat cracking.',
      },
      {
        id: 'pe-2',
        material_id: 'polyethylene',
        step_order: 2,
        step_title: 'Manufacturing',
        step_text_long: 'Thin PE layers are extruded onto paperboard rolls for waterproofing.',
      },
      {
        id: 'pe-3',
        material_id: 'polyethylene',
        step_order: 3,
        step_title: 'Transport',
        step_text_long: 'Cup stock is shipped to converters, restaurants, and stores.',
      },
      {
        id: 'pe-4',
        material_id: 'polyethylene',
        step_order: 4,
        step_title: 'Use',
        step_text_long: 'Average use case is less than 20 minutes before being discarded.',
      },
      {
        id: 'pe-5',
        material_id: 'polyethylene',
        step_order: 5,
        step_title: 'End-of-life',
        step_text_long: 'Hard to separate materials are mostly landfilled, incinerated, or downcycled.',
      },
    ],
  },
  paperboard: {
    material: {
      material_id: 'paperboard',
      display_name: 'Paperboard',
      recyclability_short: 'Recyclable',
      recyclability_long:
        'Clean paperboard is widely recyclable, but food residue or attached plastic lining can lower acceptance.',
      common_fate_short: 'Mixed Outcome',
      common_fate_long:
        'Paperboard can become new paper products when clean; contaminated or lined pieces are often discarded.',
      persistence_short: '2-6 months',
      persistence_long:
        'Untreated paperboard breaks down much faster than plastic, though coatings and landfill conditions slow it down.',
      myths: [
        'Paper-looking packaging can still contain plastic layers.',
        'Compostable paperboard only works in the right composting facility.',
      ],
    },
    impact: {
      material_id: 'paperboard',
      co2_convert_value: 0.07,
      water_convert_value: 2.2,
      electricity_convert_value: 0.03,
      co2_bar_percent: 28,
      water_bar_percent: 76,
      electricity_bar_percent: 24,
    },
    lifecycle: [
      {
        id: 'pb-1',
        material_id: 'paperboard',
        step_order: 1,
        step_title: 'Forestry',
        step_text_long: 'Wood fiber is harvested from trees or recovered paper streams.',
      },
      {
        id: 'pb-2',
        material_id: 'paperboard',
        step_order: 2,
        step_title: 'Pulping',
        step_text_long: 'Fibers are pulped, cleaned, and pressed into thick paperboard sheets.',
      },
      {
        id: 'pb-3',
        material_id: 'paperboard',
        step_order: 3,
        step_title: 'Forming',
        step_text_long: 'Sheets are cut, shaped, and printed for packaging or drinkware.',
      },
      {
        id: 'pb-4',
        material_id: 'paperboard',
        step_order: 4,
        step_title: 'Use',
        step_text_long: 'The product is used briefly, usually for transport or serving.',
      },
      {
        id: 'pb-5',
        material_id: 'paperboard',
        step_order: 5,
        step_title: 'Recovery',
        step_text_long: 'Clean fiber can be recycled; dirty or bonded material may be rejected.',
      },
    ],
  },
  plastic: {
    material: {
      material_id: 'plastic',
      display_name: 'Plastic',
      recyclability_short: 'Sometimes Recyclable',
      recyclability_long:
        'Rigid plastic containers are more likely to be recycled than flexible or contaminated plastic items.',
      common_fate_short: 'Often Landfilled',
      common_fate_long:
        'Low-value plastic items are frequently landfilled or incinerated after sorting.',
      persistence_short: '100-500 yrs',
      persistence_long:
        'Plastic can fragment into smaller pieces while staying in the environment for a very long time.',
      myths: [
        'The chasing arrows symbol does not always mean an item is accepted locally.',
        'Small plastic pieces are often too hard for sorting equipment to capture.',
      ],
    },
    impact: {
      material_id: 'plastic',
      co2_convert_value: 0.14,
      water_convert_value: 0.9,
      electricity_convert_value: 0.06,
      co2_bar_percent: 55,
      water_bar_percent: 43,
      electricity_bar_percent: 49,
    },
    lifecycle: [
      {
        id: 'pl-1',
        material_id: 'plastic',
        step_order: 1,
        step_title: 'Extraction',
        step_text_long: 'Fossil feedstocks are extracted and refined into chemical building blocks.',
      },
      {
        id: 'pl-2',
        material_id: 'plastic',
        step_order: 2,
        step_title: 'Resin',
        step_text_long: 'Monomers are polymerized into pellets that manufacturers can melt and shape.',
      },
      {
        id: 'pl-3',
        material_id: 'plastic',
        step_order: 3,
        step_title: 'Manufacturing',
        step_text_long: 'Pellets are molded, extruded, or thermoformed into packaging.',
      },
      {
        id: 'pl-4',
        material_id: 'plastic',
        step_order: 4,
        step_title: 'Use',
        step_text_long: 'Single-use plastic often serves a convenience role for minutes.',
      },
      {
        id: 'pl-5',
        material_id: 'plastic',
        step_order: 5,
        step_title: 'End-of-life',
        step_text_long: 'Only high-value streams are recycled consistently; others are discarded.',
      },
    ],
  },
  cardboard: {
    material: {
      material_id: 'cardboard',
      display_name: 'Cardboard',
      recyclability_short: 'Recyclable',
      recyclability_long:
        'Dry and clean cardboard is one of the most commonly accepted curbside recycling materials.',
      common_fate_short: 'Usually Recovered',
      common_fate_long:
        'Cardboard has strong recycling markets, but food-soiled pieces can be composted or landfilled instead.',
      persistence_short: '2 months',
      persistence_long: 'Cardboard biodegrades relatively quickly when exposed to air, water, and microbes.',
      myths: [
        'Greasy cardboard should not go in most paper recycling bins.',
        'Flattening cardboard helps collection trucks and sorting facilities.',
      ],
    },
    impact: {
      material_id: 'cardboard',
      co2_convert_value: 0.05,
      water_convert_value: 1.8,
      electricity_convert_value: 0.02,
      co2_bar_percent: 20,
      water_bar_percent: 62,
      electricity_bar_percent: 18,
    },
    lifecycle: [
      {
        id: 'cb-1',
        material_id: 'cardboard',
        step_order: 1,
        step_title: 'Fiber',
        step_text_long: 'Virgin or recycled fiber is collected for pulping.',
      },
      {
        id: 'cb-2',
        material_id: 'cardboard',
        step_order: 2,
        step_title: 'Pulping',
        step_text_long: 'Fibers are mixed with water, screened, and pressed into sheets.',
      },
      {
        id: 'cb-3',
        material_id: 'cardboard',
        step_order: 3,
        step_title: 'Conversion',
        step_text_long: 'Sheets are cut, folded, and printed into packaging formats.',
      },
      {
        id: 'cb-4',
        material_id: 'cardboard',
        step_order: 4,
        step_title: 'Use',
        step_text_long: 'Cardboard protects products during shipping or short-term storage.',
      },
      {
        id: 'cb-5',
        material_id: 'cardboard',
        step_order: 5,
        step_title: 'Recycling',
        step_text_long: 'Clean cardboard is baled and repulped into new paper products.',
      },
    ],
  },
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const currentUserId = import.meta.env.VITE_CURRENT_USER_ID as string | undefined;

const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const normalizeMaterialKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const uniqueMaterialKeys = (objects: ObjectCard[]) =>
  Array.from(new Set(objects.flatMap((object) => object.detected_materials.map(normalizeMaterialKey))));

export const findMaterialDetail = (materialName: string, details: Record<string, MaterialDetail>) =>
  details[normalizeMaterialKey(materialName)] ?? details[materialName.toLowerCase()];

export const getFallbackData = (): AppData => ({
  user: fallbackUser,
  objects: fallbackObjects,
  materialDetails: fallbackMaterials,
  isFallback: true,
});

export async function loadAppData(): Promise<AppData> {
  if (!supabase || !currentUserId) {
    return getFallbackData();
  }

  try {
    const [{ data: user }, { data: objects }] = await Promise.all([
      supabase.from('user_data').select('user_id, created_at, display_name').eq('user_id', currentUserId).single(),
      supabase
        .from('object_cards')
        .select('object_id, user_id, display_name, detected_materials, description, ai_confidence, ocr_text, created_at')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false }),
    ]);

    if (!user || !objects) {
      return getFallbackData();
    }

    const objectRows = objects as ObjectCard[];
    const materialKeys = uniqueMaterialKeys(objectRows);

    const [{ data: materials }, { data: impacts }, { data: lifecycle }] = await Promise.all([
      supabase.from('materials').select('*').in('material_id', materialKeys),
      supabase.from('material_impact_metrics').select('*').in('material_id', materialKeys),
      supabase
        .from('material_lifecycle_steps')
        .select('*')
        .in('material_id', materialKeys)
        .order('step_order', { ascending: true }),
    ]);

    const impactById = Object.fromEntries(
      ((impacts ?? []) as ImpactMetric[]).map((impact) => [impact.material_id, impact]),
    );

    const lifecycleById = ((lifecycle ?? []) as LifecycleStep[]).reduce<Record<string, LifecycleStep[]>>(
      (acc, step) => {
        acc[step.material_id] = [...(acc[step.material_id] ?? []), step];
        return acc;
      },
      {},
    );

    const materialDetails = ((materials ?? []) as Material[]).reduce<Record<string, MaterialDetail>>(
      (acc, material) => {
        acc[material.material_id] = {
          material,
          impact: impactById[material.material_id] ?? { material_id: material.material_id },
          lifecycle: lifecycleById[material.material_id] ?? [],
        };
        return acc;
      },
      {},
    );

    return {
      user: user as UserData,
      objects: objectRows,
      materialDetails: { ...fallbackMaterials, ...materialDetails },
      isFallback: false,
    };
  } catch (error) {
    console.warn('Falling back to demo data because Supabase loading failed.', error);
    return getFallbackData();
  }
}
