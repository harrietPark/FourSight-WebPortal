import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Check,
  GraduationCap,
  List,
  User,
  X,
} from 'lucide-react';
import {
  type AppData,
  type MaterialDetail,
  type ObjectCard,
  findMaterialDetail,
  getFallbackData,
  loadAppData,
} from './data';
import { type GeneratedContent, loadGeneratedContent, prefetchObjectImages } from './generatedContent';

type Screen = 'splash' | 'learn' | 'detail';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [appData, setAppData] = useState<AppData>(getFallbackData());
  const [isLoading, setIsLoading] = useState(true);
  const [objectImages, setObjectImages] = useState<Record<string, string | null>>({});

  useEffect(() => {
    loadAppData().then((data) => {
      setAppData(data);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (isLoading || appData.objects.length === 0) {
      return;
    }

    let isCancelled = false;

    prefetchObjectImages(appData.objects, appData.materialDetails).then((images) => {
      if (!isCancelled) {
        setObjectImages(images);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [appData.materialDetails, appData.objects, isLoading]);

  const selectedObject = useMemo(
    () => appData.objects.find((object) => object.object_id === selectedObjectId) ?? appData.objects[0],
    [appData.objects, selectedObjectId],
  );

  const openDetail = (object: ObjectCard) => {
    setSelectedObjectId(object.object_id);
    setScreen('detail');
  };

  if (screen === 'splash') {
    return <SplashScreen onEnter={() => setScreen('learn')} />;
  }

  if (screen === 'detail' && selectedObject) {
    return (
      <DetailScreen
        key={selectedObject.object_id}
        object={selectedObject}
        materialDetails={appData.materialDetails}
        initialImageUrl={objectImages[selectedObject.object_id]}
        onBack={() => setScreen('learn')}
      />
    );
  }

  return (
    <LearnScreen
      data={appData}
      isLoading={isLoading}
      objectImages={objectImages}
      onOpenDetail={openDetail}
    />
  );
}

function SplashScreen({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onEnter, 1800);
    return () => window.clearTimeout(timer);
  }, [onEnter]);

  return (
    <main className="phone-frame splash-screen">
      <section className="splash-content">
        <h1>matterly</h1>
        <p>Spectacles Companion App</p>
      </section>
    </main>
  );
}

function LearnScreen({
  data,
  isLoading,
  objectImages,
  onOpenDetail,
}: {
  data: AppData;
  isLoading: boolean;
  objectImages: Record<string, string | null>;
  onOpenDetail: (object: ObjectCard) => void;
}) {
  const dayGroups = useMemo(() => buildDayGroups(data.objects), [data.objects]);

  return (
    <main className="phone-frame app-screen">
      <section className="learn-page">
        <p className="hello">Hello {data.user.display_name}!</p>
        <h1>See Your Previous Scans</h1>

        <div className="sort-row" aria-label="Sort scans">
          <span>SORT BY</span>
          <button className="pill muted" type="button" disabled>
            By Type
          </button>
          <button className="pill active" type="button">
            By Date
          </button>
        </div>

        {data.isFallback && (
          <p className="data-note">
            Demo mode: add Supabase env values to read Snap cloud scan data.
          </p>
        )}

        <section
          className={`timeline${dayGroups.length === 1 ? ' timeline--single' : ''}`}
          aria-busy={isLoading}
        >
          {dayGroups.map((group) => (
            <article className="day-group" key={group.isoDate}>
              <div className="timeline-dot" />
              <h2>{group.label}</h2>
              <div className="day-cards">
                {group.objects.length === 0 ? (
                  <div className="empty-card">No Items Scanned :(</div>
                ) : (
                  group.objects.map((object) => (
                    <button
                      className="scan-card"
                      key={object.object_id}
                      type="button"
                      onClick={() => onOpenDetail(object)}
                    >
                      <div className="scan-card-thumb">
                        <ObjectVisual
                          imageUrl={objectImages[object.object_id]}
                          name={object.display_name}
                        />
                      </div>
                      <span className="scan-card-copy">
                        <small>{object.display_name}</small>
                        <strong>{object.detected_materials.join(', ')}</strong>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </article>
          ))}
        </section>
      </section>
      <BottomTabs />
    </main>
  );
}

function DetailScreen({
  object,
  materialDetails,
  initialImageUrl,
  onBack,
}: {
  object: ObjectCard;
  materialDetails: Record<string, MaterialDetail>;
  initialImageUrl?: string | null;
  onBack: () => void;
}) {
  const [activeMaterialName, setActiveMaterialName] = useState(object.detected_materials[0] ?? 'Plastic');
  const [generated, setGenerated] = useState<{
    cacheKey: string;
    content: GeneratedContent | null;
  } | null>(null);

  const activeDetail =
    findMaterialDetail(activeMaterialName, materialDetails) ??
    Object.values(materialDetails)[0];

  const generatedCacheKey = activeDetail
    ? `${object.object_id}:${activeDetail.material.material_id}`
    : object.object_id;
  const activeGenerated =
    generated?.cacheKey === generatedCacheKey ? generated.content : null;
  const imageUrl = activeGenerated?.image_url ?? initialImageUrl;
  const quiz = activeGenerated
    ? {
        question: activeGenerated.quiz_question,
        answer: activeGenerated.quiz_answer,
        explanation: activeGenerated.quiz_explanation,
      }
    : makeQuiz(activeDetail?.material.myths ?? [], activeDetail?.material.display_name ?? activeMaterialName);
  const action =
    activeGenerated?.action_item ??
    makeActionItem(object.display_name, activeDetail?.material.display_name ?? activeMaterialName);

  useEffect(() => {
    if (!activeDetail) {
      return;
    }

    let isCancelled = false;

    loadGeneratedContent(object, activeDetail).then((content) => {
      if (!isCancelled) {
        setGenerated({ cacheKey: generatedCacheKey, content });
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [activeDetail, generatedCacheKey, object]);

  return (
    <main className="phone-frame detail-screen">
      <header className="detail-topbar">
        <button aria-label="Back to scans" type="button" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
      </header>

      <section className="detail-hero">
        <div className="detail-hero-visual">
          <ObjectVisual
            imageUrl={imageUrl}
            name={object.display_name}
            size="large"
          />
        </div>
        <h1>{object.display_name}</h1>
        <div className="material-tabs">
          {object.detected_materials.map((material) => (
            <button
              className={material === activeMaterialName ? 'active' : ''}
              key={material}
              type="button"
              onClick={() => setActiveMaterialName(material)}
            >
              {material}
            </button>
          ))}
        </div>
      </section>

      {activeDetail && (
        <section className="detail-content">
          <InfoStack detail={activeDetail} />
          <ImpactCard detail={activeDetail} />
          <Lifecycle detail={activeDetail} />
          <QuizCard key={quiz.question} quiz={quiz} />
          <ActionCard action={action} />
        </section>
      )}
    </main>
  );
}

function InfoStack({ detail }: { detail: MaterialDetail }) {
  const baseUrl = import.meta.env.BASE_URL;
  const items = [
    {
      label: detail.material.recyclability_short,
      text: detail.material.recyclability_long,
      tone: 'green',
      iconSrc: `${baseUrl}images/recycle.png`,
    },
    {
      label: detail.material.common_fate_short,
      text: detail.material.common_fate_long,
      tone: 'teal',
      iconSrc: `${baseUrl}images/fate.png`,
    },
    {
      label: detail.material.persistence_short,
      text: detail.material.persistence_long,
      tone: 'red',
      iconSrc: `${baseUrl}images/after_life.png`,
    },
  ];

  return (
    <section className="detail-section">
      <h2>End-of-life fate</h2>
      <div className="info-stack">
        {items.map((item) => (
          <article className={`info-card ${item.tone}`} key={item.label}>
            <img className={`info-card-icon ${item.tone}`} src={item.iconSrc} alt="" />
            <div>
              <h3>{item.label}</h3>
              <p>{item.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ImpactCard({ detail }: { detail: MaterialDetail }) {
  const rows = [
    ['CO2e emissions', detail.impact.co2_convert_value, detail.impact.co2_bar_percent, 'green', 'g', '#2E5D13'],
    ['Water consumption', detail.impact.water_convert_value, detail.impact.water_bar_percent, 'blue', 'L', '#6896BA'],
    ['Energy used', detail.impact.electricity_convert_value, detail.impact.electricity_bar_percent, 'teal', 'MJ', '#0BB695'],
  ] as const;

  return (
    <section className="detail-section">
      <h2>Environmental impact</h2>
      <div className="impact-card">
        {rows.map(([label, value, percent, tone, unit, valueColor]) => (
          <div className="impact-row" key={label}>
            <div>
              <span>{label}</span>
              <strong className={`impact-value impact-value--${tone}`} style={{ color: valueColor }}>
                {formatImpactValue(value, unit)}
              </strong>
            </div>
            <div className="bar-track">
              <span className={tone} style={{ width: `${percent ?? 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Lifecycle({ detail }: { detail: MaterialDetail }) {
  return (
    <section className="detail-section lifecycle">
      <h2>Product lifecycle</h2>
      {detail.lifecycle
        .slice()
        .sort((a, b) => a.step_order - b.step_order)
        .map((step) => (
          <article className="lifecycle-step" key={step.id}>
            <span aria-hidden="true" />
            <div>
              <h3>{step.step_title}</h3>
              <p>{step.step_text_long}</p>
            </div>
          </article>
        ))}
    </section>
  );
}

function QuizCard({
  quiz,
}: {
  quiz: { question: string; answer: boolean; explanation?: string | null };
}) {
  const [answer, setAnswer] = useState<boolean | null>(null);

  return (
    <section className="quiz-card">
      <span className="quiz-badge">POP QUIZ!</span>
      <h2>{quiz.question}</h2>
      <div className="quiz-actions">
        <button type="button" onClick={() => setAnswer(true)}>
          <Check size={18} />
          YES
        </button>
        <button type="button" onClick={() => setAnswer(false)}>
          <X size={18} />
          NO
        </button>
      </div>
      {answer !== null && (
        <p>
          {answer === quiz.answer
            ? quiz.explanation ?? 'Nice! That matches the material data.'
            : quiz.explanation ?? 'Not quite. Check the myth behind this material.'}
        </p>
      )}
    </section>
  );
}

function ActionCard({ action }: { action: string }) {
  return (
    <section className="action-card">
      <div className="action-card-icon">
        <GeneratedObjectIcon name="Reusable mug" size="small" />
      </div>
      <span>UPSTREAM ACTION</span>
      <h2>{action}</h2>
    </section>
  );
}

function BottomTabs() {
  const tabs = [
    ['Learn', GraduationCap, true],
    ['Log', List, false],
    ['Quests', Award, false],
    ['Profile', User, false],
  ] as const;

  return (
    <nav className="bottom-tabs" aria-label="Matterly tabs">
      {tabs.map(([label, Icon, active]) => (
        <button className={active ? 'active' : ''} key={label} type="button" disabled={!active}>
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function GeneratedObjectIcon({
  name,
  size = 'default',
}: {
  name: string;
  size?: 'small' | 'default' | 'large';
}) {
  const isSoda = /soda|straw/i.test(name);
  const isCoffee = /coffee|cup|mug/i.test(name);

  return (
    <span className={`object-icon ${size}`} aria-label={`${name} generated icon`}>
      <span className="icon-shadow" />
      {isSoda ? (
        <span className="soda-cup-art">
          <i />
          <b />
        </span>
      ) : isCoffee ? (
        <span className="coffee-cup-art">
          <i />
          <b />
        </span>
      ) : (
        <span className="box-art">
          <i>{name.slice(0, 1)}</i>
        </span>
      )}
    </span>
  );
}

function ObjectVisual({
  imageUrl,
  name,
  size = 'default',
}: {
  imageUrl?: string | null;
  name: string;
  size?: 'small' | 'default' | 'large';
}) {
  if (imageUrl) {
    return (
      <img
        className={`generated-object-image ${size}`}
        src={imageUrl}
        alt={`${name} AI generated icon`}
      />
    );
  }

  return <GeneratedObjectIcon name={name} size={size} />;
}

function buildDayGroups(objects: ObjectCard[]) {
  if (objects.length === 0) {
    return [];
  }

  const sortedObjects = [...objects].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const newest = startOfDay(new Date(sortedObjects[0].created_at));
  const oldest = startOfDay(new Date(sortedObjects[sortedObjects.length - 1].created_at));
  const groups = [];

  for (let date = newest; date >= oldest; date = addDays(date, -1)) {
    const isoDate = localDateKey(date);
    groups.push({
      isoDate,
      label: dateFormatter.format(date).replace(/(\d+)$/, (_, day) => ordinal(Number(day))),
      objects: sortedObjects
        .filter((object) => localDateKey(new Date(object.created_at)) === isoDate)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    });
  }

  return groups;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function localDateKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function ordinal(day: number) {
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `${day}${suffix}`;
}

function formatImpactValue(value?: number | null, unit?: string) {
  if (value === null || value === undefined) {
    return 'Data pending';
  }

  const formatted = value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return unit ? `${formatted}${unit}` : formatted;
}

function makeQuiz(myths: string[], materialName: string) {
  const myth = myths[0] ?? `${materialName} is always accepted in every recycling bin.`;
  return {
    question: myth.replace(/\.$/, '?'),
    answer: false,
  };
}

function makeActionItem(objectName: string, materialName: string) {
  if (/cup|mug|coffee|soda/i.test(objectName)) {
    return `Switch to a reusable ceramic mug. It can beat ${materialName.toLowerCase()} waste after repeated use.`;
  }

  return `Choose a durable reusable option before buying another ${objectName.toLowerCase()}.`;
}

export default App;
