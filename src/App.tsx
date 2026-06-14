import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpFromLine,
  Award,
  CalendarDays,
  Check,
  Flame,
  GraduationCap,
  List,
  Lock,
  ScanFace,
  Sprout,
  Boxes,
  User,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  type AppData,
  type MaterialDetail,
  type ObjectCard,
  findMaterialDetail,
  getFallbackData,
  loadAppData,
  subscribeToScanUpdates,
  DEMO_USER_ID,
} from './data';
import {
  type GeneratedContent,
  ensureObjectImage,
  loadGeneratedContent,
  prefetchObjectImages,
  subscribeToGeneratedImages,
} from './generatedContent';

type Screen = 'splash' | 'main' | 'detail';
type MainTab = 'learn' | 'log' | 'quests' | 'profile';

type QuestTone = 'teal' | 'green' | 'blue' | 'yellow' | 'red';

type QuestStatus = 'locked' | 'active' | 'completed';

type Quest = {
  id: string;
  title: string;
  description: string;
  current: number;
  target: number;
  completed: boolean;
  unlocked: boolean;
  status: QuestStatus;
  unlockHint?: string;
  Icon: LucideIcon;
  tone: QuestTone;
};
type SortMode = 'date' | 'type';

type ScanGroup = {
  key: string;
  label: string;
  objects: ObjectCard[];
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

const memberSinceFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
});

const joinedDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const logTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [mainTab, setMainTab] = useState<MainTab>('learn');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [appData, setAppData] = useState<AppData>(getFallbackData());
  const [isLoading, setIsLoading] = useState(true);
  const [objectImages, setObjectImages] = useState<Record<string, string | null>>({});

  const refreshAppData = useCallback(async () => {
    const data = await loadAppData();
    setAppData(data);
    setIsLoading(false);
    return data;
  }, []);

  useEffect(() => {
    void refreshAppData();
  }, [refreshAppData]);

  useEffect(() => {
    return subscribeToScanUpdates(() => {
      void refreshAppData();
    });
  }, [refreshAppData]);

  useEffect(() => {
    return subscribeToGeneratedImages((objectId, imageUrl) => {
      setObjectImages((current) => ({ ...current, [objectId]: imageUrl }));
    });
  }, []);

  useEffect(() => {
    if (isLoading || appData.isFallback || appData.objects.length === 0) {
      return;
    }

    let isCancelled = false;

    async function syncImages() {
      const cachedImages = await prefetchObjectImages(appData.objects, appData.materialDetails);
      if (isCancelled) {
        return;
      }

      setObjectImages((current) => ({ ...current, ...cachedImages }));

      for (const object of appData.objects) {
        if (isCancelled || cachedImages[object.object_id]) {
          continue;
        }

        const imageUrl = await ensureObjectImage(object, appData.materialDetails);
        if (isCancelled || !imageUrl) {
          continue;
        }

        setObjectImages((current) => ({ ...current, [object.object_id]: imageUrl }));
      }
    }

    void syncImages();

    return () => {
      isCancelled = true;
    };
  }, [appData.isFallback, appData.materialDetails, appData.objects, isLoading]);

  const selectedObject = useMemo(
    () => appData.objects.find((object) => object.object_id === selectedObjectId) ?? appData.objects[0],
    [appData.objects, selectedObjectId],
  );

  const openDetail = (object: ObjectCard) => {
    setSelectedObjectId(object.object_id);
    setScreen('detail');
  };

  if (screen === 'splash') {
    return <SplashScreen onEnter={() => setScreen('main')} />;
  }

  if (screen === 'detail' && selectedObject) {
    return (
      <DetailScreen
        key={selectedObject.object_id}
        object={selectedObject}
        materialDetails={appData.materialDetails}
        initialImageUrl={objectImages[selectedObject.object_id]}
        onBack={() => setScreen('main')}
      />
    );
  }

  return (
    <main className="phone-frame app-screen">
      {mainTab === 'profile' ? (
        <ProfileScreen data={appData} />
      ) : mainTab === 'log' ? (
        <LogScreen
          data={appData}
          isLoading={isLoading}
          objectImages={objectImages}
          onOpenDetail={openDetail}
        />
      ) : mainTab === 'quests' ? (
        <QuestsScreen data={appData} />
      ) : (
        <LearnScreen
          data={appData}
          isLoading={isLoading}
          objectImages={objectImages}
          onOpenDetail={openDetail}
        />
      )}
      <BottomTabs activeTab={mainTab} onTabChange={setMainTab} />
    </main>
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
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const scanGroups = useMemo(
    () => (sortMode === 'date' ? buildDayGroups(data.objects) : buildTypeGroups(data.objects)),
    [data.objects, sortMode],
  );

  return (
    <section className="learn-page">
      <p className="hello">Hello {data.user.display_name}!</p>
      <h1>See Your Previous Scans</h1>

      <div className="sort-row" aria-label="Sort scans">
        <span>SORT BY</span>
        <button
          className={`pill${sortMode === 'type' ? ' active' : ' muted'}`}
          type="button"
          onClick={() => setSortMode('type')}
        >
          By Type
        </button>
        <button
          className={`pill${sortMode === 'date' ? ' active' : ' muted'}`}
          type="button"
          onClick={() => setSortMode('date')}
        >
          By Date
        </button>
      </div>

      {data.isFallback && (
        <p className="data-note">
          Demo mode: add Supabase env values to read Snap cloud scan data.
        </p>
      )}

      <section
        className={`timeline${scanGroups.length === 1 ? ' timeline--single' : ''}`}
        aria-busy={isLoading}
      >
        {scanGroups.map((group) => (
          <article className="day-group" key={group.key}>
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
                      <small>
                        {sortMode === 'type'
                          ? shortDateFormatter.format(new Date(object.created_at))
                          : object.display_name}
                      </small>
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
  );
}

function LogScreen({
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
  const entries = useMemo(
    () =>
      [...data.objects].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [data.objects],
  );

  return (
    <section className="log-page">
      <h1>Scan Log</h1>
      <p className="log-summary">
        {entries.length} scan{entries.length === 1 ? '' : 's'} recorded
      </p>

      {data.isFallback && (
        <p className="data-note">
          Demo mode: add Supabase env values to read Snap cloud scan data.
        </p>
      )}

      {!data.isFallback && entries.length === 0 && (
        <p className="data-note">
          Connected to Supabase, but no scans found for this user yet. Scan with Spectacles to
          populate your log.
        </p>
      )}

      <section className="log-list" aria-busy={isLoading}>
        {entries.length === 0 ? (
          <div className="empty-card log-empty">No Items Scanned :(</div>
        ) : (
          entries.map((object) => (
            <button
              className="log-entry"
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
              <span className="log-entry-copy">
                <small>{object.display_name}</small>
                <strong>{object.detected_materials.join(', ')}</strong>
                <time dateTime={object.created_at}>
                  {logTimeFormatter.format(new Date(object.created_at))}
                </time>
              </span>
            </button>
          ))
        )}
      </section>
    </section>
  );
}

function QuestsScreen({ data }: { data: AppData }) {
  const quests = useMemo(() => buildQuests(data.objects), [data.objects]);
  const completedCount = quests.filter((quest) => quest.completed).length;
  const unlockedCount = quests.filter((quest) => quest.unlocked).length;

  return (
    <section className="quests-page">
      <h1>Quests</h1>
      <p className="quests-summary">
        {completedCount} of {quests.length} completed · {unlockedCount} unlocked
      </p>

      {data.isFallback && (
        <p className="data-note">
          Demo mode: quest progress uses local scan data until Supabase is connected.
        </p>
      )}

      {!data.isFallback && data.objects.length === 0 && (
        <p className="data-note">
          Connected to Supabase, but no scans found yet. Complete your first scan to start
          unlocking quests.
        </p>
      )}

      <section className="quest-list">
        {quests.map((quest) => (
          <article
            className={`quest-card quest-card--${quest.tone} quest-card--${quest.status}`}
            key={quest.id}
          >
            <div className="quest-card-head">
              <div className="quest-icon-wrap">
                <span aria-hidden="true" className={`quest-icon quest-icon--${quest.tone}`}>
                  {quest.status === 'locked' ? (
                    <Lock size={22} strokeWidth={2.1} />
                  ) : (
                    <quest.Icon size={22} strokeWidth={2.1} />
                  )}
                </span>
                {quest.status === 'completed' && (
                  <span aria-label="Completed" className="quest-complete-badge">
                    <Check size={12} strokeWidth={2.8} />
                  </span>
                )}
              </div>
              <div>
                <h2>{quest.title}</h2>
                <p>{quest.status === 'locked' ? quest.unlockHint : quest.description}</p>
              </div>
            </div>
            {quest.status === 'locked' ? (
              <div className="quest-locked-row">
                <Lock aria-hidden size={14} strokeWidth={2.2} />
                <span>Locked</span>
              </div>
            ) : (
              <div className="quest-progress">
                <div aria-hidden="true" className="quest-progress-bar">
                  <span style={{ width: `${Math.min(100, (quest.current / quest.target) * 100)}%` }} />
                </div>
                <span className="quest-progress-label">
                  {quest.current}/{quest.target}
                </span>
              </div>
            )}
          </article>
        ))}
      </section>
    </section>
  );
}

function ProfileScreen({ data }: { data: AppData }) {
  const { user, objects, isFallback } = data;
  const uniqueMaterials = useMemo(
    () => new Set(objects.flatMap((object) => object.detected_materials)).size,
    [objects],
  );
  const joinedDate = joinedDateFormatter.format(new Date(user.created_at));
  const memberSince = memberSinceFormatter.format(new Date(user.created_at));

  return (
    <section className="profile-page">
      <h1>Profile</h1>

      <div className="profile-hero">
        <div aria-hidden="true" className="profile-avatar">
          <User size={42} strokeWidth={1.8} />
        </div>
        <h2>{user.display_name}</h2>
        <p className="profile-subtitle">Member since {memberSince}</p>
      </div>

      <section className="profile-section">
        <h3>Your activity</h3>
        <div className="profile-stats">
          <article className="profile-stat">
            <strong>{objects.length}</strong>
            <span>Scans logged</span>
          </article>
          <article className="profile-stat">
            <strong>{uniqueMaterials}</strong>
            <span>Materials tracked</span>
          </article>
        </div>
      </section>

      <section className="profile-section">
        <h3>Account</h3>
        <dl className="profile-details">
          <div>
            <dt>Display name</dt>
            <dd>{user.display_name}</dd>
          </div>
          <div>
            <dt>User ID</dt>
            <dd>{DEMO_USER_ID}</dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{joinedDate}</dd>
          </div>
        </dl>
      </section>

      {isFallback && (
        <p className="data-note">
          Demo mode: add Supabase env values to read Snap cloud user data.
        </p>
      )}
    </section>
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
  const materialName = activeDetail?.material.display_name ?? activeMaterialName;
  const quiz = activeGenerated
    ? withObjectQuizContext(
        {
          question: activeGenerated.quiz_question,
          answer: activeGenerated.quiz_answer,
          explanation: activeGenerated.quiz_explanation,
        },
        object.display_name,
        materialName,
      )
    : makeQuiz(activeDetail?.material.myths ?? [], object.display_name, materialName);
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
            <span className={`info-card-icon-wrap ${item.tone}`}>
              <img src={item.iconSrc} alt="" />
            </span>
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
        <ArrowUpFromLine aria-hidden size={22} strokeWidth={2.2} />
      </div>
      <span>UPSTREAM ACTION</span>
      <h2>{action}</h2>
    </section>
  );
}

function BottomTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
}) {
  const tabs = [
    ['Learn', GraduationCap, 'learn'],
    ['Log', List, 'log'],
    ['Quests', Award, 'quests'],
    ['Profile', User, 'profile'],
  ] as const;

  return (
    <nav className="bottom-tabs" aria-label="Matterly tabs">
      {tabs.map(([label, Icon, tabId]) => (
        <button
          className={tabId === activeTab ? 'active' : ''}
          key={label}
          type="button"
          disabled={!tabId}
          onClick={() => tabId && onTabChange(tabId)}
        >
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

function buildDayGroups(objects: ObjectCard[]): ScanGroup[] {
  if (objects.length === 0) {
    return [];
  }

  const sortedObjects = [...objects].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const newest = startOfDay(new Date(sortedObjects[0].created_at));
  const oldest = startOfDay(new Date(sortedObjects[sortedObjects.length - 1].created_at));
  const groups: ScanGroup[] = [];

  for (let date = newest; date >= oldest; date = addDays(date, -1)) {
    const isoDate = localDateKey(date);
    groups.push({
      key: isoDate,
      label: dateFormatter.format(date).replace(/(\d+)$/, (_, day) => ordinal(Number(day))),
      objects: sortedObjects
        .filter((object) => localDateKey(new Date(object.created_at)) === isoDate)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    });
  }

  return groups;
}

function buildTypeGroups(objects: ObjectCard[]): ScanGroup[] {
  if (objects.length === 0) {
    return [];
  }

  const byType = new Map<string, ObjectCard[]>();

  for (const object of objects) {
    const label = object.display_name.trim() || 'Unknown';
    byType.set(label, [...(byType.get(label) ?? []), object]);
  }

  return Array.from(byType.entries())
    .map(([label, groupObjects]) => {
      const sortedObjects = [...groupObjects].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      return {
        key: label,
        label,
        objects: sortedObjects,
        latestAt: new Date(sortedObjects[0].created_at).getTime(),
      };
    })
    .sort((a, b) => b.latestAt - a.latestAt)
    .map(({ key, label, objects }) => ({ key, label, objects }));
}

function buildQuests(objects: ObjectCard[]): Quest[] {
  const scanCount = objects.length;
  const uniqueMaterials = new Set(objects.flatMap((object) => object.detected_materials)).size;
  const uniqueTypes = new Set(objects.map((object) => object.display_name.trim())).size;
  const uniqueDays = new Set(objects.map((object) => localDateKey(new Date(object.created_at)))).size;

  const questDefs: {
    id: string;
    title: string;
    description: string;
    current: number;
    target: number;
    Icon: LucideIcon;
    tone: QuestTone;
    unlockAfter?: string;
    unlockHint: string;
  }[] = [
    {
      id: 'first-scan',
      title: 'First Scan',
      description: 'Log your first object scan in Matterly.',
      current: scanCount,
      target: 1,
      Icon: ScanFace,
      tone: 'teal',
      unlockHint: 'Complete First Scan to unlock.',
    },
    {
      id: 'material-explorer',
      title: 'Material Explorer',
      description: 'Track 3 different materials across your scans.',
      current: uniqueMaterials,
      target: 3,
      Icon: Sprout,
      tone: 'green',
      unlockAfter: 'first-scan',
      unlockHint: 'Complete First Scan to unlock.',
    },
    {
      id: 'object-variety',
      title: 'Object Variety',
      description: 'Scan 2 different kinds of objects.',
      current: uniqueTypes,
      target: 2,
      Icon: Boxes,
      tone: 'blue',
      unlockAfter: 'material-explorer',
      unlockHint: 'Complete Material Explorer to unlock.',
    },
    {
      id: 'consistent-logger',
      title: 'Consistent Logger',
      description: 'Scan objects on 2 different days.',
      current: uniqueDays,
      target: 2,
      Icon: CalendarDays,
      tone: 'yellow',
      unlockAfter: 'object-variety',
      unlockHint: 'Complete Object Variety to unlock.',
    },
    {
      id: 'scan-streak',
      title: 'Scan Streak',
      description: 'Log 3 total scans to build your material history.',
      current: scanCount,
      target: 3,
      Icon: Flame,
      tone: 'red',
      unlockAfter: 'consistent-logger',
      unlockHint: 'Complete Consistent Logger to unlock.',
    },
  ];

  const completionById = Object.fromEntries(
    questDefs.map((quest) => [quest.id, quest.current >= quest.target]),
  );

  return questDefs.map((quest) => {
    const completed = completionById[quest.id];
    const unlocked = !quest.unlockAfter || completionById[quest.unlockAfter];
    const status: QuestStatus = completed ? 'completed' : unlocked ? 'active' : 'locked';

    return {
      id: quest.id,
      title: quest.title,
      description: quest.description,
      current: unlocked ? Math.min(quest.current, quest.target) : 0,
      target: quest.target,
      completed,
      unlocked,
      status,
      unlockHint: quest.unlockHint,
      Icon: quest.Icon,
      tone: quest.tone,
    };
  });
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

function makeQuiz(myths: string[], objectName: string, materialName: string) {
  const myth = myths[0];

  if (myth) {
    const statement = myth.replace(/\.$/, '').trim();
    return {
      question: `True or false: For this ${objectName}, ${statement.charAt(0).toLowerCase()}${statement.slice(1)}?`,
      answer: false,
      explanation: `This ${objectName} contains ${materialName}. ${myth}`,
    };
  }

  return {
    question: `True or false: The ${materialName} in this ${objectName} can always go in your usual recycling bin?`,
    answer: false,
    explanation: `${objectName} often combines ${materialName} with other parts, which changes how it should be sorted.`,
  };
}

function withObjectQuizContext(
  quiz: { question: string; answer: boolean; explanation?: string | null },
  objectName: string,
  materialName: string,
) {
  const mentionsObject = new RegExp(objectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(
    quiz.question,
  );
  const mentionsMaterial = new RegExp(materialName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(
    quiz.question,
  );

  if (mentionsObject && mentionsMaterial) {
    return quiz;
  }

  const normalizedQuestion = quiz.question.trim().replace(/\?*$/, '');
  return {
    ...quiz,
    question: `For this ${objectName} (${materialName}), ${normalizedQuestion.charAt(0).toLowerCase()}${normalizedQuestion.slice(1)}?`,
    explanation:
      quiz.explanation ??
      `Think about how ${materialName} shows up in a ${objectName}, not just on its own.`,
  };
}

function makeActionItem(objectName: string, materialName: string) {
  if (/cup|mug|coffee|soda/i.test(objectName)) {
    return `Switch to a reusable ceramic mug. It can beat ${materialName.toLowerCase()} waste after repeated use.`;
  }

  return `Choose a durable reusable option before buying another ${objectName.toLowerCase()}.`;
}

export default App;
